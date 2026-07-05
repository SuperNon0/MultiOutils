import type Database from 'better-sqlite3';
import type { MenuItemConstructorOptions } from 'electron';
import type { EventEmitter } from 'node:events';
import type { NavigateMsg } from '../common/types';
import type { I18n } from './i18n';
import type { SettingsStore } from './settings';
import type { ShortcutManager } from './shortcuts';

/**
 * Contexte fourni par l'hôte aux modules côté main (pendant de HostContext côté
 * renderer, docs/01 §2.1). Un module ne référence jamais un autre module :
 * tout passe par ce contexte.
 */
export interface MainHostContext {
  db: Database.Database;
  settings: SettingsStore;
  i18n: I18n;
  shortcuts: ShortcutManager;
  /** Événements de l'hôte : 'settings-changed', 'tray-refresh', 'tray-tooltip'. */
  events: EventEmitter;
  notify(title: string, body?: string): void;
  showMainWindow(nav?: NavigateMsg): void;
  /** Envoie un message IPC à toutes les fenêtres du renderer. */
  broadcast(channel: string, payload?: unknown): void;
  /** Commandes exposées au service localhost (Stream Deck, docs/00 §8). */
  registerLocalCommand(id: string, run: () => void | Promise<void>): void;
}

/** Contrat d'un outil côté process main. */
export interface MainToolModule {
  id: string;
  activate(ctx: MainHostContext): void | Promise<void>;
  deactivate?(): void;
  /** Entrées ajoutées au menu du tray (reconstruites à chaque refresh). */
  trayMenuItems?(ctx: MainHostContext): MenuItemConstructorOptions[];
}

export class MainModuleRegistry {
  private modules: MainToolModule[] = [];

  register(module: MainToolModule): void {
    this.modules.push(module);
  }

  async activateAll(ctx: MainHostContext): Promise<void> {
    for (const module of this.modules) {
      await module.activate(ctx);
    }
  }

  trayItems(ctx: MainHostContext): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = [];
    for (const module of this.modules) {
      const contributed = module.trayMenuItems?.(ctx) ?? [];
      if (contributed.length > 0) {
        if (items.length > 0) items.push({ type: 'separator' });
        items.push(...contributed);
      }
    }
    return items;
  }

  deactivateAll(): void {
    for (const module of this.modules) module.deactivate?.();
  }
}
