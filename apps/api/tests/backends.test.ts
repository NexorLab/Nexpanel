import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createSqliteD1 } from "./sqlite-d1";
import { bearer, setupOwner } from "./helpers";
import { createBackend, createUser, generateConfig } from "./fixtures";

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

const VALID_BODY = {
  name: "srv1",
  protocol: "vless",
  host: "backend.example.com",
  port: 443,
  transport: "ws",
  security: "tls",
  sni: "backend.example.com",
  path: "/ws",
};

describe("backends", () => {
  it("401 without a token", async () => {
    const response = await app.request("/api/v1/backends", {}, env);
    expect(response.status).toBe(401);
  });

  it("creates a backend with defaults", async () => {
    const { token } = await setupOwner(app, env);
    const created = await authed("POST", "/api/v1/backends", token, VALID_BODY);
    expect(created.status).toBe(201);
    const backend = (await created.json()) as { status: string; allowInsecure: boolean; sortOrder: number };
    expect(backend.status).toBe("active");
    expect(backend.allowInsecure).toBe(false);
    expect(backend.sortOrder).toBe(1);
  });

  it("rejects duplicate names", async () => {
    const { token } = await setupOwner(app, env);
    await authed("POST", "/api/v1/backends", token, VALID_BODY);
    const duplicate = await authed("POST", "/api/v1/backends", token, VALID_BODY);
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { error: { code: string } }).error.code).toBe("NAME_TAKEN");
  });

  it("validates protocol/transport/security/port", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("POST", "/api/v1/backends", token, { ...VALID_BODY, protocol: "wireguard" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/backends", token, { ...VALID_BODY, transport: "quic" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/backends", token, { ...VALID_BODY, security: "mtls" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/backends", token, { ...VALID_BODY, port: 70000 })).status).toBe(400);
    expect((await authed("POST", "/api/v1/backends", token, { ...VALID_BODY, host: "" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/backends", token, { ...VALID_BODY, name: "" })).status).toBe(400);
  });

  it("lists with status and protocol filters", async () => {
    const { token } = await setupOwner(app, env);
    await createBackend(app, env, token, { name: "a", protocol: "vless" });
    await createBackend(app, env, token, { name: "b", protocol: "trojan" });
    await createBackend(app, env, token, { name: "c", protocol: "vless", status: "disabled" });

    const all = (await (await authed("GET", "/api/v1/backends", token)).json()) as { name: string }[];
    expect(all).toHaveLength(3);

    const active = (await (await authed("GET", "/api/v1/backends?status=active", token)).json()) as { name: string }[];
    expect(active.map((backend) => backend.name).sort()).toEqual(["a", "b"]);

    const vless = (await (await authed("GET", "/api/v1/backends?protocol=vless", token)).json()) as { name: string }[];
    expect(vless.map((backend) => backend.name).sort()).toEqual(["a", "c"]);
  });

  it("patches fields and reports NAME_TAKEN on a rename clash", async () => {
    const { token } = await setupOwner(app, env);
    await createBackend(app, env, token, { name: "taken" });
    const backend = await createBackend(app, env, token, { name: "mine" });

    const patched = await authed("PATCH", `/api/v1/backends/${backend.id}`, token, {
      host: "new.example.com",
      port: 8443,
      allowInsecure: true,
    });
    expect(patched.status).toBe(200);
    const updated = (await patched.json()) as { host: string; port: number; allowInsecure: boolean };
    expect(updated).toMatchObject({ host: "new.example.com", port: 8443, allowInsecure: true });

    const clash = await authed("PATCH", `/api/v1/backends/${backend.id}`, token, { name: "taken" });
    expect(clash.status).toBe(409);
    expect(((await clash.json()) as { error: { code: string } }).error.code).toBe("NAME_TAKEN");
  });

  it("404s on missing backend", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("PATCH", "/api/v1/backends/nope", token, { host: "h" })).status).toBe(404);
    expect((await authed("DELETE", "/api/v1/backends/nope", token)).status).toBe(404);
    expect((await authed("POST", "/api/v1/backends/nope/test", token)).status).toBe(404);
  });

  it("reports BACKEND_UNREACHABLE (502) when the probe fails", async () => {
    const { token } = await setupOwner(app, env);
    // Port 1 on loopback refuses instantly — the probe fails fast.
    const backend = await createBackend(app, env, token, { host: "127.0.0.1", port: 1 });
    const response = await authed("POST", `/api/v1/backends/${backend.id}/test`, token);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("BACKEND_UNREACHABLE");
  });

  it("deletes a backend and cascades its configs", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    await generateConfig(app, env, token, user.id, backend.id);

    const deleted = await authed("DELETE", `/api/v1/backends/${backend.id}`, token);
    expect(deleted.status).toBe(204);

    const configs = await authed("GET", `/api/v1/configs?backendId=${backend.id}`, token);
    expect(((await configs.json()) as { data: unknown[] }).data).toHaveLength(0);
  });
});
