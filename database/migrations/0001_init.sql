-- NexPanel initial schema.
-- Conventions (docs/database.md):
--   * Primary keys are TEXT UUIDs (generated application-side).
--   * Timestamps are unix seconds (INTEGER), NULL where "never".
--   * No PRAGMA statements — D1/SQLite portable, plain SQL only.

CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,            -- PBKDF2, format: pbkdf2$iterations$salt$hash
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 of the JWT, for revocation
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_admin ON sessions (admin_id);

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  uuid        TEXT NOT NULL UNIQUE,       -- client credential embedded in config URIs
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  quota_bytes INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  used_bytes  INTEGER NOT NULL DEFAULT 0,
  expiry_at   INTEGER,                    -- NULL = never expires
  ip_limit    INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_users_status ON users (status);

CREATE TABLE backends (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  protocol           TEXT NOT NULL CHECK (protocol IN ('vless', 'vmess', 'trojan', 'shadowsocks')),
  host               TEXT NOT NULL,
  port               INTEGER NOT NULL,
  transport          TEXT NOT NULL CHECK (transport IN ('tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp')),
  security           TEXT NOT NULL CHECK (security IN ('none', 'tls', 'reality')),
  sni                TEXT,
  host_header        TEXT,
  path               TEXT,
  service_name       TEXT,
  uuid               TEXT,
  password           TEXT,
  method             TEXT,                 -- shadowsocks cipher
  reality_public_key TEXT,
  reality_short_id   TEXT,
  fingerprint        TEXT,
  allow_insecure     INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE configs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  backend_id  TEXT NOT NULL REFERENCES backends (id) ON DELETE CASCADE,
  protocol    TEXT NOT NULL CHECK (protocol IN ('vless', 'vmess', 'trojan', 'shadowsocks')),
  name        TEXT NOT NULL,
  uri         TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (user_id, backend_id)
);

CREATE INDEX idx_configs_user ON configs (user_id);
CREATE INDEX idx_configs_backend ON configs (backend_id);

CREATE TABLE subscriptions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL DEFAULT 'default',
  format           TEXT NOT NULL DEFAULT 'base64'
                     CHECK (format IN ('base64', 'plain', 'clash', 'singbox')),
  include_inactive INTEGER NOT NULL DEFAULT 0,
  expires_at       INTEGER,
  last_access_at   INTEGER,
  access_count     INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,               -- JSON-encoded scalar/object
  updated_at INTEGER NOT NULL
);
