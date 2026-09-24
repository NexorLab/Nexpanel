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
  users: { total: number; active: number; disabled: number; expired: number };
  backends: { total: number; active: number };
  configs: { total: number; byProtocol: Record<string, number> };
  subscriptions: { total: number; active: number };
  series: { configsPerDay: { date: string; count: number }[] };
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
    expect(overview.users).toEqual({ total: 0, active: 0, disabled: 0, expired: 0 });
    expect(overview.configs.total).toBe(0);
    expect(overview.backends).toEqual({ total: 0, active: 0 });
    expect(overview.subscriptions).toEqual({ total: 0, active: 0 });
    expect(overview.series.configsPerDay).toHaveLength(7);
    expect(overview.configs.byProtocol).toEqual({
      vless: 0,
      vmess: 0,
      trojan: 0,
      shadowsocks: 0,
    });
    expect(overview.activity).toEqual([]);
  });

  it("aggregates totals, per-protocol counts and the 7-day series", async () => {
    const { token } = await setupOwner(app, env);
    const user = await createUser(app, env, token);
    const backend = await createBackend(app, env, token);
    await generateConfig(app, env, token, user.id, backend.id);
    await createSubscription(app, env, token, user.id);

    const overview = await getOverview(token);
    expect(overview.users.total).toBe(1);
    expect(overview.users.active).toBe(1);
    expect(overview.configs.total).toBe(1);
    expect(overview.backends).toEqual({ total: 1, active: 1 });
    expect(overview.subscriptions).toEqual({ total: 1, active: 1 });
    expect(overview.configs.byProtocol.vless).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = overview.series.configsPerDay.find((day) => day.date === today);
    expect(todayBucket?.count).toBe(1);
  });

  it("counts disabled and expired users separately from active ones", async () => {
    const { token } = await setupOwner(app, env);
    await createUser(app, env, token); // active
    await createUser(app, env, token, { status: "disabled" }); // disabled
    const expired = await createUser(app, env, token, { expiryAt: 1 }); // expired
    // The subscription belongs to the expired user; create starts it unexpired.
    const subscription = await createSubscription(app, env, token, expired.id);
    await authed("PATCH", `/api/v1/subscriptions/${subscription.id}`, token, { expiresAt: 1 });

    const overview = await getOverview(token);
    expect(overview.users).toEqual({ total: 3, active: 1, disabled: 1, expired: 1 });
    expect(overview.subscriptions).toMatchObject({ total: 1, active: 0 });
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
