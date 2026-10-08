import { Hono } from "hono";
import {
  NotFoundError,
  ValidationError,
  isValidHost,
  type Backend,
  type EchSettings,
  type FragmentSettings,
} from "@nexpanel/core";
import type { AppEnv } from "../env";
import { jsonError } from "../errors";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";
import { rebuildBackendConfigs } from "../services/configs";

/**
 * /api/v1/backends — upstream proxy servers.
 *
 * GET    /         list (?status=&protocol=)
 * POST   /         create backend
 * PATCH  /:id      update backend, then refresh derived config URIs
 * DELETE /:id      delete backend (cascades configs)
 * POST   /:id/test best-effort reachability probe → { latencyMs }
 *
 * URIs of derived configs are denormalized; PATCH rebuilds them here so
 * a host/port/transport/status change reaches subscriptions immediately.
 */

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks"] as const;
const TRANSPORTS = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"] as const;
const SECURITIES = ["none", "tls", "reality"] as const;
const STATUSES = ["active", "disabled"] as const;
const PROBE_TIMEOUT_MS = 5000;

type BackendFields = Omit<Backend, "id" | "createdAt" | "updatedAt">;

export const backendRoutes = new Hono<AppEnv>();

backendRoutes.use("*", requireAuth);

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }
  throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}.`);
}

function optionalString(value: unknown, field: string, max = 255): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string.`);
  if (value.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return value === "" ? null : value;
}

function requireName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 64) {
    throw new ValidationError("name must be 1-64 characters.");
  }
  return value.trim();
}

/**
 * Reject anything that isn't a bare hostname/IP. Host goes straight into
 * the authority of a config URI (`vless://uuid@host:port`), so a scheme
 * or path here makes proxy clients misparse it: v2rayNG splits on the
 * first `://` and reads the scheme as the address, which surfaces as an
 * empty address and port in the client's config editor.
 */
function requireHost(value: unknown): string {
  const host = optionalString(value, "host");
  if (host === null) throw new ValidationError("host is required.");
  if (!isValidHost(host)) {
    throw new ValidationError("host must be a hostname or IP address without a scheme, port or path.");
  }
  return host;
}

function optionalHost(value: unknown, field: string): string | null {
  const host = optionalString(value, field);
  if (host === null) return null;
  if (!isValidHost(host)) {
    throw new ValidationError(
      `${field} must be a hostname or IP address without a scheme, port or path.`,
    );
  }
  return host;
}

function requirePort(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ValidationError("port must be an integer between 1 and 65535.");
  }
  return value;
}

const FRAGMENT_PACKETS = ["tlshello", "hello-ice", "1-3"] as const;
const FRAGMENT_MODES = ["none", "custom"] as const;

/**
 * Fragment settings for a backend. Validation mirrors the range checks in
 * validateNetworkSettings, but reports backend-scoped codes so the panel can
 * highlight the right form section.
 */
function parseFragment(value: unknown, security: Backend["security"]): FragmentSettings {
  if (value === undefined || value === null) {
    return { mode: "none", packets: "tlshello", lengthMin: 100, lengthMax: 200, delayMin: 1, delayMax: 1, maxSplitMin: 0, maxSplitMax: 0 };
  }
  if (typeof value !== "object") {
    throw new ValidationError("fragment must be an object.");
  }
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === undefined ? "none" : oneOf(raw.mode, FRAGMENT_MODES, "fragment.mode");

  const settings: FragmentSettings = {
    mode,
    packets: raw.packets === undefined ? "tlshello" : oneOf(raw.packets, FRAGMENT_PACKETS, "fragment.packets"),
    lengthMin: requireBoundedInt(raw.lengthMin, "fragment.lengthMin", 20, 1000, 100),
    lengthMax: requireBoundedInt(raw.lengthMax, "fragment.lengthMax", 20, 1000, 200),
    delayMin: requireBoundedInt(raw.delayMin, "fragment.delayMin", 0, 5000, 1),
    delayMax: requireBoundedInt(raw.delayMax, "fragment.delayMax", 0, 5000, 1),
    maxSplitMin: requireBoundedInt(raw.maxSplitMin, "fragment.maxSplitMin", 0, 20, 0),
    maxSplitMax: requireBoundedInt(raw.maxSplitMax, "fragment.maxSplitMax", 0, 20, 0),
  };

  if (settings.lengthMin > settings.lengthMax) {
    throw new ValidationError("fragment.lengthMin must not exceed fragment.lengthMax.");
  }
  if (settings.delayMin > settings.delayMax) {
    throw new ValidationError("fragment.delayMin must not exceed fragment.delayMax.");
  }
  if (settings.maxSplitMin > settings.maxSplitMax) {
    throw new ValidationError("fragment.maxSplitMin must not exceed fragment.maxSplitMax.");
  }

  // Fragmentation rewrites the TLS Client Hello, so it needs a TLS session.
  if (mode === "custom" && security === "none") {
    throw new ValidationError("fragment requires security tls or reality.");
  }
  return settings;
}

