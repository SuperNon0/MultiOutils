import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Capture, RemoteState } from '@multioutils/shared';
import type { LibraryView, SortKey } from '../../common/types';

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
