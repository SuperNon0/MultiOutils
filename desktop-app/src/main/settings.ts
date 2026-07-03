import type Database from 'better-sqlite3';
import { DEFAULT_FILENAME_TEMPLATE } from '@multioutils/shared';
import { DEFAULT_SHORTCUTS, type AppSettings } from '../common/types';

export function buildDefaults(defaultStorageDir: string): AppSettings {
  return {
    language: 'fr',
    theme: 'dark',
    autostart: false,
    startMinimized: false,
    closeToTray: true,
    clipboardAuto: true,
    openEditorAfterCapture: false,
    includeCursor: false,
    defaultFormat: 'png',
    jpgQuality: 90,
    storageDir: defaultStorageDir,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
    captureAllScreens: false,
    delayedSeconds: 5,
    counter: 1,
    firstRunDone: false,
    shortcuts: { ...DEFAULT_SHORTCUTS }
  };
}

/**
 * Réglages persistés dans la table `settings` (clé/valeur JSON, docs/01 §4.1),
 * avec fusion des valeurs par défaut.
 */
export class SettingsStore {
  private cache: AppSettings;
  private readonly defaults: AppSettings;
  private readonly getStmt;
  private readonly setStmt;

  constructor(
    private db: Database.Database,
    defaultStorageDir: string
  ) {
    this.defaults = buildDefaults(defaultStorageDir);
    this.getStmt = this.db.prepare('SELECT key, value FROM settings');
    this.setStmt = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    this.cache = this.load();
  }

  private load(): AppSettings {
    const merged: AppSettings = {
      ...this.defaults,
      shortcuts: { ...this.defaults.shortcuts }
    };
    const rows = this.getStmt.all() as Array<{ key: string; value: string }>;
    for (const row of rows) {
      if (!(row.key in merged)) continue;
      try {
        const value = JSON.parse(row.value);
        if (row.key === 'shortcuts' && value && typeof value === 'object') {
          merged.shortcuts = { ...merged.shortcuts, ...value };
        } else {
          (merged as unknown as Record<string, unknown>)[row.key] = value;
        }
      } catch {
        // valeur corrompue → on garde le défaut
      }
    }
    return merged;
  }

  get(): AppSettings {
    return { ...this.cache, shortcuts: { ...this.cache.shortcuts } };
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const next = {
      ...this.cache,
      ...patch,
      shortcuts: { ...this.cache.shortcuts, ...(patch.shortcuts ?? {}) }
    };
    const write = this.db.transaction(() => {
      for (const key of Object.keys(patch) as Array<keyof AppSettings>) {
        this.setStmt.run(key, JSON.stringify(next[key]));
      }
    });
    write();
    this.cache = next;
    return this.get();
  }

  /** Valeur puis incrément du compteur {counter} du modèle de nom. */
  nextCounter(): number {
    const value = this.cache.counter;
    this.set({ counter: value + 1 });
    return value;
  }
}
