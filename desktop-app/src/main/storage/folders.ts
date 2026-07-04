import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Folder } from '@multioutils/shared';

interface Row {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  created_at: string;
}

const rowToFolder = (row: Row): Folder => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  color: row.color,
  createdAt: row.created_at
});

/** Dossiers utilisateur, imbrication via parent_id (docs/03 §1). */
export class FolderRepo {
  constructor(private db: Database.Database) {}

  list(): Folder[] {
    const rows = this.db
      .prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE')
      .all() as Row[];
    return rows.map(rowToFolder);
  }

  create(name: string, parentId: string | null, color: string | null): Folder {
    const folder: Folder = {
      id: randomUUID(),
      name,
      parentId,
      color,
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        'INSERT INTO folders (id, name, parent_id, color, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(folder.id, folder.name, folder.parentId, folder.color, folder.createdAt);
    return folder;
  }

  update(id: string, patch: { name?: string; color?: string | null }): void {
    if (patch.name !== undefined) {
      this.db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(patch.name, id);
    }
    if (patch.color !== undefined) {
      this.db.prepare('UPDATE folders SET color = ? WHERE id = ?').run(patch.color, id);
    }
  }

  /**
   * Suppression : les sous-dossiers remontent au parent du dossier supprimé,
   * ses captures redeviennent « Non triées » (aucune capture n'est supprimée).
   */
  delete(id: string): void {
    const row = this.db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(id) as
      | Pick<Row, 'parent_id'>
      | undefined;
    if (!row) return;
    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ?')
        .run(row.parent_id, id);
      this.db
        .prepare('UPDATE captures SET folder_id = NULL WHERE folder_id = ?')
        .run(id);
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    });
    tx();
  }
}
