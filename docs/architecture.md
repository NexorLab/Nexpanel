# Architecture

NexPanel is a proxy-config management panel designed to run on **Cloudflare Workers today** and on a **self-hosted server later** without a rewrite. Portability is achieved by constraining every layer to Web-standard APIs and by hiding storage behind interfaces.

## Monorepo layout

```
nexpanel/
├── apps/
│   ├── panel/          React 19 + Vite SPA (Persian RTL + English, light/dark)
│   └── api/            Hono API — Workers entry, future Node entry
├── packages/
│   └── core/           Shared, environment-agnostic domain logic
├── database/
│   └── migrations/     Plain SQL migrations (D1 today, SQLite later)
└── docs/
```

There is deliberately **one shared package** (`@nexpanel/core`). Feature logic lives in vertical slices inside each app (`apps/api/src/routes/*`), not in per-feature packages.

## Layer rules

| Layer | May import from | Must never use |
|---|---|---|
| `packages/core` | nothing internal | Node built-ins, DOM, fetch to private services |
| `apps/api` | `@nexpanel/core` | Node-only crypto, filesystem paths as contracts |
| `apps/panel` | `@nexpanel/core` (types only) | server secrets of any kind |

`packages/core` is the portability guarantee: URI builders, password hashing (PBKDF2) and JWT (HS256) are implemented **only** with `crypto.subtle`, `btoa/atob`, `TextEncoder` — the exact subset available on both Workers and Node ≥ 18.

## Runtime topology (Cloudflare phase)

```
Browser (SPA)
   │  /api/v1/*        JSON, Bearer JWT, error envelope {error:{code,message}}
   │  /sub/:token      public, consumed by proxy clients
   ▼
Cloudflare Worker (apps/api, Hono)
   │
   ├── D1 (SQLite)      users, backends, configs, subscriptions, admins
   └── Worker secrets   JWT_SECRET (never in wrangler.jsonc)
```

The SPA is static — served from Workers Assets or any CDN — and talks to the API only through the versioned `/api/v1` contract.

## Runtime topology (self-hosted phase)

Only two things change:

1. **Storage**: implement `RepositoryBundle` (see `packages/core/src/storage/repository.ts`) over `node:sqlite`/better-sqlite3 with the same interfaces.
2. **Entry**: mount the same Hono `createApp()` on a Node adapter (`@hono/node-server`).

No route, service, protocol-builder or crypto code changes. This is enforced by the layer table above and reviewed per-PR.

## Data conventions

- Primary keys: TEXT UUIDs, generated **application-side** (`crypto.randomUUID()`).
- Timestamps: unix seconds, INTEGER columns; NULL means "never".
- Cascades: deleting a user or backend removes its configs/subscriptions (FK `ON DELETE CASCADE`).
- `configs` is idempotent per pair: `UNIQUE(user_id, backend_id)` — "generate" is an upsert.

## Auth model

- Local credential login → JWT HS256 (24 h TTL, `sub` = admin id, `role` claim).
- Roles: `owner > admin > viewer`; mutations on admins/settings are owner-only.
- Sessions table stores SHA-256 hashes of issued JWTs so tokens can be revoked.

## API contract

See [api.md](./api.md). Every error is `{ "error": { "code": "...", "message": "..." } }` with a stable `code` that the frontend maps to translated text.

## Frontend data layer

`apps/panel/src/lib/api/endpoints.ts` defines the `ApiClient` interface that mirrors the REST contract. The current `VITE_API_MODE=mock` adapter implements it against in-memory seed data; the real HTTP adapter implements the same interface, so swapping modes is a one-line change and every page works identically.
