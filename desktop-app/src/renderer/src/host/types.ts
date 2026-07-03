import type { ReactNode } from 'react';
import type { AppSettings, ShortcutId } from '../../../common/types';
import type { PreloadApi } from '../../../common/api';

/**
 * Contrat d'un module (outil) côté renderer — docs/01 §2.1.
 * Les contributions au tray et les raccourcis globaux vivent côté process
 * main (MainToolModule) car ce sont des API Electron du main ; voir
 * docs/06-decisions-techniques.md.
 */
export interface ToolModule {
  /** "screenshot", "color-picker", … */
  id: string;
  /** Clé i18n du libellé affiché. */
  name: string;
  /** Nom d'icône (jeu interne, host/Icon.tsx). */
  icon: string;
  /** Position dans la barre latérale. */
  order: number;
  activate(ctx: HostContext): void | Promise<void>;
  deactivate?(): void;
  /** Vue principale de l'outil. */
  renderPanel(): ReactNode;
  /** Page de réglages de l'outil (section ajoutée aux Paramètres). */
  settingsPanel?(): ReactNode;
}

/** Services que l'hôte met à disposition des modules — docs/01 §2.1. */
export interface HostContext {
  /** Accès bibliothèque + fichiers via IPC (StorageApi). */
  storage: PreloadApi['library'];
  notify(msg: string): void;
  registerShortcut(def: { id: ShortcutId | string; accelerator: string }): void;
  openTool(id: string): void;
  settings: {
    get(): AppSettings;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
}
