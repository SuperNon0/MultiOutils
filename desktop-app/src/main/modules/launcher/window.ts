/**
 * Fenêtre du lanceur : sans cadre, transparente, toujours au-dessus, PRÉ-CRÉÉE
 * et cachée pour s'afficher instantanément ; centrée sur l'écran de la souris,
 * cachée à la perte du focus.
 */
import { BrowserWindow, screen } from 'electron';
import { loadRenderer, preloadPath } from '../../windows';

/** Largeur de la palette + marge transparente pour l'ombre (px CSS). */
export const LAUNCHER_WIDTH = 760;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 720;

export class LauncherWindow {
  private win: BrowserWindow | null = null;
  private ready = false;
  private pendingShow = false;
  private height = 132;
  /** Masquage récent : évite qu'un raccourci tapé pendant le blur rouvre aussitôt. */
  private hiddenAt = 0;

  constructor(private readonly hideOnBlur: () => boolean) {}

  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.ready = false;
    const win = new BrowserWindow({
      width: LAUNCHER_WIDTH,
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
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      title: 'MultiOutils — Lanceur',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        // ouverture instantanée : pas de mise en veille du rendu caché
        backgroundThrottling: false
      }
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on('blur', () => {
      if (this.hideOnBlur() && !win.webContents.isDevToolsOpened()) this.hide();
    });
    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.pendingShow) {
        this.pendingShow = false;
        this.show();
      }
    });
    win.webContents.on('render-process-gone', () => {
      // le rendu a planté : on recréera la fenêtre à la prochaine ouverture
      this.win = null;
      if (!win.isDestroyed()) win.destroy();
    });
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    // les liens éventuels s'ouvrent ailleurs, jamais dans le lanceur
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    loadRenderer(win, 'launcher');
    this.win = win;
    return win;
  }

  isVisible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  private place(): void {
    if (!this.win) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    const x = Math.round(wa.x + (wa.width - LAUNCHER_WIDTH) / 2);
    const y = Math.round(wa.y + wa.height * 0.18);
    this.win.setBounds({ x, y, width: LAUNCHER_WIDTH, height: this.height });
  }

  show(): void {
    const win = this.create();
    if (!this.ready) {
      this.pendingShow = true;
      return;
    }
    this.place();
    win.show();
    win.focus();
    win.webContents.focus();
    win.webContents.send('launcher:shown');
  }

  hide(): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.hiddenAt = Date.now();
    this.win.hide();
    this.win.webContents.send('launcher:hidden');
  }

  toggle(): void {
    if (this.isVisible()) this.hide();
    else if (Date.now() - this.hiddenAt > 150) this.show();
  }

  /** Hauteur demandée par le rendu (la palette grandit avec ses résultats). */
  resize(height: number): void {
    const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
    if (h === this.height) return;
    this.height = h;
    if (!this.win || this.win.isDestroyed()) return;
    const b = this.win.getBounds();
    this.win.setBounds({ x: b.x, y: b.y, width: LAUNCHER_WIDTH, height: h });
  }

  send(channel: string, payload?: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  isSender(id: number): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.webContents.id === id;
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
