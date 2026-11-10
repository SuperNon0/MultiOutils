/**
 * Fenêtre des pop-ups Home Assistant : transparente, toujours au-dessus, sans
 * prendre le focus (on ne vole pas le clavier pendant qu'on tape), dans un coin
 * de l'écran principal. Elle prend la hauteur de sa pile de notifications.
 */
import { BrowserWindow, screen } from 'electron';
import type { HaNotification, HaToastMsg, HaToastPosition } from '../../../../common/launcher';
import { loadRenderer, preloadPath } from '../../../windows';

/** Largeur d'une carte + marge transparente pour l'ombre (px CSS). */
const WIDTH = 420;

export class ToastWindow {
  private win: BrowserWindow | null = null;
  private ready = false;
  private height = 10;
  private toasts: HaNotification[] = [];

  constructor(private readonly position: () => HaToastPosition) {}

  private create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.ready = false;
    const win = new BrowserWindow({
      width: WIDTH,
      height: this.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      title: 'MultiOutils — Home Assistant',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      this.flush();
    });
    win.webContents.on('render-process-gone', () => {
      this.win = null;
      if (!win.isDestroyed()) win.destroy();
    });
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    loadRenderer(win, 'ha-toasts');
    this.win = win;
    return win;
  }

  private place(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const pos = this.position();
    const h = Math.min(this.height, wa.height);
    const x = pos.endsWith('right') ? wa.x + wa.width - WIDTH : wa.x;
    const y = pos.startsWith('bottom') ? wa.y + wa.height - h : wa.y;
    this.win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: Math.round(h) });
  }

  private flush(): void {
    if (!this.win || this.win.isDestroyed() || !this.ready) return;
    const msg: HaToastMsg = { toasts: this.toasts, position: this.position() };
    this.win.webContents.send('ha:toasts', msg);
    if (this.toasts.length === 0) {
      this.win.hide();
    } else if (!this.win.isVisible()) {
      this.place();
      this.win.showInactive();
    }
  }

  set(toasts: HaNotification[]): void {
    this.toasts = toasts;
    if (toasts.length > 0) this.create();
    this.flush();
  }

  /** Hauteur de la pile mesurée par le rendu. */
  resize(height: number): void {
    const h = Math.max(10, Math.min(1400, Math.round(height)));
    if (h === this.height) return;
    this.height = h;
    this.place();
  }

  isSender(id: number): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.webContents.id === id;
  }

  current(): HaToastMsg {
    return { toasts: this.toasts, position: this.position() };
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
