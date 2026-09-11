import {
  ConflictError,
  NotFoundError,
  type AdminWithHash,
  type AdminRepository,
  type PanelAdmin,
} from "@nexpanel/core";

/**
 * D1-backed AdminRepository. The username column is COLLATE NOCASE in
 * 0001_init.sql, so username lookups/UNIQUE are case-insensitive for
 * free. Rows are snake_case; one mapper converts to the domain shape.
 */

interface AdminRow {
  id: string;
  username: string;
  role: PanelAdmin["role"];
  is_active: number;
  last_login_at: number | null;
  password_hash: string | null;
  created_at: number;
  updated_at: number;
}

const PUBLIC_COLUMNS =
  "id, username, role, is_active, last_login_at, created_at, updated_at";

function mapRow(row: AdminRow): AdminWithHash {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.is_active !== 0,
    lastLoginAt: row.last_login_at ?? null,
    passwordHash: row.password_hash ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublic(admin: AdminWithHash): PanelAdmin {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

export function createAdminRepository(db: D1Database): AdminRepository {
  return {
    async list(): Promise<PanelAdmin[]> {
      const { results } = await db
        .prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins ORDER BY created_at ASC`)
        .all<AdminRow>();
      return results.map((row) => toPublic(mapRow(row)));
    },

    async getById(id): Promise<AdminWithHash | null> {
      const row = await db
        .prepare(
          `SELECT ${PUBLIC_COLUMNS}, password_hash FROM admins WHERE id = ?1`,
        )
        .bind(id)
        .first<AdminRow>();
      return row ? mapRow(row) : null;
    },

    async getByUsername(username): Promise<AdminWithHash | null> {
      const row = await db
        .prepare(
          `SELECT ${PUBLIC_COLUMNS}, password_hash FROM admins WHERE username = ?1`,
        )
        .bind(username)
        .first<AdminRow>();
      return row ? mapRow(row) : null;
    },

    async create(admin) {
      const existing = await db
        .prepare("SELECT id FROM admins WHERE username = ?1")
        .bind(admin.username)
        .first<{ id: string }>();
      if (existing) {
        throw new ConflictError("USERNAME_TAKEN", "Username is already taken.");
      }
      const now = Math.floor(Date.now() / 1000);
      const result = await db
        .prepare(
          `INSERT INTO admins
             (id, username, password_hash, role, is_active, last_login_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          admin.id,
          admin.username,
          admin.passwordHash,
          admin.role,
          admin.isActive ? 1 : 0,
          admin.lastLoginAt,
          now,
          now,
        )
        .run();
      if (!result.meta.changes) {
        throw new ConflictError("USERNAME_TAKEN", "Username is already taken.");
      }
      const created = await db
        .prepare(`SELECT ${PUBLIC_COLUMNS} FROM admins WHERE id = ?1`)
        .bind(admin.id)
        .first<AdminRow>();
      if (!created) throw new NotFoundError("Admin");
      return toPublic(mapRow(created));
    },

    async update(id, patch) {
      const current = await db
        .prepare(
          `SELECT ${PUBLIC_COLUMNS}, password_hash FROM admins WHERE id = ?1`,
        )
        .bind(id)
        .first<AdminRow>();
      if (!current) throw new NotFoundError("Admin");

      const merged = mapRow(current);
      if (patch.role !== undefined) merged.role = patch.role;
      if (patch.isActive !== undefined) merged.isActive = patch.isActive;
      if (patch.lastLoginAt !== undefined) merged.lastLoginAt = patch.lastLoginAt;
      if (patch.passwordHash !== undefined) merged.passwordHash = patch.passwordHash;

      const row = await db
        .prepare(
          `UPDATE admins
           SET role = ?2, is_active = ?3, last_login_at = ?4, password_hash = ?5, updated_at = ?6
           WHERE id = ?1
           RETURNING ${PUBLIC_COLUMNS}`,
        )
        .bind(
          id,
          merged.role,
          merged.isActive ? 1 : 0,
          merged.lastLoginAt,
          merged.passwordHash,
          Math.floor(Date.now() / 1000),
        )
        .first<AdminRow>();
      if (!row) throw new NotFoundError("Admin");
      return toPublic(mapRow(row));
    },

    async delete(id): Promise<void> {
      await db.prepare("DELETE FROM admins WHERE id = ?1").bind(id).run();
    },

    async count(): Promise<number> {
      const row = await db
        .prepare("SELECT COUNT(*) AS n FROM admins")
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async countOwnersExcluding(id): Promise<number> {
      const row = await db
        .prepare(
          "SELECT COUNT(*) AS n FROM admins WHERE role = 'owner' AND id != ?1",
        )
        .bind(id)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },
  };
}
