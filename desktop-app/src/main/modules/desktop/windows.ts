/**
 * Fenêtres du module Bureau :
 * - une fenêtre par zone, transparente et sans cadre, rattachée au bureau
 *   (win32.pinToDesktop) pour rester sous les autres fenêtres ;
 * - un calque plein écran par écran pour dessiner une nouvelle zone.
 */
import { BrowserWindow, screen, type Display } from 'electron';
import type { Rect, Zone, ZoneWindowMsg } from '../../../common/desktop';
import { loadRenderer, preloadPath } from '../../windows';
import { desktopAbove, hwndOf, pinToDesktop, sendToBottom, unpinFromDesktop } from './win32';

/** Écran d'une zone (celui enregistré, sinon le principal). */
export function displayFor(displayId: string): Display {
  return screen.getAllDisplays().find((d) => String(d.id) === displayId) ?? screen.getPrimaryDisplay();
}

/** Rectangle absolu (écran virtuel, px CSS) d'une zone. */
export function absoluteBounds(zone: Zone, collapsedHeight?: number): Rect {
  const wa = displayFor(zone.bounds.displayId).workArea;
  const width = Math.min(zone.bounds.width, wa.width);
  const height = Math.min(collapsedHeight ?? zone.bounds.height, wa.height);
  const x = Math.min(Math.max(wa.x + zone.bounds.x, wa.x), wa.x + wa.width - width);
  const y = Math.min(Math.max(wa.y + zone.bounds.y, wa.y), wa.y + wa.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export class ZoneWindow {
  readonly win: BrowserWindow;
  private ready = false;
  /** Aperçu en cours : la fenêtre reste au-dessus des autres. */
  private raised = false;
  /** Bureau affiché (Win+D) : la zone passe devant le bureau, pas devant les fenêtres. */
  private onTopOfDesktop = false;
  private last: ZoneWindowMsg | null = null;

  constructor(
    readonly zoneId: string,
    bounds: Rect,
    private readonly native: () => boolean
  ) {
    this.win = new BrowserWindow({
      ...bounds,
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
      hasShadow: false,
      title: 'MultiOutils — Bureau',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });
    const win = this.win;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.once('ready-to-show', () => {
      win.showInactive();
      this.pin();
    });
    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.last) win.webContents.send('desktop:zone', this.last);
    });
    // Un clic active la zone : on la renvoie aussitôt sous les autres fenêtres.
    win.on('focus', () => this.toBottom());
    win.on('show', () => {
      if (!this.raised) this.pin();
    });
    loadRenderer(win, `zone/${zoneId}`);
  }

  private hwnd(): bigint | null {
    try {
      return hwndOf(this.win.getNativeWindowHandle());
    } catch {
      return null;
    }
  }

  private pin(): void {
    if (!this.native() || this.win.isDestroyed()) return;
    const h = this.hwnd();
    if (h) pinToDesktop(h);
  }

  toBottom(): void {
    if (this.raised || this.onTopOfDesktop || !this.native() || this.win.isDestroyed()) return;
    const h = this.hwnd();
    if (h) sendToBottom(h);
  }

  /** Aperçu : passe au-dessus de toutes les fenêtres. */
  raise(): void {
    if (this.win.isDestroyed()) return;
    this.raised = true;
    const h = this.native() ? this.hwnd() : null;
    if (h) unpinFromDesktop(h);
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    if (!this.win.isVisible()) this.win.showInactive();
    this.win.moveTop();
  }

  /** Fin de l'aperçu : retour sur le bureau. */
  lower(): void {
    if (this.win.isDestroyed()) return;
    this.raised = false;
    this.onTopOfDesktop = false;
    this.win.setAlwaysOnTop(false);
    this.pin();
  }

  /**
   * Win+D (« afficher le bureau ») passe le bureau devant toutes les fenêtres :
   * la zone se met alors au premier plan, puis revient sur le bureau dès qu'une
   * autre fenêtre reprend la main.
   */
  overDesktop(on: boolean): void {
    if (this.raised || this.win.isDestroyed() || on === this.onTopOfDesktop) return;
    this.onTopOfDesktop = on;
    if (on) {
      this.win.setAlwaysOnTop(true, 'normal');
      this.win.moveTop();
    } else {
      this.win.setAlwaysOnTop(false);
      this.toBottom();
    }
  }

  /** Le bureau recouvre-t-il la zone (Win+D) ? */
  coveredByDesktop(): boolean {
    if (this.raised || this.onTopOfDesktop || !this.native() || this.win.isDestroyed() || !this.win.isVisible()) return false;
    const h = this.hwnd();
    return !!h && desktopAbove(h);
  }

  /** Masquage du bureau (double-clic, masquage automatique). */
  setHidden(hidden: boolean): void {
    if (this.win.isDestroyed()) return;
    if (hidden && this.win.isVisible()) this.win.hide();
    else if (!hidden && !this.win.isVisible()) this.win.showInactive();
  }

  /** Événement ponctuel pour la page de la zone (fondu, indice de fusion…). */
  emit(channel: string, payload: unknown): void {
    if (this.ready && !this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  bounds(): Rect {
    return this.win.getBounds();
  }

  send(msg: ZoneWindowMsg): void {
    this.last = msg;
    if (this.ready && !this.win.isDestroyed()) this.win.webContents.send('desktop:zone', msg);
  }

  current(): ZoneWindowMsg | null {
    return this.last;
  }

  setBounds(r: Rect): void {
    if (this.win.isDestroyed()) return;
    const b = this.win.getBounds();
    if (b.x === r.x && b.y === r.y && b.width === r.width && b.height === r.height) return;
    this.win.setBounds(r);
  }

  isSender(id: number): boolean {
    return !this.win.isDestroyed() && this.win.webContents.id === id;
  }

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}

/** Calques de dessin : un par écran, fermés ensemble. */
export class DrawOverlays {
  private wins: BrowserWindow[] = [];

  open(): void {
    this.close();
    for (const d of screen.getAllDisplays()) {
      const win = new BrowserWindow({
        ...d.bounds,
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
        hasShadow: false,
        alwaysOnTop: true,
        enableLargerThanScreen: true,
        webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setBounds(d.bounds);
      loadRenderer(win, `zone-draw/${d.id}`);
      win.once('ready-to-show', () => {
        win.show();
        const cursor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        if (cursor.id === d.id) win.focus();
      });
      this.wins.push(win);
    }
  }

  isOpen(): boolean {
    return this.wins.some((w) => !w.isDestroyed());
  }

  close(): void {
    for (const w of this.wins) if (!w.isDestroyed()) w.destroy();
    this.wins = [];
  }
}

/** Voile de l'aperçu : un par écran, sous les zones relevées. */
export class PeekOverlays {
  private wins: BrowserWindow[] = [];

  open(focus: boolean): void {
    this.close();
    const cursor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    for (const d of screen.getAllDisplays()) {
      const win = new BrowserWindow({
        ...d.bounds,
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
        hasShadow: false,
        alwaysOnTop: true,
        enableLargerThanScreen: true,
        webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
      });
      win.setAlwaysOnTop(true, 'floating');
      win.setBounds(d.bounds);
      loadRenderer(win, 'zone-peek');
      win.once('ready-to-show', () => {
        if (focus && cursor.id === d.id) win.show();
        else win.showInactive();
      });
      this.wins.push(win);
    }
  }

  isOpen(): boolean {
    return this.wins.some((w) => !w.isDestroyed());
  }

  close(): void {
    for (const w of this.wins) if (!w.isDestroyed()) w.destroy();
    this.wins = [];
  }
}

/** Pastille de page (points + nom), affichée un instant au changement de page. */
export class PageIndicator {
  private win: BrowserWindow | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(info: { index: number; count: number; name: string }): void {
    this.close();
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = 280;
    const height = 64;
    const win = new BrowserWindow({
      x: Math.round(d.workArea.x + (d.workArea.width - width) / 2),
      y: Math.round(d.workArea.y + d.workArea.height - height - 40),
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false }
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    loadRenderer(win, `zone-pages/${encodeURIComponent(JSON.stringify(info))}`);
    win.once('ready-to-show', () => win.showInactive());
    this.win = win;
    this.timer = setTimeout(() => this.close(), 1600);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
