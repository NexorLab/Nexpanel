import type { ActivityEvent, ActivityRepository } from "@nexpanel/core";

/**
 * D1-backed ActivityRepository — append-only feed with a bounded tail.
 * Events are semantic (i18n messageKey + JSON params); the client renders
 * them translated. Trimming happens on write so reads never pay for it.
 */

/** Newest events kept; older rows are pruned opportunistically. */
const MAX_EVENTS = 200;

interface ActivityRow {
  id: string;
  message_key: string;
  params: string;
  at: number;
}

function mapRow(row: ActivityRow): ActivityEvent {
  let params: Record<string, string | number> = {};
  try {
    params = JSON.parse(row.params) as Record<string, string | number>;
  } catch {
    // A malformed row must not break the feed — render with no params.
  }
  return { id: row.id, messageKey: row.message_key, params, at: row.at };
}

export function createActivityRepository(db: D1Database): ActivityRepository {
  return {
    async record(event) {
      await db
        .prepare(
          "INSERT INTO activity_log (id, message_key, params, at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(event.id, event.messageKey, JSON.stringify(event.params), event.at)
        .run();
      await db
        .prepare(
          `DELETE FROM activity_log WHERE id NOT IN (
             SELECT id FROM activity_log ORDER BY at DESC, rowid DESC LIMIT ${MAX_EVENTS}
           )`,
        )
        .run();
    },

    async list(limit) {
      const { results } = await db
        .prepare("SELECT id, message_key, params, at FROM activity_log ORDER BY at DESC, rowid DESC LIMIT ?1")
        .bind(limit)
        .all<ActivityRow>();
      return results.map(mapRow);
    },
  };
}
