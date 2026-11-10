import Database from 'better-sqlite3';

/** Schéma de la base locale — copie conforme de docs/01-architecture.md §4.1. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS captures (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  path          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  width         INTEGER, height INTEGER,
  size_bytes    INTEGER,
  folder_id     TEXT REFERENCES folders(id),
  favorite      INTEGER NOT NULL DEFAULT 0,
  annotations   TEXT,
  remote_state  TEXT NOT NULL DEFAULT 'none',
  remote_id     TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES folders(id),
  color      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE IF NOT EXISTS capture_tags (
  capture_id TEXT REFERENCES captures(id),
  tag_id     TEXT REFERENCES tags(id),
  PRIMARY KEY (capture_id, tag_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT
);

CREATE TABLE IF NOT EXISTS capture_translations (
  capture_id      TEXT PRIMARY KEY REFERENCES captures(id) ON DELETE CASCADE,
  target_lang     TEXT NOT NULL,
  source_language TEXT,
  original        TEXT NOT NULL,
  translated      TEXT NOT NULL,
  model           TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at);
CREATE INDEX IF NOT EXISTS idx_captures_deleted ON captures(deleted_at);
`;

export function openDb(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
