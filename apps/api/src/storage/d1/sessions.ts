import type { AdminRole, SessionRepository } from "@nexpanel/core";

/**
 * D1-backed SessionRepository. Rows store SHA-256(token) — the raw
 * bearer token never touches the database. Admin deletion cascades via
 * the FK in 0001_init.sql.
 */
export function createSessionRepository(db: D1Database): SessionRepository {
  return {
    async create(session): Promise<void> {
      await db
        .prepare(
          `INSERT INTO sessions (id, admin_id, token_hash, expires_at, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
        .bind(
          session.id,
          session.adminId,
          session.tokenHash,
          session.expiresAt,
          session.createdAt,
        )
        .run();
    },

    async getAuthByTokenHash(tokenHash) {
      const row = await db
        .prepare(
          `SELECT s.expires_at, a.id, a.username, a.role, a.is_active
           FROM sessions s INNER JOIN admins a ON a.id = s.admin_id
           WHERE s.token_hash = ?1`,
        )
        .bind(tokenHash)
        .first<{
          expires_at: number;
          id: string;
          username: string;
          role: AdminRole;
          is_active: number;
        }>();
      if (!row) return null;
      return {
        expiresAt: row.expires_at,
        admin: {
          id: row.id,
          username: row.username,
          role: row.role,
          isActive: row.is_active !== 0,
        },
      };
    },

    async deleteByTokenHash(tokenHash): Promise<void> {
      await db
        .prepare("DELETE FROM sessions WHERE token_hash = ?1")
        .bind(tokenHash)
        .run();
    },

    async deleteByAdmin(adminId): Promise<void> {
      await db
        .prepare("DELETE FROM sessions WHERE admin_id = ?1")
        .bind(adminId)
        .run();
    },

    async deleteExpired(now): Promise<void> {
      await db
        .prepare("DELETE FROM sessions WHERE expires_at < ?1")
        .bind(now)
        .run();
    },
  };
}
