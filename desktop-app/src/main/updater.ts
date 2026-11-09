import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../common/types';
import type { MainHostContext } from './module-registry';
import { setQuitting } from './windows';

/** Installeur silencieux (/S) puis relance de l'app (--force-run). */
const SILENT = true;
const RUN_AFTER = true;
/** Laisse le temps à l'interface d'afficher « Redémarrage… ». */
const INSTALL_DELAY_MS = 1200;

/**
 * Mises à jour À LA DEMANDE (docs/00 §5.3) : l'utilisateur clique « Vérifier
 * les mises à jour », l'app interroge les GitHub Releases du dépôt public
 * (electron-updater) puis propose « Mettre à jour ». Un seul clic suffit
 * ensuite : téléchargement (différentiel quand c'est possible), installation
 * SILENCIEUSE (installeur NSIS lancé en /S, sans assistant ni étapes à
 * valider, dans le dossier déjà choisi) et relance automatique de l'app.
 * Jamais de mise à jour forcée.
 */
export function setupUpdater(ctx: MainHostContext): void {
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let status: UpdateStatus = { state: 'idle' };
  /** Vrai quand l'utilisateur a cliqué « Mettre à jour » : on installe dès la fin du téléchargement. */
  let installWhenReady = false;
  let installing = false;
  let downloadedVersion: string | undefined;
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
  const install = (): void => {
    if (installing) return;
    installing = true;
    set({ state: 'installing', version: downloadedVersion ?? '' });
    setTimeout(() => {
      setQuitting(true);
      autoUpdater.quitAndInstall(SILENT, RUN_AFTER);
    }, INSTALL_DELAY_MS);
  };

  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version;
    if (installWhenReady) install();
    else set({ state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (error) => {
    installWhenReady = false;
    installing = false;
    set({ state: 'error', message: error.message });
  });

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

  // « Mettre à jour » : télécharge puis installe et redémarre tout seul.
  ipcMain.handle('update:download', async () => {
    installWhenReady = true;
    if (downloadedVersion) {
      install();
      return;
    }
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      // statut déjà passé en erreur via l'événement
    }
  });

  ipcMain.handle('update:install', () => {
    if (downloadedVersion) install();
  });

  ipcMain.handle('update:status', (): UpdateStatus => status);
}
