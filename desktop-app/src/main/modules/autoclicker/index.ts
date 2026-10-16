import { ipcMain } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import type {
  AutoclickConfig,
  AutoclickProfile,
  AutoclickState,
  AutoclickStore
} from '../../../common/types';
import { DEFAULT_AUTOCLICK } from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import {
  clickerAvailable,
  clickerError,
  ensureClicker,
  performClick
} from './clicker';

const STORE_KEY = 'autoclick.store';
const LEGACY_KEY = 'autoclick.config'; // v0.4.0 : config unique
const SHORTCUT_ID = 'autoclick.toggle';

/** Intervalle total (ms) entre deux clics, plancher à 1 ms. */
function intervalMs(cfg: AutoclickConfig): number {
  const total =
    cfg.hours * 3_600_000 +
    cfg.minutes * 60_000 +
    cfg.seconds * 1000 +
    cfg.milliseconds;
  return Math.max(1, Math.round(total));
}

/**
 * Module « Autoclic » (docs/00 §9.5) : clique automatiquement à la position du
 * curseur selon des PROFILS nommés. Pilotable depuis l'app, un raccourci global
 * et le Stream Deck (une action « profil » dont la liste se met à jour toute
 * seule via le service localhost). Un seul profil s'exécute à la fois.
 */
