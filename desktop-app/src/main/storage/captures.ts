import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Capture, RemoteState, Tag } from '@multioutils/shared';
import type {
  CaptureListItem,
  LibraryQuery,
  LibraryView,
  SortKey
} from '../../common/types';

interface Row {
  id: string;
  filename: string;
  path: string;
  created_at: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  folder_id: string | null;
  favorite: number;
  annotations: string | null;
  remote_state: string;
  remote_id: string | null;
  deleted_at: string | null;
}

function rowToCapture(row: Row): Capture {
  return {
    id: row.id,
    filename: row.filename,
    path: row.path,
    createdAt: row.created_at,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    folderId: row.folder_id,
    favorite: row.favorite === 1,
    annotations: row.annotations,
    remoteState: row.remote_state as RemoteState,
    remoteId: row.remote_id,
    deletedAt: row.deleted_at
  };
}

const ORDER_BY: Record<SortKey, string> = {
  date: 'created_at DESC',
  name: 'filename COLLATE NOCASE ASC',
  size: 'size_bytes DESC'
};

/** Accès à la table `captures` + fichiers associés (image + vignette). */
export class CaptureRepo {
  constructor(private db: Database.Database) {}

  insert(c: Capture): void {
    this.db
      .prepare(
        `INSERT INTO captures
         (id, filename, path, created_at, width, height, size_bytes, folder_id,
          favorite, annotations, remote_state, remote_id, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        c.id,
        c.filename,
        c.path,
        c.createdAt,
        c.width,
        c.height,
        c.sizeBytes,
        c.folderId,
        c.favorite ? 1 : 0,
        c.annotations,
        c.remoteState,
        c.remoteId,
        c.deletedAt
      );
  }

  get(id: string): Capture | null {
    const row = this.db.prepare('SELECT * FROM captures WHERE id = ?').get(id) as
      | Row
      | undefined;
    return row ? rowToCapture(row) : null;
  }

  list(view: LibraryView, sort: SortKey = 'date'): Capture[] {
    const where = view === 'trash' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
    const rows = this.db
      .prepare(`SELECT * FROM captures WHERE ${where} ORDER BY ${ORDER_BY[sort]}`)
      .all() as Row[];
    return rows.map(rowToCapture);
  }

  /** Recherche/filtres combinables (docs/03 §5) + étiquettes jointes. */
  query(query: LibraryQuery): CaptureListItem[] {
    const where: string[] = [
      query.view === 'trash' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'
    ];
    const params: unknown[] = [];
    if (query.folderId) {
      where.push('folder_id = ?');
      params.push(query.folderId);
    }
    if (query.unsorted) where.push('folder_id IS NULL');
    if (query.favorites) where.push('favorite = 1');
    if (query.sent) where.push("remote_state = 'sent'");
    if (query.dateFrom) {
      where.push('created_at >= ?');
      params.push(query.dateFrom);
    }
    if (query.search) {
      where.push('filename LIKE ?');
      params.push(`%${query.search}%`);
    }
    if (query.tagIds && query.tagIds.length > 0) {
      const marks = query.tagIds.map(() => '?').join(', ');
      where.push(
        `id IN (SELECT capture_id FROM capture_tags WHERE tag_id IN (${marks})
          GROUP BY capture_id HAVING COUNT(DISTINCT tag_id) = ?)`
      );
      params.push(...query.tagIds, query.tagIds.length);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM captures WHERE ${where.join(' AND ')} ORDER BY ${ORDER_BY[query.sort]}`
      )
      .all(...params) as Row[];

    const tagsByCapture = this.tagsByCapture();
    return rows.map((row) => ({
      ...rowToCapture(row),
      tags: tagsByCapture.get(row.id) ?? []
    }));
  }

  private tagsByCapture(): Map<string, Tag[]> {
    const rows = this.db
      .prepare(
        `SELECT ct.capture_id AS cid, t.id, t.name, t.color
         FROM capture_tags ct JOIN tags t ON t.id = ct.tag_id
         ORDER BY t.name COLLATE NOCASE`
      )
      .all() as Array<{ cid: string; id: string; name: string; color: string | null }>;
    const map = new Map<string, Tag[]>();
    for (const row of rows) {
      const list = map.get(row.cid) ?? [];
      list.push({ id: row.id, name: row.name, color: row.color });
      map.set(row.cid, list);
    }
    return map;
  }

  // ── Opérations en lot (docs/03 §6) ────────────────────────────────────

