import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell, safeStorage } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ClipItem, ClipsSettings } from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';

/** Extensions reconnues comme image (miniature + copie presse-papiers Windows). */
const IMAGE_EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp'
};

/** Type MIME approximatif à partir de l'extension (fichiers génériques, docs/00 §9.4). */
const EXT_MIME: Record<string, string> = {
  ...IMAGE_EXT_MIME,
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

const ENABLED_KEY = 'clips.enabled';
const RETENTION_KEY = 'clips.retentionHours';
const SYNC_KEY = 'clips.sync';
const LAST_SYNC_KEY = 'clips.lastSync';

// Réglages du serveur distant : mêmes clés que le reste de l'app (réglées dans
// Paramètres → Serveur distant). On les LIT seulement — la config appartient à
// l'hôte, pas à un module.
const REMOTE_URL_KEY = 'remote.url';
const REMOTE_TOKEN_KEY = 'remote.tokenEnc';

const POLL_MS = 900;
const PURGE_MS = 5 * 60_000;
const SYNC_MS = 30_000;
const MAX_TEXT_BYTES = 256_000; // au-delà, le texte est tronqué (copies énormes)
const PREVIEW_CHARS = 240;
const THUMB_MAX = 320;
const DEFAULT_RETENTION_HOURS = 168; // 7 jours

/** Formats presse-papiers marquant un contenu sensible (gestionnaires de mots
 *  de passe : KeePass, 1Password…) — on ne les enregistre JAMAIS. */
const SENSITIVE_FORMAT = /excludeclipboard|passwordmanager|keepass|clipboard.?viewer.?ignore/i;

interface ClipRow {
  id: string;
  kind: 'text' | 'image' | 'file';
  content: string | null;
  path: string | null;
  preview: string;
  pinned: number;
  source: 'local' | 'remote';
  remote_id: string | null;
  folder_id: string | null;
  tags: string | null; // JSON string[] d'ids de tags (taxonomie propre au module)
  filename: string | null;
  size_bytes: number | null;
  mime: string | null;
  created_at: string;
}

function parseTagIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function rowToItem(row: ClipRow): ClipItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.kind === 'text' ? row.content : null,
    preview: row.preview,
    pinned: row.pinned === 1,
    source: row.source,
    remoteId: row.remote_id,
    folderId: row.folder_id,
    tagIds: parseTagIds(row.tags),
    filename: row.filename,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

/**
 * Module « Presse-papiers » (docs/00 §9.4) : chaque copie (Ctrl+C) est ajoutée
 * à une liste locale — épingler = garder, le reste est purgé automatiquement
 * après un délai réglable. Envoi au serveur UNIQUEMENT explicite (bouton),
 * conformément au principe local-first ; en revanche les clips partagés depuis
 * l'iPhone (via le serveur) sont récupérés automatiquement quand un serveur
 * est configuré.
 */
export function createClipboardMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let pollTimer: NodeJS.Timeout | null = null;
  let purgeTimer: NodeJS.Timeout | null = null;
  let syncTimer: NodeJS.Timeout | null = null;
  let lastSignature = '';
  let clipsDir = '';
  /** Ids serveur dont l'image n'a pas pu être décodée : pas de re-tentative en boucle. */
  const undecodable = new Set<string>();

  const kvGet = (key: string): string | null => {
    const row = ctx.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  };
  const kvSet = (key: string, value: string): void => {
    ctx.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value);
  };

  const getSettings = (): ClipsSettings => ({
    enabled: kvGet(ENABLED_KEY) !== '0',
    retentionHours: Number(kvGet(RETENTION_KEY) ?? DEFAULT_RETENTION_HOURS),
    sync: kvGet(SYNC_KEY) !== '0'
  });

  const remoteConfig = (): { url: string; token: string } | null => {
    const url = kvGet(REMOTE_URL_KEY);
    const stored = kvGet(REMOTE_TOKEN_KEY);
    if (!url || !stored) return null;
    let token: string | null = null;
    if (stored.startsWith('enc:')) {
      try {
        token = safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
      } catch {
        token = null;
      }
    } else if (stored.startsWith('plain:')) {
      token = stored.slice(6);
    }
    return token ? { url, token } : null;
  };

  // ── Insertion ────────────────────────────────────────────────────────────

  const textSignature = (text: string): string =>
    `t:${createHash('sha1').update(text).digest('hex')}`;

  const insertText = (
    text: string,
    source: 'local' | 'remote',
    remoteId: string | null
  ): string => {
    const trimmed = text.length > MAX_TEXT_BYTES ? text.slice(0, MAX_TEXT_BYTES) : text;
    const preview = trimmed.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS);
    const id = randomUUID();
    ctx.db
      .prepare(
        `INSERT INTO clips (id, kind, content, path, preview, pinned, source, remote_id, filename, size_bytes, mime, created_at)
         VALUES (?, 'text', ?, NULL, ?, 0, ?, ?, NULL, NULL, NULL, ?)`
      )
      .run(id, trimmed, preview, source, remoteId, new Date().toISOString());
    return id;
  };

  /** filename : renseigné quand l'image provient d'un fichier importé (drag & drop / dialogue). */
  const insertImage = (
    image: Electron.NativeImage,
    source: 'local' | 'remote',
    remoteId: string | null,
    filename: string | null = null
  ): string | null => {
    const png = image.toPNG();
    if (png.length === 0) return null;
    const id = randomUUID();
    const file = path.join(clipsDir, `${id}.png`);
    fs.writeFileSync(file, png);
    // miniature en data URL : la liste s'affiche sans accès disque du renderer
    const { width, height } = image.getSize();
    const thumb =
      Math.max(width, height) > THUMB_MAX
        ? image.resize(
            width >= height ? { width: THUMB_MAX } : { height: THUMB_MAX }
          )
        : image;
    ctx.db
      .prepare(
        `INSERT INTO clips (id, kind, content, path, preview, pinned, source, remote_id, filename, size_bytes, mime, created_at)
         VALUES (?, 'image', NULL, ?, ?, 0, ?, ?, ?, ?, 'image/png', ?)`
      )
      .run(id, file, thumb.toDataURL(), source, remoteId, filename, png.length, new Date().toISOString());
    return id;
  };

  /** Copie un fichier local (drag & drop / dialogue) en tant que clip générique. */
  const insertFile = (
    srcPath: string,
    originalName: string,
    mime: string,
    source: 'local' | 'remote',
    remoteId: string | null
  ): string => {
    const id = randomUUID();
    const ext = path.extname(originalName) || path.extname(srcPath);
    const dest = path.join(clipsDir, `${id}${ext}`);
    fs.copyFileSync(srcPath, dest);
    const size = fs.statSync(dest).size;
    ctx.db
      .prepare(
        `INSERT INTO clips (id, kind, content, path, preview, pinned, source, remote_id, filename, size_bytes, mime, created_at)
         VALUES (?, 'file', NULL, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, dest, originalName, source, remoteId, originalName, size, mime, new Date().toISOString());
    return id;
  };

  /** Écrit un fichier reçu du serveur (bytes déjà téléchargés) en tant que clip générique. */
  const insertFileFromBuffer = (
    buffer: Buffer,
    originalName: string,
    mime: string,
    source: 'local' | 'remote',
    remoteId: string | null
  ): string => {
    const id = randomUUID();
    const ext = path.extname(originalName);
    const dest = path.join(clipsDir, `${id}${ext}`);
    fs.writeFileSync(dest, buffer);
    ctx.db
      .prepare(
        `INSERT INTO clips (id, kind, content, path, preview, pinned, source, remote_id, filename, size_bytes, mime, created_at)
         VALUES (?, 'file', NULL, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, dest, originalName, source, remoteId, originalName, buffer.length, mime, new Date().toISOString());
    return id;
  };

  /** Ajoute un fichier local (chemin réel sur disque) : image → miniature, sinon fichier générique. */
  const addLocalPath = (srcPath: string, source: 'local' | 'remote'): string | null => {
    const originalName = path.basename(srcPath);
    const ext = path.extname(srcPath).toLowerCase();
    const imageMime = IMAGE_EXT_MIME[ext];
    if (imageMime) {
      try {
        const image = nativeImage.createFromPath(srcPath);
        if (!image.isEmpty()) return insertImage(image, source, null, originalName);
      } catch {
        // repli sur fichier générique ci-dessous
      }
    }
    return insertFile(srcPath, originalName, EXT_MIME[ext] ?? 'application/octet-stream', source, null);
  };

  // ── Surveillance du presse-papiers ───────────────────────────────────────

  const poll = (): void => {
    if (!getSettings().enabled) return;
    try {
      const formats = clipboard.availableFormats();
      if (formats.some((f) => SENSITIVE_FORMAT.test(f))) return; // mots de passe

      const text = clipboard.readText();
      if (text && text.trim().length > 0) {
        const signature = textSignature(text);
        if (signature === lastSignature) return;
        lastSignature = signature;
        insertText(text, 'local', null);
        ctx.broadcast('clips:changed');
        return;
      }

      if (formats.some((f) => f.startsWith('image/'))) {
        const image = clipboard.readImage();
        if (image.isEmpty()) return;
        // signature bon marché : dimensions + hachage du bitmap brut
        const { width, height } = image.getSize();
        const signature = `i:${width}x${height}:${createHash('sha1')
          .update(image.toBitmap())
          .digest('hex')}`;
        if (signature === lastSignature) return;
        lastSignature = signature;
        if (insertImage(image, 'local', null)) ctx.broadcast('clips:changed');
      }
    } catch {
      // lecture presse-papiers occasionnellement verrouillée par une autre app
    }
  };

  /** Recopie un élément dans le presse-papiers (sans le ré-enregistrer). */
  const copyToClipboard = (row: ClipRow): void => {
    if (row.kind === 'text' && row.content !== null) {
      lastSignature = textSignature(row.content);
      clipboard.writeText(row.content);
    } else if (row.kind === 'image' && row.path && fs.existsSync(row.path)) {
      const image = nativeImage.createFromPath(row.path);
      const { width, height } = image.getSize();
      lastSignature = `i:${width}x${height}:${createHash('sha1')
        .update(image.toBitmap())
        .digest('hex')}`;
      clipboard.writeImage(image);
    }
  };

  // ── Purge automatique ────────────────────────────────────────────────────

  const purge = (): void => {
    const hours = getSettings().retentionHours;
    if (hours <= 0) return; // jamais
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
    const stale = ctx.db
      .prepare("SELECT id, path FROM clips WHERE pinned = 0 AND created_at < ?")
      .all(cutoff) as Array<{ id: string; path: string | null }>;
    if (stale.length === 0) return;
    for (const row of stale) {
      if (row.path) {
        try {
          fs.unlinkSync(row.path);
        } catch {
          // fichier déjà absent
        }
      }
    }
    ctx.db.prepare('DELETE FROM clips WHERE pinned = 0 AND created_at < ?').run(cutoff);
    ctx.broadcast('clips:changed');
  };

  // ── Envoi explicite au serveur ───────────────────────────────────────────

  /** Chemin lisible du dossier (« Travail / Projet A ») — taxonomie du module. */
  const folderPath = (folderId: string | null): string | null => {
    if (!folderId) return null;
    const all = ctx.db
      .prepare('SELECT id, name, parent_id FROM clip_folders')
      .all() as Array<{ id: string; name: string; parent_id: string | null }>;
    const parts: string[] = [];
    let current = all.find((f) => f.id === folderId);
    let guard = 0;
    while (current && guard++ < 20) {
      parts.unshift(current.name);
      const parentId = current.parent_id;
      current = parentId ? all.find((f) => f.id === parentId) : undefined;
    }
    return parts.length > 0 ? parts.join(' / ') : null;
  };

  /** Noms des tags à partir de leurs ids (tags inexistants ignorés). */
  const tagNames = (ids: string[]): string[] => {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = ctx.db
      .prepare(`SELECT name FROM clip_tags WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  };

  const sendOne = async (row: ClipRow): Promise<void> => {
    const remote = remoteConfig();
    if (!remote) throw new Error('notConfigured');
    const folder = folderPath(row.folder_id);
    const tags = tagNames(parseTagIds(row.tags));
    let res: Response;
    if (row.kind === 'text') {
      res = await fetch(`${remote.url}/api/clips`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${remote.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kind: 'text',
          text: row.content ?? '',
          source: 'app',
          folder,
          tags
        }),
        signal: AbortSignal.timeout(30_000)
      });
    } else {
      if (!row.path || !fs.existsSync(row.path)) throw new Error('gone');
      const buffer = await fs.promises.readFile(row.path);
      const mime = row.kind === 'image' ? 'image/png' : row.mime || 'application/octet-stream';
      const filename = row.kind === 'image' ? `${row.id}.png` : row.filename || path.basename(row.path);
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mime }), filename);
      form.append('source', 'app');
      if (folder) form.append('folder', folder);
      form.append('tags', JSON.stringify(tags));
      res = await fetch(`${remote.url}/api/clips`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${remote.token}` },
        body: form,
        signal: AbortSignal.timeout(120_000)
      });
    }
    if (res.status === 413) throw new Error('tooLarge');
    if (res.status !== 201) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { id: string };
    ctx.db.prepare('UPDATE clips SET remote_id = ? WHERE id = ?').run(body.id, row.id);
  };

  // ── Récupération des clips du serveur (partagés depuis l'iPhone) ─────────

  const syncFromServer = async (): Promise<number> => {
    const settings = getSettings();
    if (!settings.enabled || !settings.sync) return 0;
    const remote = remoteConfig();
    if (!remote) return 0;

    const since = kvGet(LAST_SYNC_KEY) ?? '';
    const res = await fetch(
      `${remote.url}/api/clips?since=${encodeURIComponent(since)}`,
      {
        headers: { Authorization: `Bearer ${remote.token}` },
        signal: AbortSignal.timeout(15_000)
      }
    );
    if (!res.ok) return 0;
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        kind: 'text' | 'image' | 'file';
        text: string | null;
        filename: string | null;
        mime: string | null;
        createdAt: string;
        source: string;
      }>;
    };
    let imported = 0;
    let newest = since;
    for (const item of body.items) {
      if (item.createdAt > newest) newest = item.createdAt;
      // dédup : déjà importé, ou envoyé par nous-mêmes (remote_id connu)
      const known = ctx.db
        .prepare('SELECT 1 FROM clips WHERE remote_id = ?')
        .get(item.id);
      if (known) continue;
      if (item.kind === 'text') {
        insertText(item.text ?? '', 'remote', item.id);
        imported += 1;
      } else if (!undecodable.has(item.id)) {
        try {
          const raw = await fetch(`${remote.url}/api/clips/${item.id}/raw`, {
            headers: { Authorization: `Bearer ${remote.token}` },
            signal: AbortSignal.timeout(120_000)
          });
          if (!raw.ok) continue;
          const buffer = Buffer.from(await raw.arrayBuffer());
          if (item.kind === 'image') {
            const image = nativeImage.createFromBuffer(buffer);
            if (insertImage(image, 'remote', item.id, item.filename)) imported += 1;
            else undecodable.add(item.id); // format non décodable : on n'insiste pas
          } else {
            insertFileFromBuffer(
              buffer,
              item.filename || item.id,
              item.mime || 'application/octet-stream',
              'remote',
              item.id
            );
            imported += 1;
          }
        } catch {
          // fichier irrécupérable pour l'instant : retenté au prochain passage
        }
      }
    }
    if (newest !== since) kvSet(LAST_SYNC_KEY, newest);
    if (imported > 0) {
      ctx.broadcast('clips:changed');
      ctx.notify(ctx.i18n.t('clips.received', { n: imported }));
    }
    return imported;
  };

  const getRow = (id: string): ClipRow | undefined =>
    ctx.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as ClipRow | undefined;

  return {
    id: 'clipboard',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;

      // Tables du module : créées ICI (aucune modification de l'hôte requise).
      // Les dossiers/tags du presse-papiers sont SÉPARÉS de ceux des captures
      // (demande utilisateur) : taxonomie propre au module.
      ctx.db.exec(`
        CREATE TABLE IF NOT EXISTS clips (
          id         TEXT PRIMARY KEY,
          kind       TEXT NOT NULL,
          content    TEXT,
          path       TEXT,
          preview    TEXT NOT NULL,
          pinned     INTEGER NOT NULL DEFAULT 0,
          source     TEXT NOT NULL DEFAULT 'local',
          remote_id  TEXT,
          folder_id  TEXT,
          tags       TEXT,
          filename   TEXT,
          size_bytes INTEGER,
          mime       TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at);
        CREATE TABLE IF NOT EXISTS clip_folders (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          parent_id  TEXT,
          color      TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clip_tags (
          id    TEXT PRIMARY KEY,
          name  TEXT NOT NULL UNIQUE,
          color TEXT
        );
      `);
      // Migration depuis la 0.2.0 (table sans dossier/tags) : ALTER gardé.
      const columns = (
        ctx.db.prepare('PRAGMA table_info(clips)').all() as Array<{ name: string }>
      ).map((c) => c.name);
      if (!columns.includes('folder_id'))
        ctx.db.exec('ALTER TABLE clips ADD COLUMN folder_id TEXT');
      if (!columns.includes('tags')) ctx.db.exec('ALTER TABLE clips ADD COLUMN tags TEXT');
      if (!columns.includes('filename'))
        ctx.db.exec('ALTER TABLE clips ADD COLUMN filename TEXT');
      if (!columns.includes('size_bytes'))
        ctx.db.exec('ALTER TABLE clips ADD COLUMN size_bytes INTEGER');
      if (!columns.includes('mime')) ctx.db.exec('ALTER TABLE clips ADD COLUMN mime TEXT');

      clipsDir = path.join(app.getPath('userData'), 'clips');
      fs.mkdirSync(clipsDir, { recursive: true });

      // amorce la signature avec le contenu actuel pour ne pas capturer
      // ce qui était déjà dans le presse-papiers avant le lancement
      const initial = clipboard.readText();
      if (initial) lastSignature = textSignature(initial);

      pollTimer = setInterval(poll, POLL_MS);
      purgeTimer = setInterval(purge, PURGE_MS);
      syncTimer = setInterval(() => void syncFromServer().catch(() => 0), SYNC_MS);
      purge();
      void syncFromServer().catch(() => 0);

      ipcMain.handle('clips:list', (): ClipItem[] => {
        const rows = ctx.db
          .prepare('SELECT * FROM clips ORDER BY pinned DESC, created_at DESC LIMIT 500')
          .all() as ClipRow[];
        return rows.map(rowToItem);
      });

      ipcMain.handle('clips:copy', (_event, id: string) => {
        const row = getRow(id);
        if (!row) return;
        copyToClipboard(row);
        ctx.notify(ctx.i18n.t('clips.copied'));
      });

      ipcMain.handle('clips:pin', (_event, id: string, pinned: boolean) => {
        ctx.db.prepare('UPDATE clips SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
        ctx.broadcast('clips:changed');
      });

      // Dossier + tags du clip (taxonomie PROPRE au module — clip_folders/clip_tags).
      ipcMain.handle(
        'clips:organize',
        (_event, id: string, patch: { folderId?: string | null; tagIds?: string[] }) => {
          if (patch.folderId !== undefined) {
            ctx.db
              .prepare('UPDATE clips SET folder_id = ? WHERE id = ?')
              .run(patch.folderId, id);
          }
          if (patch.tagIds !== undefined) {
            ctx.db
              .prepare('UPDATE clips SET tags = ? WHERE id = ?')
              .run(JSON.stringify(patch.tagIds), id);
          }
          ctx.broadcast('clips:changed');
        }
      );

      // ── Dossiers du presse-papiers ─────────────────────────────────────
      ipcMain.handle('clips:folders:list', () =>
        (
          ctx.db
            .prepare('SELECT * FROM clip_folders ORDER BY name COLLATE NOCASE')
            .all() as Array<{
            id: string;
            name: string;
            parent_id: string | null;
            color: string | null;
            created_at: string;
          }>
        ).map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parent_id,
          color: f.color,
          createdAt: f.created_at
        }))
      );
      ipcMain.handle(
        'clips:folders:create',
        (_event, name: string, parentId: string | null, color: string | null) => {
          const id = randomUUID();
          ctx.db
            .prepare(
              'INSERT INTO clip_folders (id, name, parent_id, color, created_at) VALUES (?, ?, ?, ?, ?)'
            )
            .run(id, name, parentId, color, new Date().toISOString());
          ctx.broadcast('clips:changed');
          return { id, name, parentId, color, createdAt: new Date().toISOString() };
        }
      );
      ipcMain.handle(
        'clips:folders:update',
        (_event, id: string, patch: { name?: string; color?: string | null }) => {
          if (patch.name !== undefined)
            ctx.db.prepare('UPDATE clip_folders SET name = ? WHERE id = ?').run(patch.name, id);
          if (patch.color !== undefined)
            ctx.db.prepare('UPDATE clip_folders SET color = ? WHERE id = ?').run(patch.color, id);
          ctx.broadcast('clips:changed');
        }
      );
      ipcMain.handle('clips:folders:delete', (_event, id: string) => {
        // les sous-dossiers remontent d'un niveau, les clips redeviennent « non triés »
        const row = ctx.db
          .prepare('SELECT parent_id FROM clip_folders WHERE id = ?')
          .get(id) as { parent_id: string | null } | undefined;
        ctx.db
          .prepare('UPDATE clip_folders SET parent_id = ? WHERE parent_id = ?')
          .run(row?.parent_id ?? null, id);
        ctx.db.prepare('UPDATE clips SET folder_id = NULL WHERE folder_id = ?').run(id);
        ctx.db.prepare('DELETE FROM clip_folders WHERE id = ?').run(id);
        ctx.broadcast('clips:changed');
      });

      // ── Tags du presse-papiers ─────────────────────────────────────────
      ipcMain.handle('clips:tags:list', () =>
        ctx.db
          .prepare('SELECT id, name, color FROM clip_tags ORDER BY name COLLATE NOCASE')
          .all()
      );
      ipcMain.handle('clips:tags:create', (_event, name: string, color: string | null) => {
        const id = randomUUID();
        ctx.db
          .prepare('INSERT OR IGNORE INTO clip_tags (id, name, color) VALUES (?, ?, ?)')
          .run(id, name, color);
        ctx.broadcast('clips:changed');
        return { id, name, color };
      });
      ipcMain.handle(
        'clips:tags:update',
        (_event, id: string, patch: { name?: string; color?: string | null }) => {
          if (patch.name !== undefined)
            ctx.db.prepare('UPDATE clip_tags SET name = ? WHERE id = ?').run(patch.name, id);
          if (patch.color !== undefined)
            ctx.db.prepare('UPDATE clip_tags SET color = ? WHERE id = ?').run(patch.color, id);
          ctx.broadcast('clips:changed');
        }
      );
      ipcMain.handle('clips:tags:delete', (_event, id: string) => {
        // retire le tag de tous les clips (colonne JSON)
        const rows = ctx.db
          .prepare("SELECT id, tags FROM clips WHERE tags LIKE '%' || ? || '%'")
          .all(id) as Array<{ id: string; tags: string | null }>;
        for (const row of rows) {
          const next = parseTagIds(row.tags).filter((t) => t !== id);
          ctx.db.prepare('UPDATE clips SET tags = ? WHERE id = ?').run(JSON.stringify(next), row.id);
        }
        ctx.db.prepare('DELETE FROM clip_tags WHERE id = ?').run(id);
        ctx.broadcast('clips:changed');
      });

      // ── Import de fichiers (PDF, docs, zip… docs/00 §9.4) ───────────────
      ipcMain.handle('clips:importFiles', async () => {
        const win = BrowserWindow.getFocusedWindow() ?? undefined;
        const result = win
          ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
          : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
        if (result.canceled || result.filePaths.length === 0) return;
        for (const filePath of result.filePaths) addLocalPath(filePath, 'local');
        ctx.broadcast('clips:changed');
      });

      // Glisser-déposer sur le panneau : le renderer résout les chemins réels
      // via webUtils.getPathForFile (API files déjà exposée) et les transmet ici.
      ipcMain.handle('clips:addPaths', (_event, paths: string[]) => {
        for (const filePath of paths) {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            addLocalPath(filePath, 'local');
          }
        }
        ctx.broadcast('clips:changed');
      });

      ipcMain.handle('clips:open', (_event, id: string) => {
        const row = getRow(id);
        if (row?.path) void shell.openPath(row.path);
      });

      ipcMain.handle('clips:reveal', (_event, id: string) => {
        const row = getRow(id);
        if (row?.path) shell.showItemInFolder(row.path);
      });

      ipcMain.handle('clips:delete', (_event, id: string) => {
        const row = getRow(id);
        if (row?.path) {
          try {
            fs.unlinkSync(row.path);
          } catch {
            // fichier déjà absent
          }
        }
        ctx.db.prepare('DELETE FROM clips WHERE id = ?').run(id);
        ctx.broadcast('clips:changed');
      });

      ipcMain.handle('clips:clearUnpinned', () => {
        const rows = ctx.db
          .prepare('SELECT path FROM clips WHERE pinned = 0 AND path IS NOT NULL')
          .all() as Array<{ path: string }>;
        for (const row of rows) {
          try {
            fs.unlinkSync(row.path);
          } catch {
            // fichier déjà absent
          }
        }
        ctx.db.prepare('DELETE FROM clips WHERE pinned = 0').run();
        ctx.broadcast('clips:changed');
      });

      ipcMain.handle(
        'clips:send',
        async (_event, id: string): Promise<{ ok: boolean; error?: string }> => {
          const row = getRow(id);
          if (!row) return { ok: false, error: 'gone' };
          try {
            await sendOne(row);
            ctx.broadcast('clips:changed');
            ctx.notify(ctx.i18n.t('clips.sent'));
            return { ok: true };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === 'notConfigured') {
              ctx.notify(ctx.i18n.t('remote.notConfigured'));
              return { ok: false, error: 'notConfigured' };
            }
            if (message === 'tooLarge') {
              ctx.notify(ctx.i18n.t('clips.tooLarge'));
              return { ok: false, error: 'tooLarge' };
            }
            ctx.notify(ctx.i18n.t('clips.sendError'));
            return { ok: false, error: message };
          }
        }
      );

      ipcMain.handle('clips:syncNow', async () => syncFromServer().catch(() => 0));

      ipcMain.handle('clips:getSettings', () => getSettings());
      ipcMain.handle('clips:setSettings', (_event, patch: Partial<ClipsSettings>) => {
        if (patch.enabled !== undefined) kvSet(ENABLED_KEY, patch.enabled ? '1' : '0');
        if (patch.retentionHours !== undefined)
          kvSet(RETENTION_KEY, String(Math.max(0, Math.floor(patch.retentionHours))));
        if (patch.sync !== undefined) kvSet(SYNC_KEY, patch.sync ? '1' : '0');
        return getSettings();
      });

      // Commandes Stream Deck (docs/00 §8)
      ctx.registerLocalCommand('clips.open', () =>
        ctx.showMainWindow({ view: 'tool', toolId: 'clipboard' })
      );
      ctx.registerLocalCommand('clips.copyLast', () => {
        const row = ctx.db
          .prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT 1')
          .get() as ClipRow | undefined;
        if (row) {
          copyToClipboard(row);
          ctx.notify(ctx.i18n.t('clips.copied'));
        }
      });
      ctx.registerLocalCommand('clips.pinCurrent', () => {
        // capture immédiate du presse-papiers courant, puis épingle
        const text = clipboard.readText();
        let id: string | null = null;
        if (text && text.trim().length > 0) {
          lastSignature = textSignature(text);
          id = insertText(text, 'local', null);
        } else {
          const image = clipboard.readImage();
          if (!image.isEmpty()) {
            const { width, height } = image.getSize();
            lastSignature = `i:${width}x${height}:${createHash('sha1')
              .update(image.toBitmap())
              .digest('hex')}`;
            id = insertImage(image, 'local', null);
          }
        }
        if (id) {
          ctx.db.prepare('UPDATE clips SET pinned = 1 WHERE id = ?').run(id);
          ctx.broadcast('clips:changed');
          ctx.notify(ctx.i18n.t('clips.pinnedNotif'));
        }
      });
    },

    trayMenuItems(hostCtx: MainHostContext) {
      return [
        {
          label: hostCtx.i18n.t('clips.tray'),
          click: () => hostCtx.showMainWindow({ view: 'tool', toolId: 'clipboard' })
        }
      ];
    },

    deactivate(): void {
      if (pollTimer) clearInterval(pollTimer);
      if (purgeTimer) clearInterval(purgeTimer);
      if (syncTimer) clearInterval(syncTimer);
      pollTimer = purgeTimer = syncTimer = null;
    }
  };
}