export function createAutoclickerMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let timer: NodeJS.Timeout | null = null;
  let runningId: string | null = null;
  let remaining = 0; // > 0 : clics restants ; -1 : illimité
  let done = 0;
  let lastShortcut = '';

  const kvGet = (key: string): string | null => {
    const row = ctx.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  };
  const kvSet = (key: string, value: string): void => {
    ctx.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value);
  };

  const makeProfile = (name: string, base?: Partial<AutoclickConfig>): AutoclickProfile => ({
    id: `p_${randomUUID().replaceAll('-', '').slice(0, 10)}`,
    name,
    ...DEFAULT_AUTOCLICK,
    ...base
  });

  const saveStore = (store: AutoclickStore): void =>
    kvSet(STORE_KEY, JSON.stringify(store));

  /** Charge le magasin, migre l'ancienne config unique, garantit ≥ 1 profil. */
  const getStore = (): AutoclickStore => {
    const raw = kvGet(STORE_KEY);
    let store: AutoclickStore | null = null;
    if (raw) {
      try {
        store = JSON.parse(raw) as AutoclickStore;
      } catch {
        store = null;
      }
    }
    if (!store || !Array.isArray(store.profiles) || store.profiles.length === 0) {
      // Migration depuis la 0.4.0 (clé autoclick.config) ou amorçage par défaut.
      let base: Partial<AutoclickConfig> = {};
      let shortcut = 'F6';
      const legacy = kvGet(LEGACY_KEY);
      if (legacy) {
        try {
          const old = JSON.parse(legacy) as Partial<AutoclickConfig> & { shortcut?: string };
          base = old;
          if (typeof old.shortcut === 'string') shortcut = old.shortcut;
        } catch {
          // ignore
        }
      }
      const profile = makeProfile('Profil 1', base);
      store = { profiles: [profile], selectedId: profile.id, shortcut };
      saveStore(store);
    }
    // Garde-fous : selectedId valide, shortcut défini.
    if (typeof store.shortcut !== 'string') store.shortcut = 'F6';
    if (!store.profiles.some((p) => p.id === store!.selectedId)) {
      store.selectedId = store.profiles[0]?.id ?? null;
    }
    return store;
  };

  const getState = (): AutoclickState => ({
    runningProfileId: runningId,
    remaining: remaining < 0 ? null : remaining,
    done,
    available: clickerAvailable()
  });

  const broadcastState = (): void => ctx.broadcast('autoclick:state', getState());
  const broadcastStore = (): void => ctx.broadcast('autoclick:store', getStore());

  const stop = (notify: boolean): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!runningId) return;
    const name = getStore().profiles.find((p) => p.id === runningId)?.name ?? '';
    runningId = null;
    if (notify) ctx.notify(ctx.i18n.t('autoclick.notif.stopped', { name, n: done }));
    ctx.events.emit('tray-refresh');
    broadcastState();
  };

  const tick = (profile: AutoclickProfile, interval: number): void => {
    performClick(profile.button, profile.clickType === 'double');
    done += 1;
    if (remaining > 0) {
      remaining -= 1;
      if (remaining === 0) {
        timer = null;
        const name = profile.name;
        runningId = null;
        ctx.notify(ctx.i18n.t('autoclick.notif.done', { name, n: done }));
        ctx.events.emit('tray-refresh');
        broadcastState();
        return;
      }
    }
    broadcastState();
    timer = setTimeout(() => tick(profile, interval), interval);
  };

  const startProfile = async (id: string): Promise<void> => {
    const store = getStore();
    const profile = store.profiles.find((p) => p.id === id);
    if (!profile) return;
    const ok = await ensureClicker();
    if (!ok) {
      ctx.notify(
        clickerError() === 'platform'
          ? ctx.i18n.t('autoclick.notif.windowsOnly')
          : ctx.i18n.t('autoclick.notif.unavailable')
      );
      broadcastState();
      return;
    }
    if (timer) clearTimeout(timer); // stoppe un éventuel profil en cours
    // Mémorise ce profil comme sélection courante (raccourci / Stream Deck).
    if (store.selectedId !== id) {
      store.selectedId = id;
      saveStore(store);
      broadcastStore();
    }
    remaining = profile.repeat === 'infinite' ? -1 : Math.max(1, Math.floor(profile.repeatCount));
    done = 0;
    runningId = id;
    ctx.notify(ctx.i18n.t('autoclick.notif.started', { name: profile.name }));
    ctx.events.emit('tray-refresh');
    broadcastState();
    timer = setTimeout(() => tick(profile, intervalMs(profile)), Math.max(0, Math.floor(profile.startDelayMs)));
  };

  const toggleProfile = (id: string): void => {
    if (runningId === id) stop(true);
    else void startProfile(id);
  };

  /** Raccourci global / tray : bascule le profil sélectionné. */
  const toggleSelected = (): void => {
    if (runningId) {
      stop(true);
      return;
    }
    const store = getStore();
    const id = store.selectedId ?? store.profiles[0]?.id;
    if (id) void startProfile(id);
  };

  const applyShortcut = (shortcut: string): void => {
    if (shortcut === lastShortcut) return;
    lastShortcut = shortcut;
    ctx.shortcuts.setAccelerator(SHORTCUT_ID, shortcut);
    ctx.shortcuts.applyAll();
  };

  return {
    id: 'autoclicker',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;

      const store = getStore();
      lastShortcut = store.shortcut;
      ctx.shortcuts.register({
        id: SHORTCUT_ID,
        accelerator: store.shortcut,
        run: () => toggleSelected()
      });

      // Commandes du service localhost (Stream Deck, docs/00 §8).
      ctx.registerLocalCommand('autoclick.toggle', () => toggleSelected());
      ctx.registerLocalCommand('autoclick.start', () => toggleSelected());
      ctx.registerLocalCommand('autoclick.stop', () => stop(true));

      // Routes enrichies : le plugin et son panneau de configuration lisent la
      // liste des profils EN DIRECT (nouveau profil → apparaît tout seul) et
      // basculent un profil précis par son id.
      ctx.registerLocalRoute('GET', /^\/autoclick\/profiles$/, async () => {
        await ensureClicker();
        const s = getStore();
        return {
          profiles: s.profiles.map((p) => ({ id: p.id, name: p.name })),
          runningProfileId: runningId,
          selectedId: s.selectedId,
          available: clickerAvailable()
        };
      });
      // Touche « profil » du Stream Deck : SÉLECTIONNE le profil (ne lance pas).
      ctx.registerLocalRoute('POST', /^\/autoclick\/select$/, (url) => {
        const id = url.searchParams.get('id');
        if (!id) return { ok: false, error: 'id manquant' };
        const s = getStore();
        if (s.profiles.some((p) => p.id === id)) {
          s.selectedId = id;
          saveStore(s);
          broadcastStore();
        }
        return { ok: true, selectedId: getStore().selectedId, runningProfileId: runningId };
      });
      // Touche « marche/arrêt » : démarre / stoppe le profil sélectionné.
      ctx.registerLocalRoute('POST', /^\/autoclick\/toggle$/, async (url) => {
        const id = url.searchParams.get('id');
        if (id) toggleProfile(id);
        else toggleSelected();
        await new Promise((r) => setTimeout(r, 0));
        return { ok: true, runningProfileId: runningId };
      });

      // ── IPC ─────────────────────────────────────────────────────────
      ipcMain.handle('autoclick:getStore', () => getStore());
      ipcMain.handle('autoclick:getState', async (): Promise<AutoclickState> => {
        await ensureClicker();
        return getState();
      });
      ipcMain.handle('autoclick:createProfile', () => {
        const s = getStore();
        const n = s.profiles.length + 1;
        const profile = makeProfile(`Profil ${n}`);
        s.profiles.push(profile);
        s.selectedId = profile.id;
        saveStore(s);
        broadcastStore();
        return { store: getStore(), createdId: profile.id };
      });
      ipcMain.handle(
        'autoclick:updateProfile',
        (_e, id: string, patch: Partial<AutoclickProfile>) => {
          const s = getStore();
          const p = s.profiles.find((x) => x.id === id);
          if (p) {
            Object.assign(p, patch, { id: p.id }); // l'id ne change jamais
            saveStore(s);
            broadcastStore();
          }
          return getStore();
        }
      );
      ipcMain.handle('autoclick:duplicateProfile', (_e, id: string) => {
        const s = getStore();
        const src = s.profiles.find((x) => x.id === id);
        if (!src) return { store: getStore(), createdId: null };
        const copy = makeProfile(`${src.name} (copie)`, src);
        const idx = s.profiles.findIndex((x) => x.id === id);
        s.profiles.splice(idx + 1, 0, copy);
        s.selectedId = copy.id;
        saveStore(s);
        broadcastStore();
        return { store: getStore(), createdId: copy.id };
      });
      ipcMain.handle('autoclick:deleteProfile', (_e, id: string) => {
        if (runningId === id) stop(false);
        const s = getStore();
        s.profiles = s.profiles.filter((x) => x.id !== id);
        if (s.profiles.length === 0) s.profiles.push(makeProfile('Profil 1'));
        if (!s.profiles.some((p) => p.id === s.selectedId)) {
          s.selectedId = s.profiles[0].id;
        }
        saveStore(s);
        broadcastStore();
        return getStore();
      });
      ipcMain.handle('autoclick:setSelected', (_e, id: string) => {
        const s = getStore();
        if (s.profiles.some((p) => p.id === id)) {
          s.selectedId = id;
          saveStore(s);
          broadcastStore();
        }
        return getStore();
      });
      ipcMain.handle('autoclick:setShortcut', (_e, shortcut: string) => {
        const s = getStore();
        s.shortcut = shortcut;
        saveStore(s);
        applyShortcut(shortcut);
        broadcastStore();
        return getStore();
      });
      ipcMain.handle('autoclick:start', (_e, id: string) => startProfile(id));
      ipcMain.handle('autoclick:stop', () => stop(true));
      ipcMain.handle('autoclick:toggle', (_e, id: string) => toggleProfile(id));
    },

    trayMenuItems(hostCtx: MainHostContext): MenuItemConstructorOptions[] {
      const { t } = hostCtx.i18n;
      const store = getStore();
      const selected = store.profiles.find((p) => p.id === store.selectedId);
      const runningName = store.profiles.find((p) => p.id === runningId)?.name ?? '';
      return [
        {
          label: runningId
            ? t('autoclick.tray.stop', { name: runningName })
            : t('autoclick.tray.start', { name: selected?.name ?? '' }),
          click: () => toggleSelected()
        }
      ];
    },

    deactivate(): void {
      stop(false);
    }
  };
}
