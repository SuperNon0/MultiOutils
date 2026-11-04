/**
 * Fenêtre du lanceur : sans cadre, transparente, toujours au-dessus, PRÉ-CRÉÉE
 * et cachée pour s'afficher instantanément ; centrée sur l'écran de la souris,
 * cachée à la perte du focus.
 */
import { BrowserWindow, screen } from 'electron';
import type { LauncherLook } from '../../../common/launcher';
import { loadRenderer, preloadPath } from '../../windows';

/** Marge transparente autour de la palette, pour l'ombre (.lz-shell, px CSS). */
const SHELL_MARGIN_X = 40;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 1100;
/** Hauteur de la barre seule (champ + marges), pour la position « centre ». */
const BAR_HEIGHT = 120;

/** Largeur de la fenêtre pour une barre de `look.width` px. */
export function launcherWindowWidth(look: Pick<LauncherLook, 'width'>): number {
  return Math.round(look.width) + SHELL_MARGIN_X;
}

/** Haut de la fenêtre dans la zone de travail, selon la position choisie. */
export function launcherTop(position: LauncherLook['position'], areaY: number, areaHeight: number): number {
  if (position === 'top') return Math.round(areaY + areaHeight * 0.06);
  if (position === 'center') return Math.round(areaY + Math.max(0, areaHeight / 2 - BAR_HEIGHT));
  return Math.round(areaY + areaHeight * 0.18);
}

export class LauncherWindow {
  private win: BrowserWindow | null = null;
  private ready = false;
  private pendingShow = false;
  private height = 132;
  /** Masquage récent : évite qu'un raccourci tapé pendant le blur rouvre aussitôt. */
  private hiddenAt = 0;

  constructor(
    private readonly hideOnBlur: () => boolean,
    private readonly look: () => LauncherLook
  ) {}

  private width(): number {
    return launcherWindowWidth(this.look());
  }

  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.ready = false;
    const win = new BrowserWindow({
      width: this.width(),
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
    const width = Math.min(this.width(), wa.width);
    const x = Math.round(wa.x + (wa.width - width) / 2);
    const y = launcherTop(this.look().position, wa.y, wa.height);
    this.height = Math.min(this.height, wa.y + wa.height - y);
    this.win.setBounds({ x, y, width, height: this.height });
  }

  /** Apparence changée : replace la fenêtre tout de suite si elle est ouverte. */
  applyLook(): void {
    if (this.isVisible()) this.place();
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
    this.win.setBounds({ x: b.x, y: b.y, width: b.width, height: h });
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
