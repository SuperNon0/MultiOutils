import { BrowserWindow, screen } from 'electron';
import type { Display, NativeImage } from 'electron';
import type { RegionRect, RegionShot } from '../../../common/types';
import { loadRenderer, preloadPath } from '../../windows';
import { captureDisplay, clamp, hideAppWindows } from './utils';

interface Shot {
  image: NativeImage;
  display: Display;
}

/**
 * Capture de zone (docs/00 §1.1) : gèle chaque écran, affiche un overlay
 * plein écran par moniteur (assombrissement + croix + dimensions + loupe côté
 * renderer), puis rogne l'image gelée à la sélection. Échap annule.
 */
export class RegionFlow {
  private overlays: BrowserWindow[] = [];
  private shots = new Map<string, Shot>();
  private restoreWindows: (() => void) | null = null;

  constructor(private onSelect: (image: NativeImage) => void) {}

  isActive(): boolean {
    return this.overlays.length > 0;
  }

  async start(): Promise<void> {
    if (this.isActive()) return;
    this.restoreWindows = await hideAppWindows();

    // On fige TOUS les écrans avant d'ouvrir le moindre overlay, pour que
    // l'overlay lui-même n'apparaisse jamais dans la capture.
    for (const display of screen.getAllDisplays()) {
      this.shots.set(String(display.id), {
        image: await captureDisplay(display),
        display
      });
    }

    const cursor = screen.getCursorScreenPoint();
    const cursorDisplayId = screen.getDisplayNearestPoint(cursor).id;

    for (const { display } of this.shots.values()) {
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
      loadRenderer(win, `region/${display.id}`);
      win.once('ready-to-show', () => {
        win.show();
        if (display.id === cursorDisplayId) win.focus();
      });
      this.overlays.push(win);
    }
  }

  /** Image gelée d'un écran, demandée par l'overlay au chargement. */
  shot(displayId: string): RegionShot | null {
    const entry = this.shots.get(displayId);
    if (!entry) return null;
    const { width, height } = entry.image.getSize();
    return {
      dataUrl: entry.image.toDataURL(),
      width,
      height,
      scale: width / entry.display.bounds.width
    };
  }

  /** Sélection terminée : rogne dans l'image gelée (coordonnées physiques). */
  select(displayId: string, rect: RegionRect): void {
    const entry = this.shots.get(displayId);
    if (!entry) return;
    const { width: imgW, height: imgH } = entry.image.getSize();
    const scale = imgW / entry.display.bounds.width;
    const x = clamp(Math.round(rect.x * scale), 0, imgW - 1);
    const y = clamp(Math.round(rect.y * scale), 0, imgH - 1);
    const w = clamp(Math.round(rect.width * scale), 1, imgW - x);
    const h = clamp(Math.round(rect.height * scale), 1, imgH - y);
    const cropped = entry.image.crop({ x, y, width: w, height: h });
    this.finish();
    this.onSelect(cropped);
  }

  cancel(): void {
    this.finish();
  }

  private finish(): void {
    for (const win of this.overlays) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.overlays = [];
    this.shots.clear();
    this.restoreWindows?.();
    this.restoreWindows = null;
  }
}
