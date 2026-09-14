import { Hono } from "hono";
import { NotFoundError, ValidationError, type Backend } from "@nexpanel/core";
import type { AppEnv } from "../env";
import { jsonError } from "../errors";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";

/**
 * /api/v1/backends — upstream proxy servers.
 *
 * GET    /         list (?status=&protocol=)
 * POST   /         create backend
 * PATCH  /:id      update backend
 * DELETE /:id      delete backend (cascades configs)
 * POST   /:id/test best-effort reachability probe → { latencyMs }
 *
 * URIs of derived configs are denormalized: after PATCH, clients call
 * POST /configs/:id/rebuild (or generate) to refresh them — the API
 * never rewrites URIs implicitly.
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

function requireHost(value: unknown): string {
  const host = optionalString(value, "host");
  if (!host) throw new ValidationError("host is required.");
  return host;
}

function requirePort(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ValidationError("port must be an integer between 1 and 65535.");
  }
  return value;
}

/** Validates every field required for creation. */
function parseCreateBody(body: Record<string, unknown>): BackendFields {
  return {
    name: requireName(body.name),
    protocol: oneOf(body.protocol, PROTOCOLS, "protocol"),
    host: requireHost(body.host),
    port: requirePort(body.port),
    transport: oneOf(body.transport, TRANSPORTS, "transport"),
    security: oneOf(body.security, SECURITIES, "security"),
    sni: optionalString(body.sni, "sni"),
    hostHeader: optionalString(body.hostHeader, "hostHeader"),
    path: optionalString(body.path, "path"),
    serviceName: optionalString(body.serviceName, "serviceName"),
    uuid: optionalString(body.uuid, "uuid"),
    password: optionalString(body.password, "password"),
    method: optionalString(body.method, "method"),
    realityPublicKey: optionalString(body.realityPublicKey, "realityPublicKey"),
    realityShortId: optionalString(body.realityShortId, "realityShortId"),
    fingerprint: optionalString(body.fingerprint, "fingerprint"),
    allowInsecure: body.allowInsecure === undefined ? false : parseBoolean(body.allowInsecure),
    status: body.status === undefined ? "active" : oneOf(body.status, STATUSES, "status"),
    sortOrder: 0,
  };
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ValidationError("allowInsecure must be a boolean.");
  return value;
}

/** Validates only the fields present on a PATCH body. */
function parsePatchBody(body: Record<string, unknown>): Partial<BackendFields> {
  const patch: Partial<BackendFields> = {};
  if (body.name !== undefined) patch.name = requireName(body.name);
  if (body.protocol !== undefined) patch.protocol = oneOf(body.protocol, PROTOCOLS, "protocol");
  if (body.host !== undefined) patch.host = requireHost(body.host);
  if (body.port !== undefined) patch.port = requirePort(body.port);
  if (body.transport !== undefined) patch.transport = oneOf(body.transport, TRANSPORTS, "transport");
  if (body.security !== undefined) patch.security = oneOf(body.security, SECURITIES, "security");
  if (body.sni !== undefined) patch.sni = optionalString(body.sni, "sni");
  if (body.hostHeader !== undefined) patch.hostHeader = optionalString(body.hostHeader, "hostHeader");
  if (body.path !== undefined) patch.path = optionalString(body.path, "path");
  if (body.serviceName !== undefined) patch.serviceName = optionalString(body.serviceName, "serviceName");
  if (body.uuid !== undefined) patch.uuid = optionalString(body.uuid, "uuid");
  if (body.password !== undefined) patch.password = optionalString(body.password, "password");
  if (body.method !== undefined) patch.method = optionalString(body.method, "method");
  if (body.realityPublicKey !== undefined) {
    patch.realityPublicKey = optionalString(body.realityPublicKey, "realityPublicKey");
  }
  if (body.realityShortId !== undefined) {
    patch.realityShortId = optionalString(body.realityShortId, "realityShortId");
  }
  if (body.fingerprint !== undefined) patch.fingerprint = optionalString(body.fingerprint, "fingerprint");
  if (body.allowInsecure !== undefined) patch.allowInsecure = parseBoolean(body.allowInsecure);
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
  if (!(await repos.backends.getById(id))) throw new NotFoundError("Backend");

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const backend = await repos.backends.update(id, parsePatchBody(body));

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