  setFolder(ids: string[], folderId: string | null): void {
    const stmt = this.db.prepare('UPDATE captures SET folder_id = ? WHERE id = ?');
    const tx = this.db.transaction(() => {
      for (const id of ids) stmt.run(folderId, id);
    });
    tx();
  }

  setFavorite(ids: string[], value: boolean): void {
    const stmt = this.db.prepare('UPDATE captures SET favorite = ? WHERE id = ?');
    const tx = this.db.transaction(() => {
      for (const id of ids) stmt.run(value ? 1 : 0, id);
    });
    tx();
  }

  addTag(ids: string[], tagId: string): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO capture_tags (capture_id, tag_id) VALUES (?, ?)'
    );
    const tx = this.db.transaction(() => {
      for (const id of ids) stmt.run(id, tagId);
    });
    tx();
  }

  removeTag(ids: string[], tagId: string): void {
    const stmt = this.db.prepare(
      'DELETE FROM capture_tags WHERE capture_id = ? AND tag_id = ?'
    );
    const tx = this.db.transaction(() => {
      for (const id of ids) stmt.run(id, tagId);
    });
    tx();
  }

  /** Retrouve les captures à partir de chemins de fichiers (drag natif). */
  idsByPaths(paths: string[]): string[] {
    if (paths.length === 0) return [];
    const marks = paths.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT id FROM captures WHERE path IN (${marks})`)
      .all(...paths) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  /** Vidage automatique de la corbeille après N jours (docs/03 §7). */
  purgeTrash(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const rows = this.db
      .prepare('SELECT id FROM captures WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .all(cutoff) as Array<{ id: string }>;
    for (const row of rows) this.destroy(row.id);
    return rows.length;
  }

  /** Dernière capture active (pour « Dernière capture → presse-papier »). */
  latest(): Capture | null {
    const row = this.db
      .prepare('SELECT * FROM captures WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .get() as Row | undefined;
    return row ? rowToCapture(row) : null;
  }

  rename(id: string, filename: string): void {
    this.db.prepare('UPDATE captures SET filename = ? WHERE id = ?').run(filename, id);
  }

  /** Calque d'annotations (JSON) pour la ré-édition (docs/00 §4.4). */
  setAnnotations(id: string, annotations: string | null): void {
    this.db
      .prepare('UPDATE captures SET annotations = ? WHERE id = ?')
      .run(annotations, id);
  }

  /** Après « Enregistrer » depuis l'éditeur : le fichier aplati a changé. */
  updateImageMeta(
    id: string,
    meta: { width: number; height: number; sizeBytes: number }
  ): void {
    this.db
      .prepare('UPDATE captures SET width = ?, height = ?, size_bytes = ? WHERE id = ?')
      .run(meta.width, meta.height, meta.sizeBytes, id);
  }

  trash(id: string): void {
    this.db
      .prepare('UPDATE captures SET deleted_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  restore(id: string): void {
    this.db.prepare('UPDATE captures SET deleted_at = NULL WHERE id = ?').run(id);
  }

  /** Suppression définitive : ligne + fichier image + vignette. */
  destroy(id: string): void {
    const capture = this.get(id);
    if (!capture) return;
    this.db.prepare('DELETE FROM capture_tags WHERE capture_id = ?').run(id);
    this.db.prepare('DELETE FROM captures WHERE id = ?').run(id);
    for (const file of [capture.path, thumbPathFor(capture), originalPathFor(capture)]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // fichier déjà absent : rien à faire
      }
    }
  }

  emptyTrash(): number {
    const rows = this.list('trash');
    for (const c of rows) this.destroy(c.id);
    return rows.length;
  }
}

/**
 * Chemin de la vignette d'une capture : cache `.thumbs/` à côté de l'image,
 * pour rester valide même si le dossier de stockage change ensuite.
 */
export function thumbPathFor(capture: Pick<Capture, 'id' | 'path'>): string {
  return path.join(path.dirname(capture.path), '.thumbs', `${capture.id}.png`);
}

/**
 * Image ORIGINALE d'une capture éditée : conservée dans `.originals/` avant le
 * premier « Enregistrer » de l'éditeur, pour que la ré-édition reparte
 * toujours des pixels d'origine (le fichier principal est aplati).
 */
export function originalPathFor(capture: Pick<Capture, 'id' | 'path'>): string {
  const ext = path.extname(capture.path) || '.png';
  return path.join(path.dirname(capture.path), '.originals', `${capture.id}${ext}`);
}
