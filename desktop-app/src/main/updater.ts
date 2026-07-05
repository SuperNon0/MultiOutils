import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../common/types';
import type { MainHostContext } from './module-registry';
import { setQuitting } from './windows';

/**
 * Mises à jour À LA DEMANDE (docs/00 §5.3) : l'utilisateur clique « Vérifier
 * les mises à jour », l'app interroge les GitHub Releases du dépôt public
 * (electron-updater), propose « Télécharger » puis « Redémarrer et
 * installer ». Jamais de mise à jour forcée.
 */
export function setupUpdater(ctx: MainHostContext): void {
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let status: UpdateStatus = { state: 'idle' };
  const set = (next: UpdateStatus): void => {
    status = next;
    ctx.broadcast('update:status', next);
  };

  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    set({
      state: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  );
  autoUpdater.on('update-not-available', () =>
    set({ state: 'none', version: app.getVersion() })
  );
  autoUpdater.on('download-progress', (progress) =>
    set({ state: 'downloading', percent: Math.round(progress.percent) })
  );
  autoUpdater.on('update-downloaded', (info) =>
    set({ state: 'downloaded', version: info.version })
  );
  autoUpdater.on('error', (error) =>
    set({ state: 'error', message: error.message })
  );

  ipcMain.handle('update:check', async (): Promise<UpdateStatus> => {
    if (!app.isPackaged) {
      // Lancé depuis les sources : pas d'installeur à mettre à jour.
      set({ state: 'dev' });
      return status;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // l'événement 'error' a déjà mis à jour le statut
    }
    return status;
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      // statut déjà passé en erreur via l'événement
    }
  });

  ipcMain.handle('update:install', () => {
    setQuitting(true);
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('update:status', (): UpdateStatus => status);
}
