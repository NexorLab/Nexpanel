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

describe("configs", () => {
  it("401 without a token", async () => {
    const response = await app.request("/api/v1/configs", {}, env);
    expect(response.status).toBe(401);
  });

  it("generates a URI per user×backend pair", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);

    const generated = await authed("POST", "/api/v1/configs/generate", token, {
      userId: user.id,
      backendIds: [backend.id],
    });
    expect(generated.status).toBe(200);
    const configs = (await generated.json()) as { id: string; uri: string; isActive: boolean; protocol: string }[];
    expect(configs).toHaveLength(1);
    expect(configs[0].uri).toMatch(/^vless:\/\//);
    expect(configs[0].uri).toContain(`@backend.example.com:443`);
    expect(configs[0].uri).toContain(user.uuid);
    expect(configs[0].isActive).toBe(true);
    expect(configs[0].protocol).toBe("vless");
  });

  it("generation is idempotent per pair (upsert keeps one row)", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    const first = await generateConfig(app, env, token, user.id, backend.id);
    const second = await generateConfig(app, env, token, user.id, backend.id);

    expect(second.id).toBe(first.id);
    const list = await authed("GET", `/api/v1/configs?userId=${user.id}`, token);
    const data = (await list.json()) as { meta: { total: number } };
    expect(data.meta.total).toBe(1);
  });

  it("skips unknown and disabled backends during generation", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const disabled = await createBackend(app, env, token, { status: "disabled" });

    const response = await authed("POST", "/api/v1/configs/generate", token, {
      userId: user.id,
      backendIds: [disabled.id, "missing-id"],
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown[]).toHaveLength(0);
  });

  it("404s when generating for a missing user and validates the body", async () => {
    const { token } = await setupOwner(app, env);
    const missingUser = await authed("POST", "/api/v1/configs/generate", token, {
      userId: "nope",
      backendIds: ["x"],
    });
    expect(missingUser.status).toBe(404);

    const noIds = await authed("POST", "/api/v1/configs/generate", token, { userId: "nope" });
    expect(noIds.status).toBe(400);
    const emptyIds = await authed("POST", "/api/v1/configs/generate", token, {
      userId: "nope",
      backendIds: [],
    });
    expect(emptyIds.status).toBe(400);
  });

  it("rebuilds the URI from current user/backend data", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    const config = await generateConfig(app, env, token, user.id, backend.id);
    expect(config.uri).toContain("backend.example.com");

    await authed("PATCH", `/api/v1/backends/${backend.id}`, token, { host: "moved.example.com" });
    // Denormalized until rebuilt:
    const stale = await authed("GET", `/api/v1/configs?backendId=${backend.id}`, token);
    expect((((await stale.json()) as { data: { uri: string }[] }).data)[0].uri).toContain("backend.example.com");

    const rebuilt = await authed("POST", `/api/v1/configs/${config.id}/rebuild`, token);
    expect(rebuilt.status).toBe(200);
    const refreshed = (await rebuilt.json()) as { uri: string; id: string };
    expect(refreshed.uri).toContain("moved.example.com");
    expect(refreshed.id).toBe(config.id);
  });

  it("marks configs inactive when the user is disabled, rebuilt or not", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    await generateConfig(app, env, token, user.id, backend.id);

    await authed("PATCH", `/api/v1/users/${user.id}`, token, { status: "disabled" });
    await authed("POST", "/api/v1/configs/generate", token, { userId: user.id, backendIds: [backend.id] });

    const list = await authed("GET", `/api/v1/configs?userId=${user.id}`, token);
    const configs = (await list.json()) as { data: { isActive: boolean }[] };
    expect(configs.data).toHaveLength(1);
    expect(configs.data[0].isActive).toBe(false);
  });

  it("404s on rebuild of a missing config", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("POST", "/api/v1/configs/nope/rebuild", token)).status).toBe(404);
  });

  it("lists with protocol and search filters and deletes", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const vlessBackend = await createBackend(app, env, token, { name: "vless-srv" });
    const trojanBackend = await createBackend(app, env, token, {
      name: "trojan-srv",
      protocol: "trojan",
      security: "none",
      sni: undefined,
      path: undefined,
    });
    await generateConfig(app, env, token, user.id, vlessBackend.id);
    await generateConfig(app, env, token, user.id, trojanBackend.id);

    const vless = await authed("GET", "/api/v1/configs?protocol=vless", token);
    expect(((await vless.json()) as { data: unknown[] }).data).toHaveLength(1);

    const bySearch = await authed("GET", "/api/v1/configs?search=trojan-srv", token);
    expect(((await bySearch.json()) as { data: unknown[] }).data).toHaveLength(1);

    const all = await authed("GET", "/api/v1/configs", token);
    const allData = (await all.json()) as { data: { id: string }[]; meta: { total: number } };
    expect(allData.meta.total).toBe(2);

    const deleted = await authed("DELETE", `/api/v1/configs/${allData.data[0].id}`, token);
    expect(deleted.status).toBe(204);
    const after = await authed("GET", "/api/v1/configs", token);
    expect(((await after.json()) as { meta: { total: number } }).meta.total).toBe(1);
  });
});
