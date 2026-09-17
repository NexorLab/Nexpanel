import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createSqliteD1 } from "./sqlite-d1";
import { bearer, setupOwner } from "./helpers";
import { createSubscription, createUser } from "./fixtures";

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

describe("subscriptions", () => {
  it("401 without a token", async () => {
    const response = await app.request("/api/v1/subscriptions", {}, env);
    expect(response.status).toBe(401);
  });

  it("creates a subscription with an unguessable token", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const created = await authed("POST", "/api/v1/subscriptions", token, {
      userId: user.id,
      name: "mobile",
      format: "clash",
    });
    expect(created.status).toBe(201);
    const subscription = (await created.json()) as {
      token: string;
      format: string;
      includeInactive: boolean;
      accessCount: number;
      expiresAt: null;
    };
    expect(subscription.token).toMatch(/^[0-9a-f]{32}$/);
    expect(subscription.format).toBe("clash");
    expect(subscription.includeInactive).toBe(false);
    expect(subscription.accessCount).toBe(0);
    expect(subscription.expiresAt).toBeNull();
  });

  it("validates the body and 404s on a missing user", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("POST", "/api/v1/subscriptions", token, { name: "x", format: "base64" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/subscriptions", token, { userId: "nope", name: "x", format: "base64" })).status).toBe(404);
    const user = await createUser(app, env, token);
    expect((await authed("POST", "/api/v1/subscriptions", token, { userId: user.id, name: "", format: "base64" })).status).toBe(400);
    expect((await authed("POST", "/api/v1/subscriptions", token, { userId: user.id, name: "x", format: "yaml" })).status).toBe(400);
  });

  it("lists with a userId filter", async () => {
    const { token } = await setupOwner(app, env);
    const alice = await createUser(app, env, token);
    const bob = await createUser(app, env, token);
    await createSubscription(app, env, token, alice.id);
    await createSubscription(app, env, token, bob.id);

    const list = await authed("GET", `/api/v1/subscriptions?userId=${alice.id}`, token);
    const data = (await list.json()) as { userId: string }[];
    expect(data).toHaveLength(1);
    expect(data[0].userId).toBe(alice.id);
  });

  it("patches name/format/expiresAt", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const subscription = await createSubscription(app, env, token, user.id);

    const patched = await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, {
      name: "renamed",
      format: "singbox",
      expiresAt: 1893456000,
    });
    expect(patched.status).toBe(200);
    const updated = (await patched.json()) as { name: string; format: string; expiresAt: number };
    expect(updated).toMatchObject({ name: "renamed", format: "singbox", expiresAt: 1893456000 });

    const cleared = await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, { expiresAt: null });
    expect(((await cleared.json()) as { expiresAt: null }).expiresAt).toBeNull();
  });

  it("404s on missing subscription", async () => {
    const { token } = await setupOwner(app, env);
    expect((await authed("PATCH", "/api/v1/subscriptions/nope", token, { name: "x" })).status).toBe(404);
    expect((await authed("DELETE", "/api/v1/subscriptions/nope", token)).status).toBe(404);
    expect((await authed("POST", "/api/v1/subscriptions/nope/rotate-token", token)).status).toBe(404);
  });

  it("rotating the token invalidates the old link and resets access stats", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const subscription = await createSubscription(app, env, token, user.id);

    const before = await app.request(`/sub/${subscription.token}`, {}, env);
    expect(before.status).toBe(200);

    const rotated = await authed("POST", `/api/v1/subscriptions/${subscription.id}/rotate-token`, token);
    expect(rotated.status).toBe(200);
    const updated = (await rotated.json()) as { token: string; accessCount: number; lastAccessAt: null };
    expect(updated.token).not.toBe(subscription.token);
    expect(updated.accessCount).toBe(0);
    expect(updated.lastAccessAt).toBeNull();

    expect((await app.request(`/sub/${subscription.token}`, {}, env)).status).toBe(404);
    expect((await app.request(`/sub/${updated.token}`, {}, env)).status).toBe(200);
  });
});
