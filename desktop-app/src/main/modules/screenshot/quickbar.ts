import { BrowserWindow, screen } from 'electron';
import type { Capture } from '@multioutils/shared';
import { loadRenderer, preloadPath } from '../../windows';
import { clamp } from './utils';

const BAR_WIDTH = 480;
const BAR_HEIGHT = 60;
const AUTO_HIDE_MS = 6000;

/**
 * Barre d'actions rapides post-capture (docs/00 §1.1) : petite fenêtre près
 * du curseur, disparaît après ~6 s (le survol met le compte à rebours en
 * pause).
 */
export class QuickBarController {
  private win: BrowserWindow | null = null;
  private timer: NodeJS.Timeout | null = null;

  show(capture: Capture): void {
    this.closeNow();
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const x = clamp(cursor.x + 14, area.x, area.x + area.width - BAR_WIDTH);
    const y = clamp(cursor.y + 18, area.y, area.y + area.height - BAR_HEIGHT);

    this.win = new BrowserWindow({
      x,
      y,
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
      frame: false,
      transparent: true,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.on('closed', () => {
      this.win = null;
    });
    loadRenderer(this.win, `quickbar/${capture.id}`);
    // showInactive : la barre ne vole pas le focus de l'app de l'utilisateur.
    this.win.once('ready-to-show', () => this.win?.showInactive());
    this.arm(AUTO_HIDE_MS);
  }

  /** Survol → pause du minuteur ; sortie → refermeture rapide. */
  hover(hovering: boolean): void {
    if (hovering) {
      this.clearTimer();
    } else if (this.win) {
      this.arm(2000);
    }
  }

  closeNow(): void {
    this.clearTimer();
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  private arm(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.closeNow(), ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
