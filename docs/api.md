# API Reference (contract)

Base URL: `/api/v1`. All bodies are JSON. Authentication (except `/sub/:token` and `/auth/login`) uses `Authorization: Bearer <JWT>`.

**Status in this phase:** every endpoint group below is implemented on D1 — `auth`, `admins`, `settings`, `users`, `backends`, `configs`, `subscriptions`, `stats` and the public `/sub/:token` delivery. Per-token rate limiting (`RATE_LIMITED`) is reserved for a later phase. The frontend mock adapter implements the identical contract against seed data.

## Error envelope

Every non-2xx response:

```json
{ "error": { "code": "CONFLICT", "message": "Human-readable detail." } }
```

Stable codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT`, `USERNAME_TAKEN`, `NAME_TAKEN`, `LAST_OWNER`, `SETUP_ALREADY_DONE` (409), `WRONG_PASSWORD` (400), `BACKEND_UNREACHABLE` (502), settings codes below, `RATE_LIMITED` (429), `NOT_IMPLEMENTED` (501), `INTERNAL` (500).

## Health

```
GET /api/v1/health → 200 { "status": "ok", "version": "0.1.0" }
```

## Auth

```
GET  /auth/status  → 200 { "needsSetup": boolean }                    (public)
POST /auth/setup   { username, password }                             (public; only while needsSetup)
                   → 201 { token, admin: { id, username, role } }     (role is always "owner")
                   → 409 SETUP_ALREADY_DONE | 400 VALIDATION_ERROR
POST /auth/login   { username, password }
                   → 200 { token, admin: { id, username, role } }
                   → 401 UNAUTHORIZED
POST /auth/logout  (Bearer) → 204   (revokes the presented token; idempotent)
PATCH /auth/password (Bearer) { currentPassword, newPassword }
                   → 204   (revokes ALL of the admin's sessions, including the current one)
                   → 400 WRONG_PASSWORD | 400 VALIDATION_ERROR
```

Session policy: HS256 JWT, 24 h TTL, `sub` = admin id, `role` claim (role and
active status are re-checked against the DB on every request, so role changes
and deactivation take effect immediately). Every issued token gets a row in
`sessions` keyed by SHA-256(token); logout deletes that row, password change
deletes all of the admin's rows, expired rows are swept opportunistically at
login. Validation: username `^[A-Za-z0-9._-]{3,32}$`; password ≥ 8 chars.

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
PATCH  /subscriptions/:id { name?, format?, expiresAt?, includeInactive? } → 200 Subscription
DELETE /subscriptions/:id   → 204
POST   /subscriptions/:id/rotate-token → 200 Subscription   (new token)
```

## Admins (owner-only mutations)

```
GET    /admins            → 200 PanelAdmin[]
POST   /admins { username, password, role } → 201 PanelAdmin | 409 USERNAME_TAKEN
PATCH  /admins/:id { role?, isActive? }
                          → 200 PanelAdmin
                          | 409 LAST_OWNER  (demoting/deactivating the only owner)
                          | 409 CONFLICT    (deactivating your own account)
DELETE /admins/:id → 204
                          | 409 CONFLICT    (deleting your own account)
                          | 409 LAST_OWNER  (deleting the only owner)
```

Deactivated or demoted admins lose access immediately — `requireAuth`
re-reads role/isActive from the DB on every request. Admin deletion
cascades their session rows via FK.

## Settings

```
GET   /settings           → 200 PanelSettings { general: {...}, network: {...} }
PATCH /settings { general?: {...}, network?: {...} }
                          → 200 PanelSettings
                          | 400 VALIDATION_ERROR
                          | 400 INVALID_FRAGMENT_LENGTH | INVALID_FRAGMENT_DELAY
                                | INVALID_FRAGMENT_SPLIT | INVALID_PORTS
                                | INVALID_PING_INTERVAL | INVALID_DOH_URL
                                | INVALID_ECH_SERVER_NAME
                          | 409 FRAGMENT_ECH_CONFLICT
                          (owner & admin edit; viewer → 403 FORBIDDEN)
```

`network` covers the BPB-parity block: `fragment` (mode/packets/length/delay/maxSplit),
`ech`, `tcpFastOpen`, `bestPingInterval`, `customCdn` (addrs/host/sni), `cleanIPs`,
`proxyIPs`, `ports`, `fingerprint`, `dns` (local/antiSanction/remote/fakeDns).
Fragment and ECH are mutually exclusive — fragment wins when `fragment.mode === "custom"`.


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

## Local development (API)

```bash
cd apps/api
cp .dev.vars.example .dev.vars        # then edit JWT_SECRET to a long random string
npx wrangler d1 migrations apply nexpanel-db --local
npm run dev                           # http://127.0.0.1:8787
```

The panel stays on the mock adapter by default (`VITE_API_MODE`); the real
HTTP adapter is a later phase.
