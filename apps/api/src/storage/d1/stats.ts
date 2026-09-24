import type { Config, StatsRepository } from "@nexpanel/core";

/**
 * D1-backed StatsRepository — aggregate counts for the dashboard.
 * "Active" semantics: users are active when enabled and not expired;
 * subscriptions are active when unexpired; backends when enabled.
 */

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Last 7 UTC dates (YYYY-MM-DD), oldest first, for the per-day series. */
function lastSevenDays(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

export function createStatsRepository(db: D1Database): StatsRepository {
  return {
    async overview() {
      const timestamp = now();

      const usersRow = await db
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN status = 'active'
                             AND (expiry_at IS NULL OR expiry_at > ?1) THEN 1 ELSE 0 END), 0) AS active,
                  COALESCE(SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END), 0) AS disabled,
                  COALESCE(SUM(CASE WHEN status != 'disabled'
                             AND expiry_at IS NOT NULL AND expiry_at <= ?1 THEN 1 ELSE 0 END), 0) AS expired
           FROM users`,
        )
        .bind(timestamp)
        .first<{ total: number; active: number; disabled: number; expired: number }>();

      const configsRow = await db
        .prepare("SELECT COUNT(*) AS n FROM configs")
        .first<{ n: number }>();

      const backendsRow = await db
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active
           FROM backends`,
        )
        .first<{ total: number; active: number }>();

      const subscriptionsRow = await db
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN expires_at IS NULL OR expires_at > ?1 THEN 1 ELSE 0 END), 0) AS active
           FROM subscriptions`,
        )
        .bind(timestamp)
        .first<{ total: number; active: number }>();

      const byProtocolRows = await db
        .prepare("SELECT protocol, COUNT(*) AS n FROM configs GROUP BY protocol")
        .all<{ protocol: Config["protocol"]; n: number }>();
      const byProtocol: Record<Config["protocol"], number> = {
        vless: 0,
        vmess: 0,
        trojan: 0,
        shadowsocks: 0,
      };
      for (const row of byProtocolRows.results) {
        byProtocol[row.protocol] = row.n;
      }

      // SQLite date() is UTC, matching the JS day bucketing below.
      const dayRows = await db
        .prepare(
          `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n
           FROM configs
           WHERE created_at >= ?1
           GROUP BY day`,
        )
        .bind(timestamp - 7 * 86400)
        .all<{ day: string; n: number }>();
      const counts = new Map(dayRows.results.map((row) => [row.day, row.n]));
      const configsPerDay = lastSevenDays().map((date) => ({
        date,
        count: counts.get(date) ?? 0,
      }));

      return {
        users: {
          total: usersRow?.total ?? 0,
          active: usersRow?.active ?? 0,
          disabled: usersRow?.disabled ?? 0,
          expired: usersRow?.expired ?? 0,
        },
        backends: { total: backendsRow?.total ?? 0, active: backendsRow?.active ?? 0 },
        configs: { total: configsRow?.n ?? 0, byProtocol },
        subscriptions: {
          total: subscriptionsRow?.total ?? 0,
          active: subscriptionsRow?.active ?? 0,
        },
        series: { configsPerDay },
      };
    },
  };
}
