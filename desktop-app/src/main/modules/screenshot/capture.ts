import { clipboard, dialog, nativeImage, Notification, screen } from 'electron';
import type { NativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildCaptureName, type Capture, type CaptureType } from '@multioutils/shared';
import type { CaptureTakeOptions } from '../../../common/types';
import type { MainHostContext } from '../../module-registry';
import { CaptureRepo, thumbPathFor } from '../../storage/captures';
import { getMainWindow } from '../../windows';
import { captureDisplay, delay, hideAppWindows } from './utils';

export interface CaptureFlows {
  startRegion(): Promise<void>;
  startWindowPicker(): Promise<void>;
}

/**
 * Moteur de capture du module screenshot : produit les images, applique le
 * flux post-capture commun (docs/00 §1.1) — écriture disque D'ABORD, puis
 * presse-papier, barre d'actions rapides et notification.
 */
export class CaptureEngine {
  private delayTimer: NodeJS.Timeout | null = null;
  private flows: CaptureFlows | null = null;
  onCaptureSaved: ((capture: Capture) => void) | null = null;

  constructor(
    private ctx: MainHostContext,
    private repo: CaptureRepo
  ) {}

  setFlows(flows: CaptureFlows): void {
    this.flows = flows;
  }

  /** Point d'entrée unique (IPC `capture:take`, raccourcis, tray). */
  async take(type: CaptureType, opts: CaptureTakeOptions = {}): Promise<void> {
    try {
      switch (type) {
        case 'fullscreen':
          await this.takeFullscreen();
          break;
        case 'region':
          await this.flows?.startRegion();
          break;
        case 'window':
          await this.flows?.startWindowPicker();
          break;
        case 'screen':
          await this.takeScreen(opts.displayId);
          break;
        case 'delayed':
          this.takeDelayed();
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ctx.notify(this.ctx.i18n.t('notif.captureError', { msg }));
    }
  }

  /** Plein écran : écran du curseur, ou tous les écrans selon le réglage. */
  async takeFullscreen(): Promise<void> {
    const settings = this.ctx.settings.get();
    const restore = await hideAppWindows();
    try {
      const image = settings.captureAllScreens
        ? await this.captureAllDisplays()
        : await captureDisplay(
            screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
          );
      restore();
      this.saveImage(image);
    } catch (err) {
      restore();
      throw err;
    }
  }

  async takeScreen(displayId?: number): Promise<void> {
    const display =
      screen.getAllDisplays().find((d) => d.id === displayId) ??
      screen.getPrimaryDisplay();
    const restore = await hideAppWindows();
    try {
      const image = await captureDisplay(display);
      restore();
      this.saveImage(image);
    } catch (err) {
      restore();
      throw err;
    }
  }

  /** Capture différée : compte à rebours affiché dans le tray (docs/00 §1.1). */
  takeDelayed(): void {
    if (this.delayTimer) return; // un seul compte à rebours à la fois
    const { t } = this.ctx.i18n;
    let remaining = Math.max(1, this.ctx.settings.get().delayedSeconds);
    this.ctx.notify(t('notif.delayed', { s: remaining }));
    this.ctx.events.emit('tray-tooltip', t('notif.delayed', { s: remaining }));
    this.delayTimer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        this.ctx.events.emit('tray-tooltip', t('notif.delayed', { s: remaining }));
        return;
      }
      if (this.delayTimer) clearInterval(this.delayTimer);
      this.delayTimer = null;
      this.ctx.events.emit('tray-tooltip', null);
      void this.takeFullscreen();
    }, 1000);
  }

  /** Compose tous les écrans en une seule image (positions réelles, DPI géré). */
  private async captureAllDisplays(): Promise<NativeImage> {
    const displays = screen.getAllDisplays();
    if (displays.length === 1) return captureDisplay(displays[0]);

    const scale = Math.max(...displays.map((d) => d.scaleFactor));
    const minX = Math.min(...displays.map((d) => d.bounds.x));
    const minY = Math.min(...displays.map((d) => d.bounds.y));
    const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
    const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
    const canvasW = Math.round((maxX - minX) * scale);
    const canvasH = Math.round((maxY - minY) * scale);
    const canvas = Buffer.alloc(canvasW * canvasH * 4);

    for (const display of displays) {
      let image = await captureDisplay(display);
      const targetW = Math.round(display.bounds.width * scale);
      const targetH = Math.round(display.bounds.height * scale);
      const size = image.getSize();
      if (size.width !== targetW || size.height !== targetH) {
        image = image.resize({ width: targetW, height: targetH });
      }
      const bitmap = image.toBitmap();
      const offX = Math.round((display.bounds.x - minX) * scale);
      const offY = Math.round((display.bounds.y - minY) * scale);
      const { width: w, height: h } = image.getSize();
      for (let y = 0; y < h; y++) {
        const src = y * w * 4;
        const dst = ((offY + y) * canvasW + offX) * 4;
        bitmap.copy(canvas, dst, src, src + w * 4);
      }
    }
    return nativeImage.createFromBitmap(canvas, { width: canvasW, height: canvasH });
  }

  /**
   * Flux post-capture commun : nom auto, écriture disque AVANT tout le reste
   * (zéro perte, docs/00 §0.6), vignette, base, presse-papier, notification.
   */
  saveImage(image: NativeImage, opts: { appName?: string } = {}): Capture {
    if (image.isEmpty()) throw new Error('empty capture');
    const settings = this.ctx.settings.get();
    const now = new Date();

    fs.mkdirSync(settings.storageDir, { recursive: true });
    const counter = settings.filenameTemplate.includes('{counter}')
      ? this.ctx.settings.nextCounter()
      : undefined;
    const base = buildCaptureName(settings.filenameTemplate, {
      date: now,
      counter,
      appName: opts.appName
    });
    const ext = settings.defaultFormat;
    let filePath = path.join(settings.storageDir, `${base}.${ext}`);
    for (let i = 2; fs.existsSync(filePath); i++) {
      filePath = path.join(settings.storageDir, `${base}_${i}.${ext}`);
    }

    const buffer =
      ext === 'jpg' ? image.toJPEG(settings.jpgQuality) : image.toPNG();
    fs.writeFileSync(filePath, buffer);

    const { width, height } = image.getSize();
    const capture: Capture = {
      id: randomUUID(),
      filename: path.basename(filePath),
      path: filePath,
      createdAt: now.toISOString(),
      width,
      height,
      sizeBytes: buffer.byteLength,
      folderId: null,
      favorite: false,
      annotations: null,
      remoteState: 'none',
      remoteId: null,
      deletedAt: null
    };

    // Vignette (galerie fluide, docs/00 §10)
    try {
      const thumb = thumbPathFor(capture);
      fs.mkdirSync(path.dirname(thumb), { recursive: true });
      const resized = width > 480 ? image.resize({ width: 480 }) : image;
      fs.writeFileSync(thumb, resized.toPNG());
    } catch {
      // la vignette est un cache : son échec ne doit pas perdre la capture
    }

    this.repo.insert(capture);

    if (settings.clipboardAuto) clipboard.writeImage(image);

    const { t } = this.ctx.i18n;
    const notification = new Notification({
      title: t('notif.captureSaved.title'),
      body: t('notif.captureSaved.body', { name: capture.filename }),
      silent: true
    });
    notification.on('click', () =>
      this.ctx.showMainWindow({ view: 'tool', toolId: 'screenshot', captureId: capture.id })
    );
    notification.show();

    this.ctx.broadcast('capture:done', capture);
    this.onCaptureSaved?.(capture);

    if (settings.openEditorAfterCapture) {
      this.ctx.showMainWindow({ view: 'tool', toolId: 'screenshot', captureId: capture.id });
    }
    return capture;
  }

  /** « Dernière capture → presse-papier » (tray, Stream Deck plus tard). */
  lastToClipboard(): void {
    const capture = this.repo.latest();
    if (!capture) {
      this.ctx.notify(this.ctx.i18n.t('notif.noCapture'));
      return;
    }
    this.copyToClipboard(capture.id);
  }

  copyToClipboard(id: string): void {
    const capture = this.repo.get(id);
    if (!capture) return;
    const image = nativeImage.createFromPath(capture.path);
    if (!image.isEmpty()) {
      clipboard.writeImage(image);
      this.ctx.notify(this.ctx.i18n.t('notif.copied'));
    }
  }

  async saveCopyAs(id: string): Promise<void> {
    const capture = this.repo.get(id);
    if (!capture) return;
    const parent = getMainWindow();
    const options = {
      defaultPath: capture.filename,
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: '*', extensions: ['*'] }
      ]
    };
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (!result.canceled && result.filePath) {
      await fs.promises.copyFile(capture.path, result.filePath);
    }
  }

  /** Petite pause utilitaire exposée pour les flux (tests manuels). */
  protected pause(ms: number): Promise<void> {
    return delay(ms);
  }
}
