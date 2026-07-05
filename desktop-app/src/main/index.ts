import { app, net, Notification, protocol } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { I18n } from './i18n';
import { applySettings, registerHostIpc } from './ipc';
import { LocalService } from './local-service';
import type { MainHostContext } from './module-registry';
import { MainModuleRegistry } from './module-registry';
import { createColorPickerMainModule } from './modules/color-picker';
import { createOcrMainModule } from './modules/ocr';
import { createScreenshotMainModule } from './modules/screenshot';
import { SettingsStore } from './settings';
import { CaptureRepo, originalPathFor, thumbPathFor } from './storage/captures';
import { openDb } from './storage/db';
import { ShortcutManager } from './shortcuts';
import { TrayController } from './tray';
import { setupUpdater } from './updater';
import {
  broadcast,
  createMainWindow,
  setCloseToTray,
  setQuitting,
  showMainWindow
} from './windows';

// Protocole interne servant les images à la galerie sans désactiver la
// sécurité web : mo-media://capture/<id> et mo-media://thumb/<id>.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mo-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);

// Une seule instance : relancer l'app remet la fenêtre au premier plan.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  app.on('second-instance', () => showMainWindow());
  app.on('before-quit', () => setQuitting(true));

  await app.whenReady();
  app.setAppUserModelId('com.supernon0.multioutils'); // notifications Windows

  const db = openDb(path.join(app.getPath('userData'), 'multioutils.db'));
  const defaultStorageDir = path.join(app.getPath('pictures'), 'MultiOutils');
  const settings = new SettingsStore(db, defaultStorageDir);
  const i18n = new I18n(settings.get().language);
  const events = new EventEmitter();
  const shortcuts = new ShortcutManager();
  const registry = new MainModuleRegistry();

  setCloseToTray(settings.get().closeToTray);

  const localService = new LocalService();

  const ctx: MainHostContext = {
    db,
    settings,
    i18n,
    shortcuts,
    events,
    notify(title, body) {
      new Notification({ title, body, silent: true }).show();
    },
    showMainWindow,
    broadcast,
    registerLocalCommand: (id, run) => localService.register(id, run)
  };

  // Résolution des images (l'accès fichier reste confiné au process main).
  const repo = new CaptureRepo(db);
  protocol.handle('mo-media', (request) => {
    const url = new URL(request.url);
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const capture = repo.get(id);
    if (!capture) return new Response('not found', { status: 404 });
    let file = capture.path;
    if (url.host === 'thumb') {
      const thumb = thumbPathFor(capture);
      if (fs.existsSync(thumb)) file = thumb;
    } else if (url.host === 'original') {
      // image d'origine pour la ré-édition (le fichier principal est aplati)
      const original = originalPathFor(capture);
      if (fs.existsSync(original)) file = original;
    }
    if (!fs.existsSync(file)) return new Response('gone', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Modules : la capture est le premier outil, l'hôte n'en code aucun en dur.
  registry.register(createScreenshotMainModule());
  registry.register(createColorPickerMainModule());
  registry.register(createOcrMainModule());
  await registry.activateAll(ctx);

  registerHostIpc(ctx);
  setupUpdater(ctx);
  localService.start();

  const statuses = shortcuts.applyAll();
  const conflicts = statuses.filter((s) => !s.ok);
  if (conflicts.length > 0) {
    ctx.notify(
      i18n.t('settings.shortcuts.conflict'),
      conflicts.map((c) => c.accelerator).join(' · ')
    );
  }

  const tray = new TrayController();
  tray.create(ctx, registry);

  // Synchronise l'enregistrement au démarrage avec le réglage courant.
  if (app.isPackaged) {
    const current = settings.get();
    app.setLoginItemSettings({
      openAtLogin: current.autostart,
      args: current.startMinimized ? ['--hidden'] : []
    });
  }

  app.on('will-quit', () => {
    shortcuts.dispose();
    registry.deactivateAll();
    localService.stop();
    tray.destroy();
  });

  // premier lancement : fenêtre visible pour l'assistant (docs/02 §2.3)
  const startHidden =
    process.argv.includes('--hidden') && settings.get().firstRunDone;
  createMainWindow(!startHidden);

  // Expose applySettings aux tests manuels de dev (garde une référence).
  void applySettings;
}
