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
  /**
   * Route HTTP enrichie du service localhost (GET/POST) pour le plugin Stream
   * Deck — ex. lister des profils. `handler` reçoit l'URL analysée et renvoie
   * la valeur JSON à sérialiser (undefined → 204).
   */
  registerLocalRoute(
    method: string,
    pattern: RegExp,
    handler: (url: URL, body?: unknown) => unknown | Promise<unknown>
  ): void;
  /** Lanceur : une commande locale existe-t-elle ? / l'exécuter (false si inconnue). */
  hasLocalCommand?(id: string): boolean;
  runLocalCommand?(id: string): Promise<boolean>;
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
  /** Outils dont l'activation a échoué : exclus du menu de la barre des tâches. */
  private failed = new Set<string>();

  register(module: MainToolModule): void {
    this.modules.push(module);
  }

  async activateAll(ctx: MainHostContext): Promise<void> {
    for (const module of this.modules) {
      // Un outil qui échoue au démarrage ne doit pas empêcher l'appli (tray,
      // mises à jour, autres outils) de se lancer.
      try {
        await module.activate(ctx);
      } catch (err) {
        this.failed.add(module.id);
        console.error(`[modules] échec de l'activation de « ${module.id} »`, err);
      }
    }
  }

  trayItems(ctx: MainHostContext): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = [];
    for (const module of this.modules) {
      // Un outil non démarré ou dont le menu plante ne doit pas casser l'icône
      // de la barre des tâches (créée avant la fenêtre principale).
      if (this.failed.has(module.id)) continue;
      let contributed: MenuItemConstructorOptions[] = [];
      try {
        contributed = module.trayMenuItems?.(ctx) ?? [];
      } catch (err) {
        console.error(`[modules] menu de « ${module.id} » indisponible`, err);
      }
      if (contributed.length > 0) {
        if (items.length > 0) items.push({ type: 'separator' });
        items.push(...contributed);
      }
    }
    return items;
  }

  deactivateAll(): void {
    // Chaque arrêt isolé : un outil à moitié démarré peut lever une erreur.
    for (const module of this.modules) {
      try {
        module.deactivate?.();
      } catch (err) {
        console.error(`[modules] arrêt de « ${module.id} » incomplet`, err);
      }
    }
  }
}
