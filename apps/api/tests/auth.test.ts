import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createFakeD1 } from "./fake-d1";
import { bearer, loginAs, setupOwner } from "./helpers";

let app: ReturnType<typeof createApp>;
let env: { DB: Env["DB"]; JWT_SECRET: string };

beforeEach(() => {
  app = createApp();
  env = { DB: createFakeD1() as unknown as Env["DB"], JWT_SECRET: "test-secret-for-jwt-signing" };
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("GET /auth/status", () => {
  it("reports needsSetup true on an empty admins table", async () => {
    const response = await app.request("/api/v1/auth/status", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ needsSetup: true });
  });

  it("reports needsSetup false after setup", async () => {
    await setupOwner(app, env);
    const response = await app.request("/api/v1/auth/status", {}, env);
    expect((await response.json()) as { needsSetup: boolean }).toEqual({ needsSetup: false });
  });
});

describe("POST /auth/setup", () => {
  it("creates the first owner and auto-logs in (201 + working token)", async () => {
    const { response, token, admin } = await setupOwner(app, env);
    expect(response.status).toBe(201);
    expect(admin.role).toBe("owner");
    // The token must authenticate against requireAuth:
    const list = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    expect(list.status).toBe(200);
  });

  it("refuses the second setup with 409 SETUP_ALREADY_DONE", async () => {
    await setupOwner(app, env);
    const response = await post("/api/v1/auth/setup", {
      username: "second",
      password: "password123",
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "SETUP_ALREADY_DONE",
    );
  });

  it("validates username and password (400 VALIDATION_ERROR)", async () => {
    const shortUser = await post("/api/v1/auth/setup", { username: "ab", password: "password123" });
    expect(shortUser.status).toBe(400);
    const shortPass = await post("/api/v1/auth/setup", { username: "owner", password: "short" });
    expect(shortPass.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("returns 200 with token + admin and stamps last_login_at", async () => {
    const { admin } = await setupOwner(app, env);
    const { response, token } = await loginAs(app, env, "owner", "password123");
    expect(response.status).toBe(200);
    expect((await app.request("/api/v1/admins", { headers: bearer(token) }, env)).status).toBe(200);

    const list = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    const admins = (await list.json()) as { id: string; lastLoginAt: number | null }[];
    const me = admins.find((candidate) => candidate.id === admin.id);
    expect(me?.lastLoginAt).not.toBeNull();
  });

  it("gives identical 401 for unknown user and wrong password", async () => {
    await setupOwner(app, env);
    const unknown = await post("/api/v1/auth/login", { username: "nobody", password: "password123" });
    const wrong = await post("/api/v1/auth/login", { username: "owner", password: "wrongpassword" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(
      ((await unknown.json()) as { error: { message: string } }).error.message,
    ).toBe(((await wrong.json()) as { error: { message: string } }).error.message);
  });

  it("rejects an inactive admin with 401", async () => {
    const { token } = await setupOwner(app, env);
    const created = await post(
      "/api/v1/admins",
      { username: "temp", password: "password123", role: "viewer" },
      bearer(token),
    );
    const temp = (await created.json()) as { id: string };
    await app.request(
      `/api/v1/admins/${temp.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(token) },
        body: JSON.stringify({ isActive: false }),
      },
      env,
    );
    const tempLogin = await post("/api/v1/auth/login", {
      username: "temp",
      password: "password123",
    });
    expect(tempLogin.status).toBe(401);
    expect(((await tempLogin.json()) as { error: { message: string } }).error.message).toBe(
      "Account disabled.",
    );
  });
});

describe("auth middleware", () => {
  it("401 without a Bearer token", async () => {
    await setupOwner(app, env);
    const response = await app.request("/api/v1/admins", {}, env);
    expect(response.status).toBe(401);
  });

  it("401 with a tampered token", async () => {
    const { token } = await setupOwner(app, env);
    const tampered = token.slice(0, -3) + (token.endsWith("aaa") ? "bbb" : "aaa");
    const response = await app.request("/api/v1/admins", { headers: bearer(tampered) }, env);
    expect(response.status).toBe(401);
  });

  it("401 with a token signed for a different secret", async () => {
    const other = { DB: createFakeD1() as unknown as Env["DB"], JWT_SECRET: "another-secret" };
    const { token } = await setupOwner(app, other);
    const response = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    expect(response.status).toBe(401);
  });

  it("401 after logout (session revoked)", async () => {
    const { token } = await setupOwner(app, env);
    const logout = await post("/api/v1/auth/logout", undefined, bearer(token));
    expect(logout.status).toBe(204);
    const replay = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    expect(replay.status).toBe(401);
    expect(((await replay.json()) as { error: { message: string } }).error.message).toBe(
      "Session revoked.",
    );
  });
});

describe("PATCH /auth/password", () => {
  it("400 WRONG_PASSWORD on wrong current password", async () => {
    const { token } = await setupOwner(app, env);
    const response = await app.request(
      "/api/v1/auth/password",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(token) },
        body: JSON.stringify({ currentPassword: "wrongpassword", newPassword: "password456" }),
      },
      env,
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "WRONG_PASSWORD",
    );
  });

  it("400 on too-short new password", async () => {
    const { token } = await setupOwner(app, env);
    const response = await app.request(
      "/api/v1/auth/password",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(token) },
        body: JSON.stringify({ currentPassword: "password123", newPassword: "short" }),
      },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("204 → old token 401 → new password logs in", async () => {
    const { token } = await setupOwner(app, env);
    const change = await app.request(
      "/api/v1/auth/password",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(token) },
        body: JSON.stringify({ currentPassword: "password123", newPassword: "password456" }),
      },
      env,
    );
    expect(change.status).toBe(204);

    const replay = await app.request("/api/v1/admins", { headers: bearer(token) }, env);
    expect(replay.status).toBe(401);

    const relogin = await post("/api/v1/auth/login", { username: "owner", password: "password456" });
    expect(relogin.status).toBe(200);

    const oldPassword = await post("/api/v1/auth/login", { username: "owner", password: "password123" });
    expect(oldPassword.status).toBe(401);
  });
});
