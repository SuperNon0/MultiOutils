import { app, dialog, ipcMain, screen } from 'electron';
import fs from 'node:fs';
import type { AppSettings, DisplayInfo, ShortcutStatus } from '../common/types';
import type { MainHostContext } from './module-registry';
import { getMainWindow, setCloseToTray } from './windows';

/**
 * Applique un patch de réglages + tous ses effets de bord (démarrage auto,
 * langue, tray, raccourcis). Diffuse `settings:changed` aux fenêtres et
 * l'événement `settings-changed` aux modules.
 */
export function applySettings(
  ctx: MainHostContext,
  patch: Partial<AppSettings>
): AppSettings {
  const before = ctx.settings.get();
  const next = ctx.settings.set(patch);

  if (patch.autostart != null || patch.startMinimized != null) {
    // En dev, l'enregistrement pointerait vers electron.exe : on ne
    // l'applique que packagé (docs/00 §5.2).
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: next.autostart,
        args: next.startMinimized ? ['--hidden'] : []
      });
    }
  }
  if (patch.language && patch.language !== before.language) {
    ctx.i18n.setLanguage(next.language);
    ctx.events.emit('tray-refresh');
  }
  if (patch.storageDir) {
    fs.mkdirSync(next.storageDir, { recursive: true });
  }
  if (patch.closeToTray != null) {
    setCloseToTray(next.closeToTray);
  }
  if (patch.delayedSeconds != null || patch.shortcuts) {
    ctx.events.emit('tray-refresh'); // libellés / accélérateurs affichés
  }

  ctx.events.emit('settings-changed', next);
  ctx.broadcast('settings:changed', next);
  return next;
}

/** Canaux IPC de l'hôte (docs/01 §5). Les canaux des outils vivent dans leurs modules. */
export function registerHostIpc(ctx: MainHostContext): void {
  ipcMain.handle('settings:get', () => ctx.settings.get());
  ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>) =>
    applySettings(ctx, patch)
  );

  ipcMain.handle('settings:chooseFolder', async () => {
    const options = {
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >,
      defaultPath: ctx.settings.get().storageDir
    };
    const win = getMainWindow();
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(
    'shortcuts:set',
    (_event, id: string, accelerator: string): ShortcutStatus | null => {
      const shortcuts = {
        ...ctx.settings.get().shortcuts,
        [id]: accelerator
      } as AppSettings['shortcuts'];
      applySettings(ctx, { shortcuts });
      // Le module concerné a resynchronisé ses accélérateurs sur
      // settings-changed ; on rapporte l'état réel (conflit détectable).
      return ctx.shortcuts.status().find((s) => s.id === id) ?? null;
    }
  );
  ipcMain.handle('shortcuts:status', () => ctx.shortcuts.status());

  ipcMain.handle('system:displays', (): DisplayInfo[] => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, index) => ({
      id: d.id,
      index,
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
      primary: d.id === primaryId
    }));
  });

  ipcMain.handle('app:version', () => app.getVersion());
}
