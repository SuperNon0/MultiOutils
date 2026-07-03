import { clipboard, dialog, ipcMain, nativeImage, screen, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CaptureType } from '@multioutils/shared';
import type {
  AppSettings,
  CaptureTakeOptions,
  LibraryAction,
  LibraryView,
  QuickbarAction,
  RegionRect,
  ShortcutId,
  SortKey
} from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { CaptureRepo, originalPathFor, thumbPathFor } from '../../storage/captures';
import { getMainWindow } from '../../windows';
import { CaptureEngine } from './capture';
import { QuickBarController } from './quickbar';
import { RegionFlow } from './region';
import { physicalSize } from './utils';
import { WindowPickerFlow } from './window-picker';

const SHORTCUT_IDS: ShortcutId[] = ['fullscreen', 'region', 'window', 'delayed'];

/**
 * Module « Capture d'écran » côté process main. Tout ce qui touche à la
 * capture vit ici : l'hôte n'en connaît que le contrat MainToolModule
 * (docs/00 §0.1, docs/01 §2).
 */
export function createScreenshotMainModule(): MainToolModule {
  let engine: CaptureEngine;
  let region: RegionFlow;
  let picker: WindowPickerFlow;
  let quickbar: QuickBarController;
  let repo: CaptureRepo;

  return {
    id: 'screenshot',

    activate(ctx: MainHostContext): void {
      repo = new CaptureRepo(ctx.db);
      quickbar = new QuickBarController();
      engine = new CaptureEngine(ctx, repo);
      region = new RegionFlow((image) => {
        try {
          engine.saveImage(image);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.notify(ctx.i18n.t('notif.captureError', { msg }));
        }
      });
      picker = new WindowPickerFlow((image, appName) => {
        try {
          engine.saveImage(image, { appName });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.notify(ctx.i18n.t('notif.captureError', { msg }));
        }
      });
      engine.setFlows({
        startRegion: () => region.start(),
        startWindowPicker: () => picker.start()
      });
      engine.onCaptureSaved = (capture) => quickbar.show(capture);

      // Raccourcis globaux du module (docs/00 §1.2)
      const settings = ctx.settings.get();
      const runs: Record<ShortcutId, () => void> = {
        fullscreen: () => void engine.take('fullscreen'),
        region: () => void engine.take('region'),
        window: () => void engine.take('window'),
        delayed: () => void engine.take('delayed')
      };
      for (const id of SHORTCUT_IDS) {
        ctx.shortcuts.register({
          id,
          accelerator: settings.shortcuts[id],
          run: runs[id]
        });
      }

      // Réglages modifiés → resynchronise les accélérateurs
      ctx.events.on('settings-changed', (next: AppSettings) => {
        for (const id of SHORTCUT_IDS) {
          ctx.shortcuts.setAccelerator(id, next.shortcuts[id]);
        }
        ctx.shortcuts.applyAll();
      });

      // ── IPC du module ────────────────────────────────────────────────
      ipcMain.handle(
        'capture:take',
        (_event, type: CaptureType, opts?: CaptureTakeOptions) =>
          engine.take(type, opts)
      );

      ipcMain.handle('region:shot', (_event, displayId: string) =>
        region.shot(displayId)
      );
      ipcMain.on('region:select', (_event, displayId: string, rect: RegionRect) =>
        region.select(displayId, rect)
      );
      ipcMain.on('region:cancel', () => region.cancel());

      ipcMain.handle('picker:list', () => picker.list());
      ipcMain.on('picker:pick', (_event, sourceId: string) => picker.pick(sourceId));
      ipcMain.on('picker:cancel', () => picker.cancel());

      ipcMain.on('quickbar:hover', (_event, hovering: boolean) =>
        quickbar.hover(hovering)
      );
      ipcMain.handle(
        'quickbar:action',
        async (_event, captureId: string, action: QuickbarAction) => {
          switch (action) {
            case 'edit':
              quickbar.closeNow();
              ctx.showMainWindow({
                view: 'tool',
                toolId: 'screenshot',
                captureId,
                action: 'edit'
              });
              break;
            case 'copy':
              engine.copyToClipboard(captureId);
              quickbar.closeNow();
              break;
            case 'saveAs':
              quickbar.closeNow();
              await engine.saveCopyAs(captureId);
              break;
            case 'delete':
              repo.trash(captureId);
              ctx.broadcast('library:changed');
              ctx.notify(ctx.i18n.t('notif.deleted'));
              quickbar.closeNow();
              break;
            case 'send':
              // Envoi au serveur : Phase 5 (bouton désactivé côté renderer)
              break;
          }
        }
      );

      // ── Bibliothèque (docs/01 §5 : library:list / library:update) ───
      ipcMain.handle('library:list', (_event, view: LibraryView, sort: SortKey) =>
        repo.list(view ?? 'library', sort ?? 'date')
      );
      ipcMain.handle('library:update', async (_event, update: LibraryAction) => {
        switch (update.action) {
          case 'rename':
            repo.rename(update.id, update.name);
            break;
          case 'trash':
            repo.trash(update.id);
            break;
          case 'restore':
            repo.restore(update.id);
            break;
          case 'destroy':
            repo.destroy(update.id);
            break;
          case 'emptyTrash':
            repo.emptyTrash();
            break;
          case 'copy':
            engine.copyToClipboard(update.id);
            break;
          case 'saveAs':
            await engine.saveCopyAs(update.id);
            break;
          case 'reveal': {
            const capture = repo.get(update.id);
            if (capture) shell.showItemInFolder(capture.path);
            break;
          }
        }
        ctx.broadcast('library:changed');
      });

      // Résolution des fichiers pour le protocole mo-media:// de l'hôte
      ipcMain.handle('library:resolvePath', (_event, id: string) => {
        const capture = repo.get(id);
        return capture?.path ?? null;
      });

      // ── Éditeur (docs/00 §2.3) ───────────────────────────────────────
      // Enregistre le calque d'annotations et, si fourni, écrase le fichier
      // image aplati (+ vignette + métadonnées).
      ipcMain.handle(
        'editor:save',
        (
          _event,
          payload: { id: string; annotations: string | null; dataUrl?: string }
        ) => {
          const capture = repo.get(payload.id);
          if (!capture) return false;
          repo.setAnnotations(payload.id, payload.annotations);
          if (payload.dataUrl) {
            // Préserve l'image ORIGINALE avant le premier écrasement : la
            // ré-édition repart toujours des pixels d'origine (docs/06).
            const original = originalPathFor(capture);
            if (!fs.existsSync(original) && fs.existsSync(capture.path)) {
              fs.mkdirSync(path.dirname(original), { recursive: true });
              fs.copyFileSync(capture.path, original);
            }
            const image = nativeImage.createFromDataURL(payload.dataUrl);
            if (!image.isEmpty()) {
              const ext = path.extname(capture.path).toLowerCase();
              const buffer =
                ext === '.jpg' || ext === '.jpeg'
                  ? image.toJPEG(ctx.settings.get().jpgQuality)
                  : image.toPNG();
              fs.writeFileSync(capture.path, buffer);
              const { width, height } = image.getSize();
              repo.updateImageMeta(payload.id, {
                width,
                height,
                sizeBytes: buffer.byteLength
              });
              try {
                const thumb = thumbPathFor(capture);
                fs.mkdirSync(path.dirname(thumb), { recursive: true });
                const resized =
                  width > 480 ? image.resize({ width: 480 }) : image;
                fs.writeFileSync(thumb, resized.toPNG());
              } catch {
                // vignette = cache, ne bloque pas l'enregistrement
              }
            }
          }
          ctx.broadcast('library:changed');
          return true;
        }
      );

      // « Enregistrer sous… » / « Exporter » depuis l'éditeur.
      ipcMain.handle(
        'editor:export',
        async (
          _event,
          payload: { id: string; dataUrl: string; ext: 'png' | 'jpg' | 'webp' }
        ) => {
          const capture = repo.get(payload.id);
          const base = capture
            ? path.basename(capture.filename, path.extname(capture.filename))
            : 'capture';
          const parent = getMainWindow();
          const options = {
            defaultPath: `${base}.${payload.ext}`,
            filters: [
              { name: payload.ext.toUpperCase(), extensions: [payload.ext] }
            ]
          };
          const result = parent
            ? await dialog.showSaveDialog(parent, options)
            : await dialog.showSaveDialog(options);
          if (result.canceled || !result.filePath) return false;
          const base64 = payload.dataUrl.split(',')[1] ?? '';
          fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
          return true;
        }
      );

      // Copie de l'image aplatie dans le presse-papier.
      ipcMain.handle('editor:copy', (_event, dataUrl: string) => {
        const image = nativeImage.createFromDataURL(dataUrl);
        if (!image.isEmpty()) {
          clipboard.writeImage(image);
          ctx.notify(ctx.i18n.t('notif.copied'));
        }
      });
    },

    trayMenuItems(ctx: MainHostContext) {
      const { t } = ctx.i18n;
      const settings = ctx.settings.get();
      const displays = screen.getAllDisplays();

      const items: Electron.MenuItemConstructorOptions[] = [
        {
          label: t('tray.capture.fullscreen'),
          accelerator: settings.shortcuts.fullscreen,
          registerAccelerator: false,
          click: () => void engine.take('fullscreen')
        },
        {
          label: t('tray.capture.region'),
          accelerator: settings.shortcuts.region,
          registerAccelerator: false,
          click: () => void engine.take('region')
        },
        {
          label: t('tray.capture.window'),
          accelerator: settings.shortcuts.window,
          registerAccelerator: false,
          click: () => void engine.take('window')
        },
        {
          label: t('tray.capture.delayed', { s: settings.delayedSeconds }),
          accelerator: settings.shortcuts.delayed,
          registerAccelerator: false,
          click: () => void engine.take('delayed')
        }
      ];

      if (displays.length > 1) {
        items.push({
          label: t('tray.capture.screenMenu'),
          submenu: displays.map((display, i) => {
            const size = physicalSize(display);
            return {
              label: t('tray.capture.screenItem', {
                n: i + 1,
                w: size.width,
                h: size.height
              }),
              click: () => void engine.take('screen', { displayId: display.id })
            };
          })
        });
      }

      items.push(
        { type: 'separator' },
        {
          label: t('tray.openLibrary'),
          click: () => ctx.showMainWindow({ view: 'tool', toolId: 'screenshot' })
        },
        {
          label: t('tray.lastToClipboard'),
          click: () => engine.lastToClipboard()
        }
      );
      return items;
    }
  };
}
