import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { requireApiToken, requireSessionOrToken } from '../auth';
import { getDb, parseTags, type ServerCapture, type ServerClip } from '../db';
import { env, uploadsDir } from '../env';
import { VERSION } from '../version';

/** API pour l'app (docs/04 §2). Auth : jeton Bearer. */
export const apiRouter = Router();

const ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
};

const upload = multer({
  dest: path.join(uploadsDir, '.tmp'),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) cb(null, true);
    else cb(new UnsupportedType());
  }
});

class UnsupportedType extends Error {}

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: VERSION });
});

apiRouter.post('/captures', requireApiToken, upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'fichier manquant' });
    return;
  }
  let meta: {
    filename?: string;
    createdAt?: string;
    width?: number;
    height?: number;
    folder?: string | null;
    tags?: string[];
  };
  try {
    meta = JSON.parse(String(req.body.meta ?? '{}'));
  } catch {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: 'métadonnées invalides' });
    return;
  }
  if (!meta.filename) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: 'métadonnées manquantes' });
    return;
  }

  const id = `srv_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const ext = ALLOWED_MIME[file.mimetype] ?? '.png';
  const finalPath = path.join(uploadsDir, `${id}${ext}`);
  fs.renameSync(file.path, finalPath);

  getDb()
    .prepare(
      `INSERT INTO captures (id, filename, path, created_at, width, height, size_bytes, folder, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      String(meta.filename),
      finalPath,
      meta.createdAt ?? new Date().toISOString(),
      meta.width ?? null,
      meta.height ?? null,
      file.size,
      meta.folder ?? null,
      JSON.stringify(Array.isArray(meta.tags) ? meta.tags : [])
    );

  res.status(201).json({ id, url: `/captures/${id}` });
});

const PAGE_SIZE = 60;

export interface CaptureFilters {
  folder?: string;
  tag?: string;
  from?: string;
  to?: string;
  page: number;
}

