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

describe("users", () => {
  it("401 without a token", async () => {
    const response = await app.request("/api/v1/users", {}, env);
    expect(response.status).toBe(401);
  });

  it("creates a user with generated UUID and defaults", async () => {
    const { token } = await setupOwner(app, env);
    const created = await authed("POST", "/api/v1/users", token, { username: "alice" });
    expect(created.status).toBe(201);
    const user = (await created.json()) as {
      id: string;
      uuid: string;
      status: string;
      quotaBytes: number;
      ipLimit: number;
      expiryAt: null;
      usedBytes: number;
    };
    expect(user.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.status).toBe("active");
    expect(user.quotaBytes).toBe(0);
    expect(user.usedBytes).toBe(0);
    expect(user.ipLimit).toBe(0);
    expect(user.expiryAt).toBeNull();
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    const { token } = await setupOwner(app, env);
    await authed("POST", "/api/v1/users", token, { username: "alice" });
    const duplicate = await authed("POST", "/api/v1/users", token, { username: "ALICE" });
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { error: { code: string } }).error.code).toBe("USERNAME_TAKEN");
  });

  it("validates the body", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("POST", "/api/v1/users", token, {})).status).toBe(400);
    expect((await authed("POST", "/api/v1/users", token, { username: "a", quotaBytes: -1 })).status).toBe(400);
    expect((await authed("POST", "/api/v1/users", token, { username: "a", status: "bogus" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/users", token, { username: "a", expiryAt: "soon" })).status).toBe(400);
  });

  it("lists with search, status filter and pagination", async () => {
    const { token } = await setupOwner(app, env);
    await authed("POST", "/api/v1/users", token, { username: "alice", note: "vip customer" });
    await authed("POST", "/api/v1/users", token, { username: "bob", status: "disabled" });
    await authed("POST", "/api/v1/users", token, { username: "carol" });

    const search = await authed("GET", "/api/v1/users?search=vip", token);
    const searchData = (await search.json()) as { data: { username: string }[]; meta: { total: number } };
    expect(searchData.data.map((user) => user.username)).toEqual(["alice"]);

    // LIKE wildcards in the search term are literal, not match-all.
    const wildcard = await authed("GET", "/api/v1/users?search=%25", token);
    expect(((await wildcard.json()) as { data: unknown[] }).data).toHaveLength(0);

    const disabled = await authed("GET", "/api/v1/users?status=disabled", token);
    const disabledData = (await disabled.json()) as { data: { username: string }[] };
    expect(disabledData.data.map((user) => user.username)).toEqual(["bob"]);

    const page = await authed("GET", "/api/v1/users?page=2&perPage=2", token);
    const pageData = (await page.json()) as { data: unknown[]; meta: { page: number; total: number; totalPages: number } };
    expect(pageData.data).toHaveLength(1);
    expect(pageData.meta).toMatchObject({ page: 2, perPage: 2, total: 3, totalPages: 2 });
  });

  it("patches fields and reports USERNAME_TAKEN on a clash", async () => {
    const { token } = await setupOwner(app, env);
    await authed("POST", "/api/v1/users", token, { username: "alice" });
    const bob = await createUser(app, env, token);

    const patched = await authed("PATCH", `/api/v1/users/${bob.id}`, token, {
      note: "updated",
      quotaBytes: 10,
      expiryAt: 1735689600,
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { note: string; quotaBytes: number }).quotaBytes).toBe(10);

    const clash = await authed("PATCH", `/api/v1/users/${bob.id}`, token, { username: "ALICE" });
    expect(clash.status).toBe(409);
    expect(((await clash.json()) as { error: { code: string } }).error.code).toBe("USERNAME_TAKEN");
  });

  it("404s on missing user", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("GET", "/api/v1/users/nope", token)).status).toBe(404);
    expect((await authed("PATCH", "/api/v1/users/nope", token, { note: "x" })).status).toBe(404);
    expect((await authed("DELETE", "/api/v1/users/nope", token)).status).toBe(404);
  });

  it("reset-uuid rotates the credential and rebuilds every config URI", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    const config = await generateConfig(app, env, token, user.id, backend.id);
    expect(config.uri).toContain(user.uuid);

    const reset = await authed("POST", `/api/v1/users/${user.id}/reset-uuid`, token);
    expect(reset.status).toBe(200);
    const updated = (await reset.json()) as { uuid: string };
    expect(updated.uuid).not.toBe(user.uuid);

    const list = await authed("GET", `/api/v1/configs?userId=${user.id}`, token);
    const configs = (await list.json()) as { data: { uri: string }[] };
    expect(configs.data).toHaveLength(1);
    expect(configs.data[0].uri).toContain(updated.uuid);
    expect(configs.data[0].uri).not.toContain(user.uuid);
  });

  it("deletes a user and cascades configs + subscriptions", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    await generateConfig(app, env, token, user.id, backend.id);
    await authed("POST", "/api/v1/subscriptions", token, { userId: user.id, name: "sub", format: "base64" });

    const deleted = await authed("DELETE", `/api/v1/users/${user.id}`, token);
    expect(deleted.status).toBe(204);

    expect((await authed("GET", `/api/v1/users/${user.id}`, token)).status).toBe(404);
    const configs = await authed("GET", `/api/v1/configs?userId=${user.id}`, token);
    expect(((await configs.json()) as { data: unknown[] }).data).toHaveLength(0);
    const subs = await authed("GET", `/api/v1/subscriptions?userId=${user.id}`, token);
    expect((await subs.json()) as unknown[]).toHaveLength(0);
  });
});
