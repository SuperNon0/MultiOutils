import { ipcMain } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { AutoclickConfig, AutoclickState } from '../../../common/types';
import { DEFAULT_AUTOCLICK } from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import {
  clickerAvailable,
  clickerError,
  ensureClicker,
  performClick
} from './clicker';

const CONFIG_KEY = 'autoclick.config';
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
 * curseur, à intervalle réglable, un nombre de fois défini ou en continu.
 * Pilotable depuis l'app, un raccourci global et le Stream Deck (bascule).
 * Le clic système réel est délégué à ./clicker (FFI Windows, dégradation si
 * indisponible).
 */
export function createAutoclickerMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
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

  const getConfig = (): AutoclickConfig => {
    const raw = kvGet(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_AUTOCLICK };
    try {
      return { ...DEFAULT_AUTOCLICK, ...(JSON.parse(raw) as Partial<AutoclickConfig>) };
    } catch {
      return { ...DEFAULT_AUTOCLICK };
    }
  };

  const getState = (): AutoclickState => ({
    running,
    remaining: remaining < 0 ? null : remaining,
    done,
    available: clickerAvailable()
  });

  const broadcastState = (): void => ctx.broadcast('autoclick:state', getState());

  const setConfig = (patch: Partial<AutoclickConfig>): AutoclickConfig => {
    const next = { ...getConfig(), ...patch };
    kvSet(CONFIG_KEY, JSON.stringify(next));
    // Raccourci modifié → ré-enregistre les raccourcis globaux.
    if (next.shortcut !== lastShortcut) {
      lastShortcut = next.shortcut;
      ctx.shortcuts.setAccelerator(SHORTCUT_ID, next.shortcut);
      ctx.shortcuts.applyAll();
    }
    return next;
  };

  const stop = (notify: boolean): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!running) return;
    running = false;
    if (notify) ctx.notify(ctx.i18n.t('autoclick.notif.stopped', { n: done }));
    ctx.events.emit('tray-refresh');
    broadcastState();
  };

  const tick = (cfg: AutoclickConfig, interval: number): void => {
    performClick(cfg.button, cfg.clickType === 'double');
    done += 1;
    if (remaining > 0) {
      remaining -= 1;
      if (remaining === 0) {
        running = false;
        timer = null;
        ctx.notify(ctx.i18n.t('autoclick.notif.done', { n: done }));
        ctx.events.emit('tray-refresh');
        broadcastState();
        return;
      }
    }
    broadcastState();
    timer = setTimeout(() => tick(cfg, interval), interval);
  };

  const start = async (): Promise<void> => {
    if (running) return;
    const ok = await ensureClicker();
    if (!ok) {
      const reason =
        clickerError() === 'platform'
          ? ctx.i18n.t('autoclick.notif.windowsOnly')
          : ctx.i18n.t('autoclick.notif.unavailable');
      ctx.notify(reason);
      broadcastState();
      return;
    }
    const cfg = getConfig();
    const interval = intervalMs(cfg);
    remaining = cfg.repeat === 'infinite' ? -1 : Math.max(1, Math.floor(cfg.repeatCount));
    done = 0;
    running = true;
    ctx.notify(ctx.i18n.t('autoclick.notif.started'));
    ctx.events.emit('tray-refresh');
    broadcastState();
    const first = Math.max(0, Math.floor(cfg.startDelayMs));
    timer = setTimeout(() => tick(cfg, interval), first);
  };

  const toggle = (): void => {
    if (running) stop(true);
    else void start();
  };

  return {
    id: 'autoclicker',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;

      lastShortcut = getConfig().shortcut;
      // Raccourci global de bascule (ré-appliqué par l'hôte après activation).
      ctx.shortcuts.register({
        id: SHORTCUT_ID,
        accelerator: lastShortcut,
        run: () => toggle()
      });

      // Commandes du service localhost (Stream Deck, docs/00 §8).
      ctx.registerLocalCommand('autoclick.toggle', () => toggle());
      ctx.registerLocalCommand('autoclick.start', () => start());
      ctx.registerLocalCommand('autoclick.stop', () => stop(true));

      ipcMain.handle('autoclick:getConfig', () => getConfig());
      ipcMain.handle('autoclick:setConfig', (_e, patch: Partial<AutoclickConfig>) =>
        setConfig(patch)
      );
      ipcMain.handle('autoclick:getState', async (): Promise<AutoclickState> => {
        // Première interrogation (montage du panneau) : vérifie la dispo du
        // clic natif pour pouvoir prévenir l'utilisateur sans démarrer.
        await ensureClicker();
        return getState();
      });
      ipcMain.handle('autoclick:start', () => start());
      ipcMain.handle('autoclick:stop', () => stop(true));
      ipcMain.handle('autoclick:toggle', () => toggle());
    },

    trayMenuItems(hostCtx: MainHostContext): MenuItemConstructorOptions[] {
      const { t } = hostCtx.i18n;
      return [
        {
          label: running ? t('autoclick.tray.stop') : t('autoclick.tray.start'),
          click: () => toggle()
        }
      ];
    },

    deactivate(): void {
      stop(false);
    }
  };
}
