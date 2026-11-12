/**
 * Fenêtres des pop-ups Home Assistant : transparentes, toujours au-dessus,
 * sans prendre le focus (on ne vole pas le clavier pendant qu'on tape).
 * Une fenêtre par emplacement utilisé (coins, haut, bas, centre de l'écran
 * principal) : chaque notification peut choisir le sien. Chaque fenêtre
 * prend la hauteur de sa pile et la largeur de sa plus grande carte.
 */
import { BrowserWindow, screen } from 'electron';
import type { HaNotification, HaToastMsg, HaToastPosition, HaToastSize } from '../../../../common/launcher';
import { loadRenderer, preloadPath } from '../../../windows';

/** Largeur d'une carte + marge transparente pour l'ombre (px CSS, voir ha.css). */
export const TOAST_WIDTHS: Record<HaToastSize, number> = { small: 340, normal: 420, large: 600 };

/** Largeur de la fenêtre : celle de la plus grande carte. */
export function stackWidth(toasts: HaNotification[]): number {
  return toasts.reduce((w, t) => Math.max(w, TOAST_WIDTHS[t.size ?? 'normal']), TOAST_WIDTHS.small);
}

/** Place d'une pile dans la zone de travail de l'écran. */
export function stackBounds(
  pos: HaToastPosition,
  wa: { x: number; y: number; width: number; height: number },
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const w = Math.min(width, wa.width);
  const h = Math.min(height, wa.height);
  const x = pos.endsWith('right')
    ? wa.x + wa.width - w
    : pos.endsWith('left')
      ? wa.x
      : wa.x + (wa.width - w) / 2;
  const y = pos.startsWith('bottom') ? wa.y + wa.height - h : pos === 'center' ? wa.y + (wa.height - h) / 2 : wa.y;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

class StackWindow {
  private win: BrowserWindow | null = null;
  private ready = false;
  private height = 10;
  private toasts: HaNotification[] = [];

  constructor(
    readonly position: HaToastPosition,
    private readonly volume: () => number
  ) {}

  private create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.ready = false;
    const win = new BrowserWindow({
      width: stackWidth(this.toasts),
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
    this.win.setBounds(stackBounds(this.position, wa, stackWidth(this.toasts), this.height));
  }

  private flush(): void {
    if (!this.win || this.win.isDestroyed() || !this.ready) return;
    this.win.webContents.send('ha:toasts', this.current());
    if (this.toasts.length === 0) {
      this.win.hide();
    } else {
      this.place();
      if (!this.win.isVisible()) this.win.showInactive();
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
    return { toasts: this.toasts, position: this.position, volume: this.volume() };
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

export class ToastWindow {
  private stacks = new Map<HaToastPosition, StackWindow>();

  constructor(
    private readonly position: () => HaToastPosition,
    private readonly volume: () => number = () => 70
  ) {}

  /** Répartit les notifications par emplacement (le leur, sinon celui des réglages). */
  set(toasts: HaNotification[]): void {
    const fallback = this.position();
    const groups = new Map<HaToastPosition, HaNotification[]>();
    for (const t of toasts) {
      const p = t.position ?? fallback;
      groups.set(p, [...(groups.get(p) ?? []), t]);
    }
    for (const [p, list] of groups) {
      let st = this.stacks.get(p);
      if (!st) {
        st = new StackWindow(p, this.volume);
        this.stacks.set(p, st);
      }
      st.set(list);
    }
    for (const [p, st] of this.stacks) if (!groups.has(p)) st.set([]);
  }

  private find(id: number): StackWindow | undefined {
    for (const st of this.stacks.values()) if (st.isSender(id)) return st;
    return undefined;
  }

  resize(senderId: number, height: number): void {
    this.find(senderId)?.resize(height);
  }

  isSender(id: number): boolean {
    return !!this.find(id);
  }

  current(senderId: number): HaToastMsg | null {
    return this.find(senderId)?.current() ?? null;
  }

  destroy(): void {
    for (const st of this.stacks.values()) st.destroy();
    this.stacks.clear();
  }
}