/**
 * ECH for a backend. ECH is a TLS extension, so it is rejected outright on
 * plaintext; it also needs an explicit serverName — the record is published
 * under that name, so an empty value would resolve nothing.
 *
 * Per the BPB review, fragment+ECH together is NOT rejected: when both are
 * set, fragment wins at render time and ECH is simply omitted from the
 * output, so there is no conflict error here.
 */
function parseEch(value: unknown, security: Backend["security"]): EchSettings {
  if (value === undefined || value === null) {
    return { enabled: false, serverName: "" };
  }
  if (typeof value !== "object") {
    throw new ValidationError("ech must be an object.");
  }
  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled === undefined ? false : parseEnabled(raw.enabled, "ech.enabled");
  const serverName = optionalString(raw.serverName, "ech.serverName") ?? "";

  if (!enabled) {
    // An unused serverName is harmless; keep it so toggling ECH back on
    // doesn't wipe what the admin typed.
    return { enabled: false, serverName };
  }
  if (security !== "tls") {
    throw new ValidationError("ech requires security tls.");
  }
  if (serverName.trim().length === 0) {
    throw new ValidationError("ech.serverName is required when ECH is enabled.");
  }
  if (!isValidHost(serverName)) {
    throw new ValidationError("ech.serverName must be a hostname.");
  }
  return { enabled: true, serverName };
}

function parseEnabled(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(`${field} must be a boolean.`);
  return value;
}

/**
 * Integer within [min, max], or fallback when the field is absent. Used for
 * fragment ranges, which are optional at every level: absent ⇒ default.
 */
function requireBoundedInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/** Validates every field required for creation. */
function parseCreateBody(body: Record<string, unknown>): BackendFields {
  const security = oneOf(body.security, SECURITIES, "security");
  return {
    name: requireName(body.name),
    protocol: oneOf(body.protocol, PROTOCOLS, "protocol"),
    host: requireHost(body.host),
    port: requirePort(body.port),
    transport: oneOf(body.transport, TRANSPORTS, "transport"),
    security,
    sni: optionalHost(body.sni, "sni"),
    hostHeader: optionalHost(body.hostHeader, "hostHeader"),
    path: optionalString(body.path, "path"),
    serviceName: optionalString(body.serviceName, "serviceName"),
    uuid: optionalString(body.uuid, "uuid"),
    password: optionalString(body.password, "password"),
    method: optionalString(body.method, "method"),
    realityPublicKey: optionalString(body.realityPublicKey, "realityPublicKey"),
    realityShortId: optionalString(body.realityShortId, "realityShortId"),
    fingerprint: optionalString(body.fingerprint, "fingerprint"),
    allowInsecure: body.allowInsecure === undefined ? false : parseBoolean(body.allowInsecure),
    fragment: parseFragment(body.fragment, security),
    ech: parseEch(body.ech, security),
    status: body.status === undefined ? "active" : oneOf(body.status, STATUSES, "status"),
    sortOrder: 0,
  };
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ValidationError("allowInsecure must be a boolean.");
  return value;
}

/**
 * Validates only the fields present on a PATCH body.
 *
 * ECH and fragment validation depend on `security`, which a PATCH may or may
 * not change. The caller passes the *effective* security — the patched value
 * when present, otherwise the stored row — so ECH-on-plaintext is caught even
 * when the request flips ECH alone.
 */
