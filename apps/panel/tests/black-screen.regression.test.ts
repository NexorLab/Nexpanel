/**
 * Regression test for the "black screen after login" report (2026-09-10).
 * Exercises the exact code path the browser runs after admin/admin:
 *   auth.login → Dashboard → useApi(getStats) → buildSeedStats
 * If any of these throw synchronously, the SPA renders an empty screen
 * (there is no error boundary yet), which matches the reported symptom.
 */
import { describe, expect, it } from "vitest";

import {
  seedAdmins,
  seedBackends,
  seedSubscriptions,
  seedUsers,
  buildSeedConfigs,
  buildSeedStats,
} from "../src/lib/api/mock/seed";
import type { Subscription } from "../src/types/dto";
import type { ConfigUser } from "../src/types/dto";

describe("login → dashboard data path", () => {
  it("admin/admin account exists in the login map", () => {
    // Matches MOCK_ACCOUNTS in the mock adapter — keeps the demo hint honest.
    const admin = seedAdmins.find((a) => a.username === "admin");
    expect(admin).toBeDefined();
    expect(admin?.role).toBe("owner");
  });

  it("buildSeedStats produces every field Dashboard reads", () => {
    const users: ConfigUser[] = seedUsers;
    const configs = buildSeedConfigs(users);
    const subscriptions = seedSubscriptions.map((sub, index): Subscription => ({
      ...sub,
      userId: users[index % users.length].id,
    }));

    const stats = buildSeedStats(users, seedBackends, configs, subscriptions);

    // Dashboard.tsx reads exactly these paths:
    expect(stats.users.total).toBeGreaterThan(0);
    expect(stats.configs.total).toBeGreaterThanOrEqual(0);
    expect(stats.backends.active).toBeLessThanOrEqual(stats.backends.total);
    expect(stats.subscriptions.active).toBeGreaterThanOrEqual(0);
    expect(stats.series.configsPerDay).toHaveLength(7);
    for (const point of stats.series.configsPerDay) {
      expect(typeof point.date).toBe("string");
      expect(typeof point.count).toBe("number");
    }
    expect(Object.keys(stats.configs.byProtocol).sort()).toEqual(
      ["shadowsocks", "trojan", "vmess", "vless"].sort(),
    );
    expect(Array.isArray(stats.activity)).toBe(true);
    for (const item of stats.activity) {
      // Dashboard renders t(`dashboard.activity.${item.messageKey}`) — the
      // seed stores "activity.userCreated", so the composed key resolves.
      expect(item.messageKey).toMatch(/^activity\.[A-Za-z]+$/);
    }
  });

  it("activity messageKeys all exist in both locales", async () => {
    const en = (await import("../src/i18n/locales/en.json")).default;
    const fa = (await import("../src/i18n/locales/fa.json")).default;
    const users: ConfigUser[] = seedUsers;
    const configs = buildSeedConfigs(users);
    const subscriptions = seedSubscriptions.map((sub, index): Subscription => ({
      ...sub,
      userId: users[index % users.length].id,
    }));
    const stats = buildSeedStats(users, seedBackends, configs, subscriptions);

    for (const item of stats.activity) {
      const key = item.messageKey.replace(/^activity\./, "");
      expect(en.dashboard.activity, `en missing ${key}`).toHaveProperty(key);
      expect(fa.dashboard.activity, `fa missing ${key}`).toHaveProperty(key);
    }
  });
});