/** Requête partagée entre l'API et la galerie web. */
export function queryCaptures(filters: CaptureFilters): {
  items: ServerCapture[];
  total: number;
  page: number;
  pages: number;
} {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.folder) {
    where.push('folder = ?');
    params.push(filters.folder);
  }
  if (filters.tag) {
    where.push("tags LIKE '%' || ? || '%'");
    params.push(JSON.stringify(filters.tag).slice(1, -1));
  }
  if (filters.from) {
    where.push('created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('created_at <= ?');
    params.push(`${filters.to}T23:59:59.999Z`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    getDb().prepare(`SELECT COUNT(*) AS n FROM captures ${clause}`).get(...params) as {
      n: number;
    }
  ).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pages);
  const items = getDb()
    .prepare(
      `SELECT * FROM captures ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as ServerCapture[];
  return { items, total, page, pages };
}

apiRouter.get('/captures', requireApiToken, (req, res) => {
  const { items, total, page } = queryCaptures({
    folder: req.query.folder ? String(req.query.folder) : undefined,
    tag: req.query.tag ? String(req.query.tag) : undefined,
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    page: Number(req.query.page ?? 1)
  });
  res.json({
    items: items.map((c) => ({
      id: c.id,
      filename: c.filename,
      createdAt: c.created_at,
      folder: c.folder,
      tags: parseTags(c.tags),
      thumbUrl: `/media/${c.id}`
    })),
    page,
    total
  });
});

// ── Clips (presse-papiers partagé, docs/00 §9.4) ─────────────────────────
// Reçoit les textes/photos partagés depuis l'iPhone (Raccourci iOS), la page
// web « Déposer » ou l'app. L'app PC les récupère via GET /clips.

const MAX_CLIP_TEXT = 256_000;

/** Organisation d'un clip : dossier lisible + noms de tags (comme les captures). */
export interface ClipMeta {
  folder?: string | null;
  tags?: string[];
}

function normalizeTags(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    // multipart : les tags arrivent en JSON string ; ou en « a, b, c »
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(',');
    }
  }
  return Array.isArray(list)
    ? list.map((t) => String(t).trim()).filter((t) => t.length > 0)
    : [];
}

/** Insère un clip texte et retourne son id. */
export function insertTextClip(text: string, source: string, meta: ClipMeta = {}): string {
  const id = `clip_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  getDb()
    .prepare(
      `INSERT INTO clips (id, kind, content, path, filename, size_bytes, source, folder, tags, created_at)
       VALUES (?, 'text', ?, NULL, NULL, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      text.slice(0, MAX_CLIP_TEXT),
      text.length,
      source,
      meta.folder ?? null,
      JSON.stringify(meta.tags ?? []),
      new Date().toISOString()
    );
  return id;
}

/** Déplace le fichier téléversé et insère un clip image ; retourne son id. */
export function insertImageClip(
  file: Express.Multer.File,
  source: string,
  meta: ClipMeta = {}
): string {
  const id = `clip_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const ext = ALLOWED_MIME[file.mimetype] ?? '.png';
  const finalPath = path.join(uploadsDir, `${id}${ext}`);
  fs.renameSync(file.path, finalPath);
  getDb()
    .prepare(
      `INSERT INTO clips (id, kind, content, path, filename, size_bytes, source, folder, tags, created_at)
       VALUES (?, 'image', NULL, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      finalPath,
      file.originalname || `${id}${ext}`,
      file.size,
      source,
      meta.folder ?? null,
      JSON.stringify(meta.tags ?? []),
      new Date().toISOString()
    );
  return id;
}

/** Met à jour dossier/tags d'un clip (app + page web). */
export function organizeClip(id: string, meta: ClipMeta): boolean {
  const existing = getDb().prepare('SELECT 1 FROM clips WHERE id = ?').get(id);
  if (!existing) return false;
  if (meta.folder !== undefined) {
    getDb()
      .prepare('UPDATE clips SET folder = ? WHERE id = ?')
      .run(meta.folder && meta.folder.trim() ? meta.folder.trim() : null, id);
  }
  if (meta.tags !== undefined) {
    getDb()
      .prepare('UPDATE clips SET tags = ? WHERE id = ?')
      .run(JSON.stringify(meta.tags), id);
  }
  return true;
}

apiRouter.post('/clips', requireApiToken, upload.single('file'), (req, res) => {
  const source = String(req.body?.source ?? 'iphone');
  const meta: ClipMeta = {
    folder: req.body?.folder ? String(req.body.folder) : null,
    tags: normalizeTags(req.body?.tags)
  };
  if (req.file) {
    const id = insertImageClip(req.file, source, meta);
    res.status(201).json({ id });
    return;
  }
  const text = String(req.body?.text ?? '').trim();
  if (!text) {
    res.status(400).json({ error: 'texte ou fichier requis' });
    return;
  }
  res.status(201).json({ id: insertTextClip(text, source, meta) });
});

// Organisation (dossier/tags) d'un clip existant — jeton (l'app).
apiRouter.patch('/clips/:id', requireApiToken, (req, res) => {
  const ok = organizeClip(req.params.id, {
    folder: req.body?.folder !== undefined ? (req.body.folder ? String(req.body.folder) : null) : undefined,
    tags: req.body?.tags !== undefined ? normalizeTags(req.body.tags) : undefined
  });
  if (!ok) {
    res.status(404).json({ error: 'ressource inconnue' });
    return;
  }
  res.json({ updated: true });
});

apiRouter.get('/clips', requireApiToken, (req, res) => {
  const since = req.query.since ? String(req.query.since) : '';
  const rows = getDb()
    .prepare(
      'SELECT * FROM clips WHERE created_at > ? ORDER BY created_at DESC LIMIT 200'
    )
    .all(since) as ServerClip[];
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      text: c.kind === 'text' ? c.content : null,
      filename: c.filename,
      createdAt: c.created_at,
      source: c.source ?? 'iphone',
      folder: c.folder,
      tags: parseTags(c.tags)
    }))
  });
});

// Contenu brut : image (ou texte) — session OU jeton, jamais public.
apiRouter.get('/clips/:id/raw', requireSessionOrToken, (req, res) => {
  const clip = getDb()
    .prepare('SELECT * FROM clips WHERE id = ?')
    .get(req.params.id) as ServerClip | undefined;
  if (!clip) {
    res.status(404).json({ error: 'ressource inconnue' });
    return;
  }
  if (clip.kind === 'text') {
    res.type('text/plain').send(clip.content ?? '');
    return;
  }
  if (!clip.path || !fs.existsSync(clip.path)) {
    res.status(404).json({ error: 'fichier absent' });
    return;
  }
  res.sendFile(clip.path);
});

apiRouter.delete('/clips/:id', requireApiToken, (req, res) => {
  const clip = getDb()
    .prepare('SELECT path FROM clips WHERE id = ?')
    .get(req.params.id) as { path: string | null } | undefined;
  if (!clip) {
    res.status(404).json({ error: 'ressource inconnue' });
    return;
  }
  getDb().prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);
  if (clip.path) {
    try {
      fs.unlinkSync(clip.path);
    } catch {
      // fichier déjà absent
    }
  }
  res.json({ deleted: true });
});

apiRouter.delete('/captures/:id', requireApiToken, (req, res) => {
  const row = getDb()
    .prepare('SELECT path FROM captures WHERE id = ?')
    .get(req.params.id) as { path: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'ressource inconnue' });
    return;
  }
  getDb().prepare('DELETE FROM captures WHERE id = ?').run(req.params.id);
  try {
    fs.unlinkSync(row.path);
  } catch {
    // fichier déjà absent
  }
  res.json({ deleted: true });
});

// Erreurs upload : 413 (trop gros) / 415 (type non supporté) — docs/04 §4
apiRouter.use(
  (
    err: unknown,
    _req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'fichier trop volumineux' });
    } else if (err instanceof UnsupportedType) {
      res.status(415).json({ error: 'type de fichier non supporté' });
    } else {
      next(err);
    }
  }
);
