-- Dashboard "recent activity" feed.
-- Semantic events only: message_key is an i18n key resolved client-side
-- (e.g. "dashboard.activity.userCreated") and params is a JSON object of
-- interpolation values. Bounded by the repository (keeps the newest tail).

CREATE TABLE activity_log (
  id          TEXT PRIMARY KEY,
  message_key TEXT NOT NULL,
  params      TEXT NOT NULL,   -- JSON object of interpolation params
  at          INTEGER NOT NULL
);

CREATE INDEX idx_activity_at ON activity_log (at);
