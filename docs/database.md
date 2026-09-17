# Database

Single SQLite schema, consumed by **D1 on Cloudflare** today and by **local SQLite on a self-hosted server** later. Migrations are plain SQL files in `database/migrations/`, applied in filename order.

```bash
# Cloudflare (local dev database)
cd apps/api
npx wrangler d1 migrations apply nexpanel-db --local

# Remote
npx wrangler d1 migrations apply nexpanel-db --remote
```

## Conventions

| Rule | Value |
|---|---|
| Primary keys | TEXT UUID v4, generated application-side (`crypto.randomUUID()`) |
| Timestamps | Unix **seconds**, `INTEGER`; NULL = "never" |
| Booleans | `INTEGER` 0/1 |
| Case-insensitive usernames | `COLLATE NOCASE` on unique text columns |
| PRAGMAs | **None** in migrations (D1 restriction, keeps files portable) |

## Entity relationship

```
admins 1───∞ sessions
users  1───∞ configs ∞───1 backends
users  1───∞ subscriptions
settings (key/value, standalone)
activity_log (append-only feed, standalone)
```

## Tables

- **admins** — panel operators. `password_hash` is PBKDF2-encoded (`pbkdf2$iterations$salt$hash`, see `packages/core/src/crypto/passwords.ts`). `role ∈ owner|admin|viewer`. Unique, case-insensitive `username`.
- **sessions** — issued JWTs, keyed by SHA-256 token hash so logout/revocation works without storing the token itself. Cascade-deleted with the admin. Lifecycle (implemented in the auth phase): a row is inserted at login/setup with `expires_at` = the JWT `exp`; logout deletes the presented token's row; a password change deletes **all** of the admin's rows (every device re-logins); expired rows are swept opportunistically at login (no cron yet).
- **users** — config *consumers* (not panel logins). `uuid` is the credential embedded in proxy URIs; `quota_bytes`/`used_bytes` power usage bars; `expiry_at` NULL = never; `ip_limit` 0 = unlimited.
- **backends** — upstream proxy servers. Protocol/transport/security are CHECK-constrained to the exact unions in `@nexpanel/core`; Shadowsocks uses `method`, REALITY adds `reality_public_key`/`reality_short_id`. Unique `name`.
- **configs** — one generated URI per user×backend, enforced by `UNIQUE(user_id, backend_id)`; generation is an upsert. `uri` is denormalized (rebuilt via `POST /configs/:id/rebuild` when user or backend data changes). Cascade-deleted with either parent.
- **subscriptions** — shareable links. `token` is the only secret material in the table (unique, unguessable); rotating a token is an UPDATE, so old links die immediately. Cascade-deleted with the user.
- **settings** — instance-level key/value store (panel name, URLs, defaults). Values are JSON-encoded scalars/objects; no schema migration needed for new settings. The `PanelSettings` DTO (`general` / `network` sections, see docs/api.md) maps to two rows here, one JSON blob per section.
- **activity_log** (0002_activity.sql) — dashboard "recent activity" feed. Rows are semantic events: `message_key` is an i18n key rendered client-side and `params` is a JSON object of interpolation values, so the API never stores translated text. Append-only with a bounded tail — the repository prunes everything beyond the newest 200 rows on write.

## Portability notes

The schema avoids D1-specific features (no `STRICT` tables, no generated columns) so the same files run on plain SQLite for the self-hosted deployment. The only divergence allowed in future migrations: performance indexes may be added per-platform in *separate* files (`0002_node_indexes.sql`), never by editing applied migrations.
