import argon2 from 'argon2';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from './db';

// L'identité HUMAINE (session, Cloudflare, mot de passe de secours local) est
// gérée par `security.ts`. Ce module ne garde que les JETONS D'API machine.

// ── Jetons d'API (docs/04 §1) ────────────────────────────────────────────

export interface TokenInfo {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked: number;
}

/** Crée un jeton : le clair n'est rendu qu'UNE fois, seul le hash est stocké. */
export async function createToken(name: string): Promise<{ id: string; token: string }> {
  const token = `mo_${randomBytes(32).toString('base64url')}`;
  const hash = await argon2.hash(token, { type: argon2.argon2id });
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO api_tokens (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, name || null, hash, new Date().toISOString());
  return { id, token };
}

export function listTokens(): TokenInfo[] {
  return getDb()
    .prepare(
      'SELECT id, name, created_at, last_used_at, revoked FROM api_tokens ORDER BY created_at DESC'
    )
    .all() as TokenInfo[];
}

export function revokeToken(id: string): void {
  getDb().prepare('UPDATE api_tokens SET revoked = 1 WHERE id = ?').run(id);
}

async function findValidToken(raw: string): Promise<string | null> {
  const rows = getDb()
    .prepare('SELECT id, token_hash FROM api_tokens WHERE revoked = 0')
    .all() as Array<{ id: string; token_hash: string }>;
  for (const row of rows) {
    const ok = await argon2.verify(row.token_hash, raw).catch(() => false);
    if (ok) {
      getDb()
        .prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
        .run(new Date().toISOString(), row.id);
      return row.id;
    }
  }
  return null;
}

// ── Middlewares ─────────────────────────────────────────────────────────

/** API : jeton Bearer obligatoire. */
export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!raw) {
    res.status(401).json({ error: 'jeton invalide' });
    return;
  }
  void findValidToken(raw).then((id) => {
    if (id) next();
    else res.status(401).json({ error: 'jeton invalide' });
  });
}

/** Média : accessible avec session humaine OU jeton (jamais public). */
export function requireSessionOrToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.session.auth) {
    next();
    return;
  }
  requireApiToken(req, res, next);
}
