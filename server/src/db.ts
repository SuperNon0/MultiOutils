import Database from 'better-sqlite3';
import path from 'node:path';
import { env } from './env';

/** Schéma — copie conforme de docs/01-architecture.md §4.2. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE,
  password_hash TEXT NOT NULL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY, name TEXT,
  token_hash TEXT NOT NULL, created_at TEXT, last_used_at TEXT, revoked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY, filename TEXT, path TEXT, created_at TEXT,
  width INTEGER, height INTEGER, size_bytes INTEGER,
  folder TEXT, tags TEXT
);
CREATE INDEX IF NOT EXISTS idx_srv_captures_created ON captures(created_at);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(env.dataDir, 'multioutils-server.db'));
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
  }
  return db;
}

export interface ServerCapture {
  id: string;
  filename: string;
  path: string;
  created_at: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  folder: string | null;
  tags: string | null; // JSON string[]
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
