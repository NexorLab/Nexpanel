import { NotFoundError, type Subscription, type SubscriptionRepository } from "@nexpanel/core";

/**
 * D1-backed SubscriptionRepository. token is UNIQUE — rotation is an
 * UPDATE, so old links die the moment the token changes.
 */

interface SubscriptionRow {
  id: string;
  user_id: string;
  token: string;
  name: string;
  format: Subscription["format"];
  include_inactive: number;
  expires_at: number | null;
  last_access_at: number | null;
  access_count: number;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  "id, user_id, token, name, format, include_inactive, expires_at, last_access_at, access_count, created_at, updated_at";

function mapRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    name: row.name,
    format: row.format,
    includeInactive: row.include_inactive !== 0,
    expiresAt: row.expires_at,
    lastAccessAt: row.last_access_at,
    accessCount: row.access_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSubscriptionRepository(db: D1Database): SubscriptionRepository {
  return {
    async list(params) {
      const query = params?.userId
        ? `SELECT ${COLUMNS} FROM subscriptions WHERE user_id = ?1 ORDER BY created_at DESC`
        : `SELECT ${COLUMNS} FROM subscriptions ORDER BY created_at DESC`;
      const statement = db.prepare(query);
      const { results } = params?.userId
        ? await statement.bind(params.userId).all<SubscriptionRow>()
        : await statement.all<SubscriptionRow>();
      return results.map(mapRow);
    },

    async getById(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM subscriptions WHERE id = ?1`)
        .bind(id)
        .first<SubscriptionRow>();
      return row ? mapRow(row) : null;
    },

    async getByToken(token) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM subscriptions WHERE token = ?1`)
        .bind(token)
        .first<SubscriptionRow>();
      return row ? mapRow(row) : null;
    },

    async create(subscription) {
      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          `INSERT INTO subscriptions
             (id, user_id, token, name, format, include_inactive, expires_at, last_access_at, access_count, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
        .bind(
          subscription.id,
          subscription.userId,
          subscription.token,
          subscription.name,
          subscription.format,
          subscription.includeInactive ? 1 : 0,
          subscription.expiresAt,
          subscription.lastAccessAt,
          subscription.accessCount,
          now,
          now,
        )
        .run();
      const created = await db
        .prepare(`SELECT ${COLUMNS} FROM subscriptions WHERE id = ?1`)
        .bind(subscription.id)
        .first<SubscriptionRow>();
      if (!created) throw new NotFoundError("Subscription");
      return mapRow(created);
    },

    async update(id, patch) {
      const current = await db
        .prepare(`SELECT ${COLUMNS} FROM subscriptions WHERE id = ?1`)
        .bind(id)
        .first<SubscriptionRow>();
      if (!current) throw new NotFoundError("Subscription");

      const merged = mapRow(current);
      if (patch.name !== undefined) merged.name = patch.name;
      if (patch.format !== undefined) merged.format = patch.format;
      if (patch.token !== undefined) merged.token = patch.token;
      if (patch.includeInactive !== undefined) merged.includeInactive = patch.includeInactive;
      if (patch.expiresAt !== undefined) merged.expiresAt = patch.expiresAt;
      if (patch.lastAccessAt !== undefined) merged.lastAccessAt = patch.lastAccessAt;
      if (patch.accessCount !== undefined) merged.accessCount = patch.accessCount;

      const row = await db
        .prepare(
          `UPDATE subscriptions
           SET name = ?2, format = ?3, token = ?4, include_inactive = ?5, expires_at = ?6,
               last_access_at = ?7, access_count = ?8, updated_at = ?9
           WHERE id = ?1
           RETURNING ${COLUMNS}`,
        )
        .bind(
          id,
          merged.name,
          merged.format,
          merged.token,
          merged.includeInactive ? 1 : 0,
          merged.expiresAt,
          merged.lastAccessAt,
          merged.accessCount,
          Math.floor(Date.now() / 1000),
        )
        .first<SubscriptionRow>();
      if (!row) throw new NotFoundError("Subscription");
      return mapRow(row);
    },

    async delete(id) {
      await db.prepare("DELETE FROM subscriptions WHERE id = ?1").bind(id).run();
    },

    async deleteByUser(userId) {
      await db.prepare("DELETE FROM subscriptions WHERE user_id = ?1").bind(userId).run();
    },

    async recordAccess(token) {
      await db
        .prepare(
          `UPDATE subscriptions
           SET access_count = access_count + 1, last_access_at = ?2
           WHERE token = ?1`,
        )
        .bind(token, Math.floor(Date.now() / 1000))
        .run();
    },
  };
}
