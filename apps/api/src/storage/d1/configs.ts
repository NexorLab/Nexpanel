import { NotFoundError, type Config, type ConfigRepository, type Paginated } from "@nexpanel/core";

/**
 * D1-backed ConfigRepository. The (user_id, backend_id) pair is UNIQUE
 * (0001_init.sql), so upsert is a single ON CONFLICT statement —
 * "generate" is idempotent per pair. URI is denormalized; rebuild is
 * explicit (POST /configs/:id/rebuild or generate on an existing pair).
 */

interface ConfigRow {
  id: string;
  user_id: string;
  backend_id: string;
  protocol: Config["protocol"];
  name: string;
  uri: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

const COLUMNS = "id, user_id, backend_id, protocol, name, uri, is_active, created_at, updated_at";

function mapRow(row: ConfigRow): Config {
  return {
    id: row.id,
    userId: row.user_id,
    backendId: row.backend_id,
    protocol: row.protocol,
    name: row.name,
    uri: row.uri,
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Escape LIKE wildcards in user input; paired with ESCAPE '\' in SQL. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export function createConfigRepository(db: D1Database): ConfigRepository {
  return {
    async list({ search, protocol, userId, backendId, page, perPage }): Promise<Paginated<Config>> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (search) {
        clauses.push("(name LIKE ? ESCAPE '\\' OR uri LIKE ? ESCAPE '\\')");
        params.push(likePattern(search), likePattern(search));
      }
      if (protocol) {
        clauses.push("protocol = ?");
        params.push(protocol);
      }
      if (userId) {
        clauses.push("user_id = ?");
        params.push(userId);
      }
      if (backendId) {
        clauses.push("backend_id = ?");
        params.push(backendId);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const countRow = await db
        .prepare(`SELECT COUNT(*) AS n FROM configs ${where}`)
        .bind(...params)
        .first<{ n: number }>();
      const total = countRow?.n ?? 0;

      const { results } = await db
        .prepare(
          `SELECT ${COLUMNS} FROM configs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(...params, perPage, (page - 1) * perPage)
        .all<ConfigRow>();

      return {
        data: results.map(mapRow),
        meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      };
    },

    async getById(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM configs WHERE id = ?1`)
        .bind(id)
        .first<ConfigRow>();
      return row ? mapRow(row) : null;
    },

    async upsert(config) {
      const now = Math.floor(Date.now() / 1000);
      const row = await db
        .prepare(
          `INSERT INTO configs (${COLUMNS})
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT (user_id, backend_id) DO UPDATE SET
             protocol = excluded.protocol,
             name = excluded.name,
             uri = excluded.uri,
             is_active = excluded.is_active,
             updated_at = excluded.updated_at
           RETURNING ${COLUMNS}`,
        )
        .bind(
          config.id,
          config.userId,
          config.backendId,
          config.protocol,
          config.name,
          config.uri,
          config.isActive ? 1 : 0,
          now,
          now,
        )
        .first<ConfigRow>();
      if (!row) throw new NotFoundError("Config");
      return mapRow(row);
    },

    async delete(id) {
      await db.prepare("DELETE FROM configs WHERE id = ?1").bind(id).run();
    },

    async deleteByUser(userId) {
      await db.prepare("DELETE FROM configs WHERE user_id = ?1").bind(userId).run();
    },

    async deleteByBackend(backendId) {
      await db.prepare("DELETE FROM configs WHERE backend_id = ?1").bind(backendId).run();
    },
  };
}
