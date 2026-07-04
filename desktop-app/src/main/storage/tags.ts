import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Tag } from '@multioutils/shared';

interface Row {
  id: string;
  name: string;
  color: string | null;
}

/** Étiquettes colorées, classement multiple (docs/03 §2). */
export class TagRepo {
  constructor(private db: Database.Database) {}

  list(): Tag[] {
    return (
      this.db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all() as Row[]
    ).map((row) => ({ id: row.id, name: row.name, color: row.color }));
  }

  /** Crée le tag, ou rend l'existant si le nom est déjà pris (UNIQUE). */
  create(name: string, color: string | null): Tag {
    const existing = this.db
      .prepare('SELECT * FROM tags WHERE name = ?')
      .get(name) as Row | undefined;
    if (existing) {
      return { id: existing.id, name: existing.name, color: existing.color };
    }
    const tag: Tag = { id: randomUUID(), name, color };
    this.db
      .prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)')
      .run(tag.id, tag.name, tag.color);
    return tag;
  }

  update(id: string, patch: { name?: string; color?: string | null }): void {
    if (patch.name !== undefined) {
      this.db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(patch.name, id);
    }
    if (patch.color !== undefined) {
      this.db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(patch.color, id);
    }
  }

  delete(id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM capture_tags WHERE tag_id = ?').run(id);
      this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    });
    tx();
  }
}
