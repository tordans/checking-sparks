-- Initial schema. Keep it portable: MariaDB 10.11 in production, SQLite in tests.
-- One statement per semicolon; no semicolons inside string literals (the runner splits on them).

-- The single encrypted family document. Always row id 1. The envelope is stored as JSON text
-- (MEDIUMTEXT = 16 MB in MariaDB; the request limit is 2 MB).
CREATE TABLE IF NOT EXISTS doc (
  id         INTEGER NOT NULL PRIMARY KEY,
  version    INTEGER NOT NULL,
  envelope   MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

-- Reminder plan pushed by the app. due_at is UTC ('YYYY-MM-DD HH:MM:SS').
-- sent_at is set when the reminder was delivered or skipped; skipped = 1 means it was
-- too old when the cron job got to it and was never sent.
CREATE TABLE IF NOT EXISTS reminders (
  id      VARCHAR(200) NOT NULL PRIMARY KEY,
  due_at  DATETIME NOT NULL,
  title   VARCHAR(200) NOT NULL,
  body    VARCHAR(1000) NOT NULL,
  path    VARCHAR(300) NOT NULL,
  sent_at DATETIME NULL,
  skipped INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders (sent_at, due_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint        VARCHAR(500) NOT NULL PRIMARY KEY,
  p256dh          VARCHAR(255) NOT NULL,
  auth            VARCHAR(255) NOT NULL,
  label           VARCHAR(100) NOT NULL DEFAULT '',
  created_at      DATETIME NOT NULL,
  last_success_at DATETIME NULL
);
