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

type Overview = {
  totals: {
    users: number;
    activeUsers: number;
    configs: number;
    backends: { total: number; active: number };
    subscriptions: { total: number; active: number };
  };
  configsPerDay: { date: string; count: number }[];
  byProtocol: Record<string, number>;
  activity: { messageKey: string; params: Record<string, string | number> }[];
};

async function getOverview(token: string): Promise<Overview> {
  const response = await authed("GET", "/api/v1/stats/overview", token);
  expect(response.status).toBe(200);
  return (await response.json()) as Overview;
}

describe("stats", () => {
  it("401 without a token", async () => {
    const response = await app.request("/api/v1/stats/overview", {}, env);
    expect(response.status).toBe(401);
  });

  it("returns a zeroed overview on a fresh instance", async () => {
    const { token } = await setupOwner(app, env);
    const overview = await getOverview(token);
    expect(overview.totals).toMatchObject({
      users: 0,
      activeUsers: 0,
      configs: 0,
      backends: { total: 0, active: 0 },
      subscriptions: { total: 0, active: 0 },
    });
    expect(overview.configsPerDay).toHaveLength(7);
    expect(overview.byProtocol).toEqual({ vless: 0, vmess: 0, trojan: 0, shadowsocks: 0 });
    expect(overview.activity).toEqual([]);
  });

  it("aggregates totals, per-protocol counts and the 7-day series", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    await generateConfig(app, env, token, user.id, backend.id);
    await createSubscription(app, env, token, user.id);

    const overview = await getOverview(token);
    expect(overview.totals).toMatchObject({
      users: 1,
      activeUsers: 1,
      configs: 1,
      backends: { total: 1, active: 1 },
      subscriptions: { total: 1, active: 1 },
    });
    expect(overview.byProtocol.vless).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = overview.configsPerDay.find((day) => day.date === today);
    expect(todayBucket?.count).toBe(1);
  });

  it("counts expired users and subscriptions as inactive", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token, { expiryAt: 1 });
    const subscription = await createSubscription(app, env, token, user.id);
    // expiresAt is set via PATCH (create always starts unexpired).
    await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, { expiresAt: 1 });

    const overview = await getOverview(token);
    expect(overview.totals.activeUsers).toBe(0);
    expect(overview.totals.subscriptions).toMatchObject({ total: 1, active: 0 });
  });

  it("records the activity feed newest-first with i18n keys", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    await generateConfig(app, env, token, user.id, backend.id);
    await authed("PATCH", `/api/v1/users/${user.id}`, token, { status: "disabled" });

    const overview = await getOverview(token);
    const keys = overview.activity.map((event) => event.messageKey);
    // Newest first: the disable happened last.
    expect(keys[0]).toBe("dashboard.activity.userDisabled");
    expect(keys).toContain("dashboard.activity.userCreated");
    expect(keys).toContain("dashboard.activity.configsGenerated");
    expect(overview.activity[0].params.name).toBe(user.username);
  });
});
