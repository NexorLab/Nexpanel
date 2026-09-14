import {
  ConflictError,
  NotFoundError,
  type ConfigUser,
  type Paginated,
  type UserRepository,
} from "@nexpanel/core";

/**
 * D1-backed UserRepository. username is UNIQUE COLLATE NOCASE (0001_init.sql),
 * so lookups/UNIQUE are case-insensitive for free. Dynamic list filters use
 * anonymous `?` placeholders in bind order; single-row statements keep the
 * ?N style used elsewhere in this package.
 */

interface UserRow {
  id: string;
  uuid: string;
  username: string;
  note: string | null;
  status: ConfigUser["status"];
  quota_bytes: number;
  used_bytes: number;
  expiry_at: number | null;
  ip_limit: number;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  "id, uuid, username, note, status, quota_bytes, used_bytes, expiry_at, ip_limit, created_at, updated_at";

function mapRow(row: UserRow): ConfigUser {
  return {
    id: row.id,
    uuid: row.uuid,
    username: row.username,
    note: row.note,
    status: row.status,
    quotaBytes: row.quota_bytes,
    usedBytes: row.used_bytes,
    expiryAt: row.expiry_at,
    ipLimit: row.ip_limit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSetColumns(merged: ConfigUser, now: number): [string[], unknown[]] {
  return [
    [
      "uuid = ?",
      "username = ?",
      "note = ?",
      "status = ?",
      "quota_bytes = ?",
      "used_bytes = ?",
      "expiry_at = ?",
      "ip_limit = ?",
      "updated_at = ?",
    ],
    [
      merged.uuid,
      merged.username,
      merged.note,
      merged.status,
      merged.quotaBytes,
      merged.usedBytes,
      merged.expiryAt,
      merged.ipLimit,
      now,
    ],
  ];
}

/** Escape LIKE wildcards in user input; paired with ESCAPE '\' in SQL. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export function createUserRepository(db: D1Database): UserRepository {
  return {
    async list({ search, status, page, perPage }): Promise<Paginated<ConfigUser>> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (search) {
        clauses.push("(username LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')");
        params.push(likePattern(search), likePattern(search));
      }
      if (status) {
        clauses.push("status = ?");
        params.push(status);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const countRow = await db
        .prepare(`SELECT COUNT(*) AS n FROM users ${where}`)
        .bind(...params)
        .first<{ n: number }>();
      const total = countRow?.n ?? 0;

      const { results } = await db
        .prepare(
          `SELECT ${COLUMNS} FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(...params, perPage, (page - 1) * perPage)
        .all<UserRow>();

      return {
        data: results.map(mapRow),
        meta: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage),
        },
      };
    },

    async getById(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?1`)
        .bind(id)
        .first<UserRow>();
      return row ? mapRow(row) : null;
    },

    async getByUsername(username) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM users WHERE username = ?1`)
        .bind(username)
        .first<UserRow>();
      return row ? mapRow(row) : null;
    },

    async create(user) {
      const existing = await db
        .prepare("SELECT id FROM users WHERE username = ?1")
        .bind(user.username)
        .first<{ id: string }>();
      if (existing) {
        throw new ConflictError("USERNAME_TAKEN", "Username is already taken.");
      }
      const now = Math.floor(Date.now() / 1000);
      const result = await db
        .prepare(
          `INSERT INTO users
             (id, uuid, username, note, status, quota_bytes, used_bytes, expiry_at, ip_limit, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(
          user.id,
          user.uuid,
          user.username,
          user.note,
          user.status,
          user.quotaBytes,
          user.usedBytes,
          user.expiryAt,
          user.ipLimit,
          now,
          now,
        )
        .run();
      if (!result.meta.changes) {
        throw new ConflictError("USERNAME_TAKEN", "Username is already taken.");
      }
      const created = await db
        .prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?1`)
        .bind(user.id)
        .first<UserRow>();
      if (!created) throw new NotFoundError("User");
      return mapRow(created);
    },

    async update(id, patch) {
      const current = await db
        .prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?1`)
        .bind(id)
        .first<UserRow>();
      if (!current) throw new NotFoundError("User");

      if (patch.username !== undefined) {
        const clash = await db
          .prepare("SELECT id FROM users WHERE username = ?1")
          .bind(patch.username)
          .first<{ id: string }>();
        if (clash && clash.id !== id) {
          throw new ConflictError("USERNAME_TAKEN", "Username is already taken.");
        }
      }

      const merged = mapRow(current);
      if (patch.uuid !== undefined) merged.uuid = patch.uuid;
      if (patch.username !== undefined) merged.username = patch.username;
      if (patch.note !== undefined) merged.note = patch.note;
      if (patch.status !== undefined) merged.status = patch.status;
      if (patch.quotaBytes !== undefined) merged.quotaBytes = patch.quotaBytes;
      if (patch.usedBytes !== undefined) merged.usedBytes = patch.usedBytes;
      if (patch.expiryAt !== undefined) merged.expiryAt = patch.expiryAt;
      if (patch.ipLimit !== undefined) merged.ipLimit = patch.ipLimit;

      const [columns, values] = toSetColumns(merged, Math.floor(Date.now() / 1000));
      const row = await db
        .prepare(`UPDATE users SET ${columns.join(", ")} WHERE id = ? RETURNING ${COLUMNS}`)
        .bind(...values, id)
        .first<UserRow>();
      if (!row) throw new NotFoundError("User");
      return mapRow(row);
    },

    async delete(id) {
      await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
    },
  };
}
