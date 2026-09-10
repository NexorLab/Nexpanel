# API Reference (contract)

Base URL: `/api/v1`. All bodies are JSON. Authentication (except `/sub/:token` and `/auth/login`) uses `Authorization: Bearer <JWT>`.

**Status in this phase:** every endpoint below exists and returns the correct envelope, but business logic is stubbed — authenticated routes respond `501` with `error.code = "NOT_IMPLEMENTED"`. The frontend mock adapter implements the identical contract against seed data.

## Error envelope

Every non-2xx response:

```json
{ "error": { "code": "CONFLICT", "message": "Human-readable detail." } }
```

Stable codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT`, `USERNAME_TAKEN`, `NAME_TAKEN`, `LAST_OWNER` (409), `RATE_LIMITED` (429), `NOT_IMPLEMENTED` (501), `INTERNAL` (500).

## Health

```
GET /api/v1/health → 200 { "status": "ok", "version": "0.1.0" }
```

## Auth

```
POST /auth/login    { username, password }
                  → 200 { token, admin: { id, username, role } }
                  → 401 UNAUTHORIZED
POST /auth/logout   → 204   (revokes the presented token)
```

## Users (config consumers)

```
GET    /users?search=&status=&page=&perPage=
                  → 200 Paginated<ConfigUser>
POST   /users     { username, note?, quotaBytes, expiryAt?, ipLimit, status }
                  → 201 ConfigUser | 409 USERNAME_TAKEN
GET    /users/:id → 200 ConfigUser
PATCH  /users/:id { any mutable field }  → 200 ConfigUser
DELETE /users/:id → 204   (cascades configs + subscriptions)
POST   /users/:id/reset-uuid → 200 ConfigUser   (new UUID; configs rebuilt)
```

## Backends

```
GET    /backends?status=            → 200 Backend[]
POST   /backends                    → 201 Backend | 409 NAME_TAKEN
PATCH  /backends/:id                → 200 Backend
DELETE /backends/:id                → 204   (cascades configs)
POST   /backends/:id/test           → 200 { latencyMs } | 502 BACKEND_UNREACHABLE
```

## Configs

```
GET    /configs?search=&protocol=&userId=&backendId=&page=&perPage=
                  → 200 Paginated<Config>
DELETE /configs/:id        → 204
POST   /configs/:id/rebuild → 200 Config    (rebuild URI from current data)
POST   /configs/generate    { userId, backendIds } → 200 Config[]
                             (idempotent per user×backend pair)
```

## Subscriptions

```
GET    /subscriptions?userId=       → 200 Subscription[]
POST   /subscriptions { userId, name, format }
                  → 201 Subscription
PATCH  /subscriptions/:id { name?, format?, expiresAt? } → 200 Subscription
DELETE /subscriptions/:id   → 204
POST   /subscriptions/:id/rotate-token → 200 Subscription   (new token)
```

## Admins (owner-only mutations)

```
GET    /admins            → 200 PanelAdmin[]
POST   /admins { username, password, role } → 201 PanelAdmin | 409 USERNAME_TAKEN
PATCH  /admins/:id { role?, isActive? }     → 200 PanelAdmin
DELETE /admins/:id → 204 | 409 LAST_OWNER   (cannot delete self / last owner)
```

## Settings

```
GET   /settings           → 200 { key: value, ... }
PATCH /settings { key: value, ... } → 200 { ... }   (owner-only)
```

## Stats

```
GET /stats/overview → 200 StatsOverview
    { totals: { users, activeUsers, configs, backends: {total, active},
                subscriptions: {total, active} },
      configsPerDay: [{ date, count } × 7],
      byProtocol: { vless, vmess, trojan, shadowsocks },
      activity: [{ id, messageKey, params, at }] }
```

`activity[].messageKey` is an i18n key (e.g. `"dashboard.activity.userCreated"`) — the API stores semantic events, the client renders them translated.

## Public subscription delivery

```
GET /sub/:token?format=base64|plain|clash|singbox
```

- Unauthenticated; rate-limited per token.
- Response `text/plain` (base64/plain) or appropriate YAML/JSON for clash/sing-box.
- Updates `access_count` and `last_access_at`.
- `404` envelope when the token is unknown or the subscription is expired.
