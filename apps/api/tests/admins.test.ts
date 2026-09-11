import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createFakeD1 } from "./fake-d1";
import { bearer, setupOwner } from "./helpers";

let app: ReturnType<typeof createApp>;
let env: { DB: Env["DB"]; JWT_SECRET: string };

beforeEach(() => {
  app = createApp();
  env = { DB: createFakeD1() as unknown as Env["DB"], JWT_SECRET: "test-secret-for-jwt-signing" };
});

function json(method: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}

describe("admins authorization", () => {
  it("401 without a token", async () => {
    const response = await app.request("/api/v1/admins", {}, env);
    expect(response.status).toBe(401);
  });

  it("viewer can list but cannot mutate", async () => {
    const { token } = await setupOwner(app, env);
    const created = await json(
      "POST",
      "/api/v1/admins",
      { username: "watcher", password: "password123", role: "viewer" },
      bearer(token),
    );
    const viewer = (await created.json()) as { id: string };
    const viewerLogin = await json("POST", "/api/v1/auth/login", {
      username: "watcher",
      password: "password123",
    });
    const viewerToken = ((await viewerLogin.json()) as { token: string }).token;

    const list = await app.request("/api/v1/admins", { headers: bearer(viewerToken) }, env);
    expect(list.status).toBe(200);

    expect(
      (await json("POST", "/api/v1/admins", { username: "x2", password: "password123", role: "admin" }, bearer(viewerToken))).status,
    ).toBe(403);
    expect((await json("PATCH", `/api/v1/admins/${viewer.id}`, { isActive: true }, bearer(viewerToken))).status).toBe(403);
    expect((await json("DELETE", `/api/v1/admins/${viewer.id}`, undefined, bearer(viewerToken))).status).toBe(403);
  });
});

describe("admins CRUD", () => {
  it("creates an admin and rejects case-insensitive duplicates", async () => {
    const { token } = await setupOwner(app, env);
    const created = await json(
      "POST",
      "/api/v1/admins",
      { username: "operator", password: "password123", role: "admin" },
      bearer(token),
    );
    expect(created.status).toBe(201);

    const duplicate = await json(
      "POST",
      "/api/v1/admins",
      { username: "OPERATOR", password: "password123", role: "admin" },
      bearer(token),
    );
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { error: { code: string } }).error.code).toBe(
      "USERNAME_TAKEN",
    );
  });

  it("rejects demoting the last owner (LAST_OWNER)", async () => {
    const { token } = await setupOwner(app, env);
    // fetch own admin id from the list:
    const list = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    const admins = (await list.json()) as { id: string; role: string }[];
    const me = admins.find((candidate) => candidate.role === "owner")!;

    const demote = await json("PATCH", `/api/v1/admins/${me.id}`, { role: "admin" }, bearer(token));
    expect(demote.status).toBe(409);
    expect(((await demote.json()) as { error: { code: string } }).error.code).toBe("LAST_OWNER");
  });

  it("rejects deactivating yourself (CONFLICT)", async () => {
    const { token } = await setupOwner(app, env);
    const list = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    const admins = (await list.json()) as { id: string; role: string }[];
    const me = admins.find((candidate) => candidate.role === "owner")!;

    const response = await json("PATCH", `/api/v1/admins/${me.id}`, { isActive: false }, bearer(token));
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("CONFLICT");
  });

  it("deactivating a second admin takes effect immediately (DB-authoritative auth)", async () => {
    const { token } = await setupOwner(app, env);
    const created = await json(
      "POST",
      "/api/v1/admins",
      { username: "operator", password: "password123", role: "admin" },
      bearer(token),
    );
    const operator = (await created.json()) as { id: string };
    const operatorLogin = await json("POST", "/api/v1/auth/login", {
      username: "operator",
      password: "password123",
    });
    const operatorToken = ((await operatorLogin.json()) as { token: string }).token;

    const deactivate = await json("PATCH", `/api/v1/admins/${operator.id}`, { isActive: false }, bearer(token));
    expect(deactivate.status).toBe(200);

    const replay = await app.request("/api/v1/admins", { headers: bearer(operatorToken) }, env);
    expect(replay.status).toBe(401);
  });

  it("rejects deleting yourself and the last owner", async () => {
    const { token, admin } = await setupOwner(app, env);

    const self = await json("DELETE", `/api/v1/admins/${admin.id}`, undefined, bearer(token));
    expect(self.status).toBe(409);
    expect(((await self.json()) as { error: { code: string } }).error.code).toBe("CONFLICT");
  });

  it("deletes a second admin and cascades their sessions", async () => {
    const { token } = await setupOwner(app, env);
    const created = await json(
      "POST",
      "/api/v1/admins",
      { username: "operator", password: "password123", role: "admin" },
      bearer(token),
    );
    const operator = (await created.json()) as { id: string };
    const operatorLogin = await json("POST", "/api/v1/auth/login", {
      username: "operator",
      password: "password123",
    });
    const operatorToken = ((await operatorLogin.json()) as { token: string }).token;

    const deleted = await json("DELETE", `/api/v1/admins/${operator.id}`, undefined, bearer(token));
    expect(deleted.status).toBe(204);

    const replay = await app.request("/api/v1/admins", { headers: bearer(operatorToken) }, env);
    expect(replay.status).toBe(401);

    const relist = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    const admins = (await relist.json()) as { id: string }[];
    expect(admins.find((candidate) => candidate.id === operator.id)).toBeUndefined();
  });

  it("404 on PATCH/DELETE of a missing admin", async () => {
    const { token } = await setupOwner(app, env);
    expect((await json("PATCH", "/api/v1/admins/nope", { role: "admin" }, bearer(token))).status).toBe(404);
    expect((await json("DELETE", "/api/v1/admins/nope", undefined, bearer(token))).status).toBe(404);
  });
});
