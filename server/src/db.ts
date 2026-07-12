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
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- 'text' | 'image'
  content TEXT,                -- texte (kind=text)
  path TEXT,                   -- fichier image (kind=image)
  filename TEXT,
  size_bytes INTEGER,
  source TEXT,                 -- 'iphone' | 'web' | 'app'
  folder TEXT,                 -- chemin lisible (« Travail / Projet A »)
  tags TEXT,                   -- JSON string[] de noms de tags
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_srv_clips_created ON clips(created_at);
`;

/** Migration douce : colonnes ajoutées après la 0.2.0 (ALTER gardé). */
function migrate(database: Database.Database): void {
  const columns = (
    database.prepare('PRAGMA table_info(clips)').all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!columns.includes('folder')) database.exec('ALTER TABLE clips ADD COLUMN folder TEXT');
  if (!columns.includes('tags')) database.exec('ALTER TABLE clips ADD COLUMN tags TEXT');
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(env.dataDir, 'multioutils-server.db'));
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    migrate(db);
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

/** Clip (texte ou image) partagé depuis l'iPhone, le web ou l'app. */
export interface ServerClip {
  id: string;
  kind: 'text' | 'image';
  content: string | null;
  path: string | null;
  filename: string | null;
  size_bytes: number | null;
  source: string | null;
  folder: string | null;
  tags: string | null; // JSON string[] de noms
  created_at: string;
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
