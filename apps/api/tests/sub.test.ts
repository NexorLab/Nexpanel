import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createSqliteD1 } from "./sqlite-d1";
import { bearer, setupOwner } from "./helpers";
import { createBackend, createUser, createSubscription, generateConfig } from "./fixtures";

let app: ReturnType<typeof createApp>;
let env: { DB: Env["DB"]; JWT_SECRET: string };

beforeEach(() => {
  app = createApp();
  env = { DB: createSqliteD1() as unknown as Env["DB"], JWT_SECRET: "test-secret-for-jwt-signing" };
});

function authed(method: string, path: string, token: string, body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", ...bearer(token) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}

/** Seed: one active user, one vless+ws+tls backend, one generated config. */
async function seed() {
  const { token } = await setupOwner(app, env);
  const user = await createUser(app, env, token);
  const backend = await createBackend(app, env, token);
  const config = await generateConfig(app, env, token, user.id, backend.id);
  const subscription = await createSubscription(app, env, token, user.id);
  return { token, user, backend, config, subscription };
}

describe("GET /sub/:token (public delivery)", () => {
  it("delivers base64 by default and on access updates the counters", async () => {
    const { token, user, subscription } = await seed();

    const first = await app.request(`/sub/${subscription.token}`, {}, env);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/plain");
    const plain = atob((await first.text()).trim());
    expect(plain).toContain(`vless://${user.uuid}@backend.example.com:443`);

    const second = await app.request(`/sub/${subscription.token}`, {}, env);
    expect(second.status).toBe(200);

    const listed = await authed("GET", `/api/v1/subscriptions?userId=${user.id}`, token);
    const data = (await listed.json()) as { accessCount: number; lastAccessAt: number | null }[];
    expect(data[0].accessCount).toBe(2);
    expect(data[0].lastAccessAt).not.toBeNull();
  });

  it("supports plain and honors the ?format= override", async () => {
    const { user, subscription } = await seed();

    const plain = await app.request(`/sub/${subscription.token}?format=plain`, {}, env);
    expect(plain.status).toBe(200);
    expect(await plain.text()).toContain(`vless://${user.uuid}@backend.example.com:443`);
  });

  it("renders clash YAML", async () => {
    const { user, subscription } = await seed();

    const response = await app.request(`/sub/${subscription.token}?format=clash`, {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/yaml");
    const yaml = await response.text();
    expect(yaml).toContain("proxies:");
    expect(yaml).toContain('type: "vless"');
    expect(yaml).toContain(`uuid: "${user.uuid}"`);
    expect(yaml).toContain("network: \"ws\"");
    expect(yaml).toContain("rules:");
  });

  it("renders sing-box JSON", async () => {
    const { user, subscription } = await seed();

    const response = await app.request(`/sub/${subscription.token}?format=singbox`, {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const doc = JSON.parse(await response.text()) as {
      outbounds: { type: string; server: string; server_port: number; uuid: string; tls?: { server_name: string } }[];
    };
    const outbound = doc.outbounds.find((candidate) => candidate.type === "vless");
    expect(outbound).toMatchObject({
      server: "backend.example.com",
      server_port: 443,
      uuid: user.uuid,
    });
    expect(outbound?.tls?.server_name).toBe("backend.example.com");
  });

  it("404s on an unknown token without auth", async () => {
    const response = await app.request("/sub/deadbeef", {}, env);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("emits ECH in sing-box output when the backend enables it", async () => {
    const { token, user } = await seed();
    const backend = await createBackend(app, env, token, {
      ech: { enabled: true, serverName: "ech.example.com" },
    });
    await generateConfig(app, env, token, user.id, backend.id);
    const subscription = await createSubscription(app, env, token, user.id);

    const response = await app.request(`/sub/${subscription.token}?format=singbox`, {}, env);
    const doc = JSON.parse(await response.text()) as {
      dns: { rules: { domain_suffix?: string[]; query_type?: string[]; server?: string }[] };
      outbounds: { tls?: { ech?: { enabled: boolean; query_server_name: string } } }[];
    };

    const tls = doc.outbounds.find((outbound) => outbound.tls?.ech)?.tls;
    expect(tls?.ech).toEqual({ enabled: true, query_server_name: "ech.example.com" });

    // The HTTPS record must resolve direct, not through the tunnel.
    expect(doc.dns.rules).toContainEqual({
      domain_suffix: ["ech.example.com"],
      query_type: ["HTTPS"],
      action: "route",
      server: "dns-direct",
    });
  });

  it("omits ECH when the backend runs fragment instead", async () => {
    const { token, user } = await seed();
    const backend = await createBackend(app, env, token, {
      fragment: { mode: "custom" },
      ech: { enabled: true, serverName: "ech.example.com" },
    });
    await generateConfig(app, env, token, user.id, backend.id);
    const subscription = await createSubscription(app, env, token, user.id);

    const response = await app.request(`/sub/${subscription.token}?format=singbox`, {}, env);
    const doc = JSON.parse(await response.text()) as {
      outbounds: { tag?: string; tls?: { ech?: unknown; record_fragment?: boolean } }[];
    };
    // Tag, not the first TLS-bearing outbound — the seeded backend also
    // carries TLS and would mask the fragment backend's behaviour.
    const tls = doc.outbounds.find((outbound) => outbound.tag?.startsWith(backend.name))?.tls;

    expect(tls?.ech).toBeUndefined();
    expect(tls?.record_fragment).toBe(true);
  });

  it("404s once the subscription expires", async () => {
    const { token, subscription } = await seed();
    const past = 1; // unix second in the past
    const patched = await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, {
      expiresAt: past,
    });
    expect(patched.status).toBe(200);
    expect((await app.request(`/sub/${subscription.token}`, {}, env)).status).toBe(404);
  });

  it("delivers nothing for a disabled user (fail closed)", async () => {
    const { token, user, subscription } = await seed();
    await authed("PATCH", `/api/v1/users/${user.id}`, token, { status: "disabled" });

    const response = await app.request(`/sub/${subscription.token}?format=plain`, {}, env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("includes inactive configs only when includeInactive is set", async () => {
    const { token, user, backend, subscription } = await seed();
    await authed("PATCH", `/api/v1/users/${user.id}`, token, { status: "disabled" });
    await authed("POST", "/api/v1/configs/generate", token, { userId: user.id, backendIds: [backend.id] });
    await authed("PATCH", `/api/v1/users/${user.id}`, token, { status: "active" });

    // Config is stale-inactive; default delivery skips it.
    const strict = await app.request(`/sub/${subscription.token}?format=plain`, {}, env);
    expect(await strict.text()).toBe("");

    await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, { includeInactive: true });
    const loose = await app.request(`/sub/${subscription.token}?format=plain`, {}, env);
    expect(await loose.text()).toContain(`vless://${user.uuid}`);
  });

  it("PATCH validate: unknown format is rejected", async () => {
    const { token, subscription } = await seed();
    const response = await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, {
      format: "surge",
    });
    expect(response.status).toBe(400);
  });
});