function parsePatchBody(
  body: Record<string, unknown>,
  effectiveSecurity: Backend["security"],
): Partial<BackendFields> {
  const patch: Partial<BackendFields> = {};
  if (body.name !== undefined) patch.name = requireName(body.name);
  if (body.protocol !== undefined) patch.protocol = oneOf(body.protocol, PROTOCOLS, "protocol");
  if (body.host !== undefined) patch.host = requireHost(body.host);
  if (body.port !== undefined) patch.port = requirePort(body.port);
  if (body.transport !== undefined) patch.transport = oneOf(body.transport, TRANSPORTS, "transport");
  if (body.security !== undefined) patch.security = oneOf(body.security, SECURITIES, "security");
  if (body.sni !== undefined) patch.sni = optionalHost(body.sni, "sni");
  if (body.hostHeader !== undefined) patch.hostHeader = optionalHost(body.hostHeader, "hostHeader");
  if (body.path !== undefined) patch.path = optionalString(body.path, "path");
  if (body.serviceName !== undefined) patch.serviceName = optionalString(body.serviceName, "serviceName");
  if (body.uuid !== undefined) patch.uuid = optionalString(body.uuid, "uuid");
  if (body.password !== undefined) patch.password = optionalString(body.password, "password");
  if (body.method !== undefined) patch.method = optionalString(body.method, "method");
  if (body.realityPublicKey !== undefined) {
    patch.realityPublicKey = optionalHost(body.realityPublicKey, "realityPublicKey");
  }
  if (body.realityShortId !== undefined) {
    patch.realityShortId = optionalString(body.realityShortId, "realityShortId");
  }
  if (body.fingerprint !== undefined) patch.fingerprint = optionalString(body.fingerprint, "fingerprint");
  if (body.allowInsecure !== undefined) patch.allowInsecure = parseBoolean(body.allowInsecure);
  if (body.fragment !== undefined) patch.fragment = parseFragment(body.fragment, effectiveSecurity);
  if (body.ech !== undefined) patch.ech = parseEch(body.ech, effectiveSecurity);
  if (body.status !== undefined) patch.status = oneOf(body.status, STATUSES, "status");
  return patch;
}

backendRoutes.get("/", async (c) => {
  const repos = createRepositories(c.env);
  const statusParam = c.req.query("status");
  const protocolParam = c.req.query("protocol");
  const status =
    statusParam && (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as Backend["status"])
      : undefined;
  const backends = await repos.backends.list({ status });
  // protocol is a convenience filter (the frontend sends it); the
  // contract only documents ?status=, so filtering happens here.
  const filtered =
    protocolParam && (PROTOCOLS as readonly string[]).includes(protocolParam)
      ? backends.filter((backend) => backend.protocol === protocolParam)
      : backends;
  return c.json(filtered);
});

backendRoutes.post("/", async (c) => {
  const repos = createRepositories(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = parseCreateBody(body);

  const existing = await repos.backends.list();
  const backend = await repos.backends.create({
    id: crypto.randomUUID(),
    ...fields,
    sortOrder: existing.length + 1,
  });
  return c.json(backend, 201);
});

backendRoutes.patch("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  const stored = await repos.backends.getById(id);
  if (!stored) throw new NotFoundError("Backend");

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  // ECH/fragment validation depends on security, which this PATCH may change
  // in the same request — validate against the security the row will have.
  const effectiveSecurity = body.security === undefined ? stored.security : oneOf(body.security, SECURITIES, "security");
  const backend = await repos.backends.update(id, parsePatchBody(body, effectiveSecurity));

  // configs.uri is denormalized — refresh every derived config so a
  // host/port/transport/status change reaches subscriptions immediately,
  // instead of requiring a manual rebuild per config.
  const { data: derived } = await repos.configs.list({
    backendId: id,
    page: 1,
    perPage: 1000,
  });
  for (const config of await rebuildBackendConfigs(
    derived,
    backend,
    repos.users.getById,
  )) {
    await repos.configs.upsert(config);
  }

  await repos.activity.record({
    id: crypto.randomUUID(),
    messageKey: "dashboard.activity.backendUpdated",
    params: { name: backend.name },
    at: now(),
  });
  return c.json(backend);
});

backendRoutes.delete("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  if (!(await repos.backends.getById(id))) throw new NotFoundError("Backend");
  await repos.backends.delete(id); // configs cascade via FK
  return c.body(null, 204);
});

backendRoutes.post("/:id/test", async (c) => {
  const repos = createRepositories(c.env);
  const backend = await repos.backends.getById(c.req.param("id"));
  if (!backend) throw new NotFoundError("Backend");

  // Best-effort reachability probe over HTTPS. Any HTTP response counts
  // as reachable (proxies answer oddly to HEAD); transport/TLS failures
  // mean unreachable. Works identically on Workers and Node (undici).
  const startedAt = Date.now();
  try {
    await fetch(`https://${backend.host}:${backend.port}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return jsonError(
      c,
      502,
      "BACKEND_UNREACHABLE",
      `No response from ${backend.host}:${backend.port} within ${PROBE_TIMEOUT_MS} ms.`,
    );
  }
  return c.json({ latencyMs: Date.now() - startedAt });
});