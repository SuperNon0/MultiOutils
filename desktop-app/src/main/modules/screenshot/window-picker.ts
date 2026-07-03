import { BrowserWindow, desktopCapturer, screen } from 'electron';
import type { NativeImage } from 'electron';
import type { PickerItem } from '../../../common/types';
import { loadRenderer, preloadPath } from '../../windows';
import { hideAppWindows, physicalSize } from './utils';

interface Candidate {
  id: string;
  name: string;
  image: NativeImage;
  icon: NativeImage | null;
}

/**
 * Capture de fenêtre. Electron n'expose pas la position des fenêtres des
 * autres applications : on affiche donc un sélecteur (vignettes des fenêtres
 * ouvertes, clic = capture) au lieu du surlignage au survol décrit dans la
 * spec — déviation documentée dans docs/06-decisions-techniques.md.
 */
export class WindowPickerFlow {
  private win: BrowserWindow | null = null;
  private candidates: Candidate[] = [];
  private restoreWindows: (() => void) | null = null;

  constructor(private onPick: (image: NativeImage, appName?: string) => void) {}

  async start(): Promise<void> {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }
    this.restoreWindows = await hideAppWindows();

    // Une seule passe à pleine résolution : les images servent la vignette
    // (réduite) ET la capture finale, sans re-capture périmée au clic.
    const box = physicalSize(screen.getPrimaryDisplay());
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: box,
      fetchWindowIcons: true
    });
    const ownTitles = new Set(
      BrowserWindow.getAllWindows().map((w) => w.getTitle())
    );
    this.candidates = sources
      .filter(
        (s) =>
          s.name.trim() !== '' &&
          !ownTitles.has(s.name) &&
          !s.thumbnail.isEmpty()
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        image: s.thumbnail,
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon : null
      }));

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = Math.min(920, display.workArea.width - 80);
    const height = Math.min(660, display.workArea.height - 80);
    this.win = new BrowserWindow({
      x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
      y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
      width,
      height,
      frame: false,
      show: false,
      skipTaskbar: true,
      resizable: false,
      alwaysOnTop: true,
      backgroundColor: '#0e0f11',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.win.on('closed', () => {
      this.win = null;
    });
    loadRenderer(this.win, 'picker');
    this.win.once('ready-to-show', () => {
      this.win?.show();
      this.win?.focus();
    });
  }

  list(): PickerItem[] {
    return this.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      thumbDataUrl: (c.image.getSize().width > 420
        ? c.image.resize({ width: 420 })
        : c.image
      ).toDataURL(),
      iconDataUrl: c.icon?.toDataURL() ?? null
    }));
  }

  pick(sourceId: string): void {
    const candidate = this.candidates.find((c) => c.id === sourceId);
    this.close();
    if (candidate) {
      this.onPick(candidate.image, candidate.name);
    }
  }

  cancel(): void {
    this.close();
  }

  private close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    this.candidates = [];
    this.restoreWindows?.();
    this.restoreWindows = null;
  }
}
