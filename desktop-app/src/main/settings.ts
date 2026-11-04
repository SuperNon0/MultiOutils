import type Database from 'better-sqlite3';
import { DEFAULT_FILENAME_TEMPLATE } from '@multioutils/shared';
import {
  APPEARANCE_ACCENTS,
  APPEARANCE_THEMES,
  DEFAULT_APPEARANCE,
  DEFAULT_SHORTCUTS,
  type AppSettings
} from '../common/types';

/** Modèle par défaut de chaque fournisseur de traduction IA. */
export const DEFAULT_AI_MODELS: AppSettings['aiModels'] = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4.1',
  gemini: 'gemini-2.5-flash'
};

/** Valide une apparence lue en base (valeurs inconnues → défaut). */
export function normalizeAppearance(value: unknown): AppSettings['appearance'] {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    accent: APPEARANCE_ACCENTS.includes(v.accent as never)
      ? (v.accent as AppSettings['appearance']['accent'])
      : DEFAULT_APPEARANCE.accent,
    theme: APPEARANCE_THEMES.includes(v.theme as never)
      ? (v.theme as AppSettings['appearance']['theme'])
      : DEFAULT_APPEARANCE.theme
  };
}

export function buildDefaults(defaultStorageDir: string): AppSettings {
  return {
    language: 'fr',
    theme: 'dark',
    appearance: { ...DEFAULT_APPEARANCE },
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
    trashRetentionDays: 30,
    firstRunDone: false,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    ocrLang: 'fra',
    aiProvider: 'anthropic',
    aiModels: { ...DEFAULT_AI_MODELS },
    aiTargetLang: 'Français'
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
      appearance: { ...this.defaults.appearance },
      shortcuts: { ...this.defaults.shortcuts },
      aiModels: { ...this.defaults.aiModels }
    };
    const rows = this.getStmt.all() as Array<{ key: string; value: string }>;
    // Migration : l'ancien réglage `theme` ('dark' | 'light') devient
    // appearance.theme si aucune apparence n'a encore été enregistrée.
    if (!rows.some((r) => r.key === 'appearance')) {
      const old = rows.find((r) => r.key === 'theme');
      try {
        const value = old ? JSON.parse(old.value) : null;
        if (value === 'dark') merged.appearance.theme = 'sombre';
        else if (value === 'light') merged.appearance.theme = 'clair';
      } catch {
        // ancienne valeur illisible → automatique
      }
    }
    for (const row of rows) {
      if (!(row.key in merged)) continue;
      try {
        const value = JSON.parse(row.value);
        if (row.key === 'shortcuts' && value && typeof value === 'object') {
          merged.shortcuts = { ...merged.shortcuts, ...value };
        } else if (row.key === 'aiModels' && value && typeof value === 'object') {
          merged.aiModels = { ...merged.aiModels, ...value };
        } else if (row.key === 'appearance') {
          merged.appearance = normalizeAppearance(value);
        } else if (row.key === 'theme') {
          // ancien réglage : déjà migré ci-dessus
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
    return {
      ...this.cache,
      appearance: { ...this.cache.appearance },
      shortcuts: { ...this.cache.shortcuts },
      aiModels: { ...this.cache.aiModels }
    };
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const next = {
      ...this.cache,
      ...patch,
      appearance: patch.appearance
        ? normalizeAppearance({ ...this.cache.appearance, ...patch.appearance })
        : this.cache.appearance,
      shortcuts: { ...this.cache.shortcuts, ...(patch.shortcuts ?? {}) },
      aiModels: { ...this.cache.aiModels, ...(patch.aiModels ?? {}) }
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
