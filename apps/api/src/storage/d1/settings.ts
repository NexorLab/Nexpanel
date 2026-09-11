import type { SettingsRepository } from "@nexpanel/core";

/**
 * D1-backed SettingsRepository — each setting is a JSON document in the
 * settings table (PanelSettings maps to the "general" and "network"
 * rows; see docs/database.md).
 */
export function createSettingsRepository(db: D1Database): SettingsRepository {
  return {
    async getAll(): Promise<Record<string, unknown>> {
      const { results } = await db
        .prepare("SELECT key, value FROM settings")
        .all<{ key: string; value: string }>();
      const all: Record<string, unknown> = {};
      for (const row of results) {
        try {
          all[row.key] = JSON.parse(row.value);
        } catch {
          // Malformed row: skip rather than fail the whole read.
        }
      }
      return all;
    },

    async get<T>(key: string): Promise<T | null> {
      const row = await db
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .bind(key)
        .first<{ value: string }>();
      if (!row) return null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return null;
      }
    },

    async set(key, value): Promise<void> {
      await db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(key, JSON.stringify(value), Math.floor(Date.now() / 1000))
        .run();
    },
  };
}
