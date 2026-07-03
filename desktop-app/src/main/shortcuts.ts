import { globalShortcut } from 'electron';
import type { ShortcutStatus } from '../common/types';

export interface GlobalShortcutDef {
  id: string;
  accelerator: string;
  run(): void;
}

/**
 * Raccourcis clavier globaux (docs/00 §1.2) : fonctionnent sans focus,
 * réassignables, avec détection de conflit (l'enregistrement échoue si la
 * combinaison est déjà prise par une autre application).
 */
export class ShortcutManager {
  private defs = new Map<string, GlobalShortcutDef>();

  register(def: GlobalShortcutDef): void {
    this.defs.set(def.id, def);
  }

  setAccelerator(id: string, accelerator: string): void {
    const def = this.defs.get(id);
    if (def) def.accelerator = accelerator;
  }

  /** (Ré)enregistre tous les raccourcis et rapporte les conflits. */
  applyAll(): ShortcutStatus[] {
    globalShortcut.unregisterAll();
    const statuses: ShortcutStatus[] = [];
    for (const def of this.defs.values()) {
      let ok = false;
      if (def.accelerator) {
        try {
          ok = globalShortcut.register(def.accelerator, def.run);
        } catch {
          ok = false;
        }
      }
      statuses.push({ id: def.id, accelerator: def.accelerator, ok });
    }
    return statuses;
  }

  status(): ShortcutStatus[] {
    return [...this.defs.values()].map((def) => ({
      id: def.id,
      accelerator: def.accelerator,
      ok: def.accelerator ? globalShortcut.isRegistered(def.accelerator) : false
    }));
  }

  dispose(): void {
    globalShortcut.unregisterAll();
    this.defs.clear();
  }
}
