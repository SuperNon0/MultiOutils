import { BrowserWindow, clipboard, ipcMain, screen } from 'electron';
import type { Display, NativeImage } from 'electron';
import type { RegionShot } from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { captureDisplay, hideAppWindows } from '../../screen-utils';
import { loadRenderer, preloadPath } from '../../windows';

export interface PickedColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  /** Chaîne copiée (déjà au format choisi par l'utilisateur). */
  formatted: string;
  pickedAt: string;
}

const FORMAT_KEY = 'colorpicker.format';
const HISTORY_KEY = 'colorpicker.history';
const HISTORY_MAX = 12;

/**
 * Module « Pipette de couleur » (docs/00 §9.2) : loupe plein écran sur image
 * gelée, clic = copie du code (HEX / RGB / HSL selon le réglage), historique
 * des dernières couleurs. Indépendant du module capture (docs/01 §2).
 */
export function createColorPickerMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let overlays: BrowserWindow[] = [];
  const shots = new Map<string, { image: NativeImage; display: Display }>();
  let restoreWindows: (() => void) | null = null;

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

  const getFormat = (): 'hex' | 'rgb' | 'hsl' => {
    const value = kvGet(FORMAT_KEY);
    return value === 'rgb' || value === 'hsl' ? value : 'hex';
  };

  const getHistory = (): PickedColor[] => {
    try {
      const parsed = JSON.parse(kvGet(HISTORY_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as PickedColor[]) : [];
    } catch {
      return [];
    }
  };

  const finish = (): void => {
    for (const win of overlays) {
      if (!win.isDestroyed()) win.destroy();
    }
    overlays = [];
    shots.clear();
    restoreWindows?.();
    restoreWindows = null;
  };

  const start = async (): Promise<void> => {
    if (overlays.length > 0) return;
    restoreWindows = await hideAppWindows();
    for (const display of screen.getAllDisplays()) {
      shots.set(String(display.id), {
        image: await captureDisplay(display),
        display
      });
    }
    const cursorDisplayId = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint()
    ).id;
    for (const { display } of shots.values()) {
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        show: false,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        fullscreenable: false,
        hasShadow: false,
        alwaysOnTop: true,
        enableLargerThanScreen: true,
        backgroundColor: '#000000',
        webPreferences: {
          preload: preloadPath(),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setBounds(display.bounds);
      loadRenderer(win, `eyedropper/${display.id}`);
      win.once('ready-to-show', () => {
        win.show();
        if (display.id === cursorDisplayId) win.focus();
      });
      overlays.push(win);
    }
  };

  return {
    id: 'color-picker',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;

      ipcMain.handle('colorpicker:start', () => start());
      ipcMain.on('colorpicker:cancel', () => finish());

      ipcMain.handle('colorpicker:shot', (_event, displayId: string): RegionShot | null => {
        const entry = shots.get(displayId);
        if (!entry) return null;
        const { width, height } = entry.image.getSize();
        return {
          dataUrl: entry.image.toDataURL(),
          width,
          height,
          scale: width / entry.display.bounds.width
        };
      });

      ipcMain.on(
        'colorpicker:pick',
        (_event, payload: Omit<PickedColor, 'pickedAt'>) => {
          finish();
          clipboard.writeText(payload.formatted);
          const entry: PickedColor = { ...payload, pickedAt: new Date().toISOString() };
          const history = [
            entry,
            ...getHistory().filter((c) => c.hex !== entry.hex)
          ].slice(0, HISTORY_MAX);
          kvSet(HISTORY_KEY, JSON.stringify(history));
          ctx.notify(ctx.i18n.t('colorpicker.copied', { code: payload.formatted }));
          ctx.broadcast('colorpicker:historyChanged');
        }
      );

      ipcMain.handle('colorpicker:history', () => getHistory());
      ipcMain.handle('colorpicker:clearHistory', () => {
        kvSet(HISTORY_KEY, '[]');
        ctx.broadcast('colorpicker:historyChanged');
      });
      ipcMain.handle('colorpicker:getFormat', () => getFormat());
      ipcMain.handle('colorpicker:setFormat', (_event, format: string) => {
        kvSet(FORMAT_KEY, format === 'rgb' || format === 'hsl' ? format : 'hex');
      });

      ctx.registerLocalCommand('colorpicker.start', () => start());
    },

    trayMenuItems(hostCtx: MainHostContext) {
      return [
        {
          label: hostCtx.i18n.t('colorpicker.tray'),
          click: () => void start()
        }
      ];
    },

    deactivate(): void {
      finish();
    }
  };
}
