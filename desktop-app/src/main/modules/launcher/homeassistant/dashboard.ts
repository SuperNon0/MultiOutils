/**
 * Mini fenêtre « tableau de bord Home Assistant » (raccourci global) : une
 * petite barre « encre » (rendu #/ha-dashboard) et, dessous, la vraie page de
 * HA dans une vue web séparée, avec sa propre session persistante
 * (persist:homeassistant). La fenêtre apparaît près de la zone de
 * notification, comme un menu du tray, et se cache quand on clique ailleurs
 * (réglable).
 *
 * Connexion automatique : si HA affiche sa page de connexion, on lui donne le
 * jeton d'accès déjà enregistré (comme le font les tablettes murales) ; sinon
 * on se connecte une fois à la main et la session est gardée.
 */
import { BrowserWindow, screen, session, shell, WebContentsView } from 'electron';
import { loadRenderer, preloadPath } from '../../../windows';

/** Hauteur de la barre du haut (px CSS, voir ha.css). */
const BAR_H = 40;
const PARTITION = 'persist:homeassistant';

export interface DashboardDeps {
  base(): string | null;
  token(): string | null;
  path(): string;
  size(): { width: number; height: number };
  hideOnBlur(): boolean;
}

export class DashboardWindow {
  private win: BrowserWindow | null = null;
  private view: WebContentsView | null = null;
  private loadedBase: string | null = null;
  private injectedAt = 0;
  private pinned = false;
  private hiddenAt = 0;
  private storageReset: Promise<void> = Promise.resolve();

  constructor(private readonly deps: DashboardDeps) {}

  private create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const { width, height } = this.deps.size();
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#111111',
      title: 'Home Assistant',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    loadRenderer(win, 'ha-dashboard');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    win.contentView.addChildView(view);
    const wc = view.webContents;
    // liens externes : navigateur ; navigation hors de HA : navigateur aussi
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      const base = this.deps.base();
      if (!base) return;
      try {
        if (new URL(url).origin !== new URL(base).origin) {
          e.preventDefault();
          if (/^https?:/i.test(url)) void shell.openExternal(url);
        }
      } catch {
        e.preventDefault();
      }
    });
    wc.on('did-navigate', (_e, url) => this.maybeLogin(url));
    wc.on('page-title-updated', (_e, title) => this.send('ha:dash:title', title));
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (isMain && code !== -3) this.send('ha:dash:error', `${desc} (${url})`);
    });
    wc.on('did-finish-load', () => this.send('ha:dash:error', null));

    const layout = (): void => {
      const [w, h] = win.getContentSize();
      view.setBounds({ x: 0, y: BAR_H, width: w, height: Math.max(0, h - BAR_H) });
    };
    win.on('resize', layout);
    layout();

    win.on('blur', () => {
      if (this.deps.hideOnBlur() && !this.pinned && !win.webContents.isDevToolsOpened() && !wc.isDevToolsOpened()) {
        this.hide();
      }
    });
    win.on('close', (e) => {
      // la croix cache seulement : la session et la page restent prêtes
      e.preventDefault();
      this.hide();
    });
    win.on('closed', () => {
      if (this.win === win) {
        this.win = null;
        this.view = null;
      }
    });
    this.win = win;
    this.view = view;
    return win;
  }

  /** Page de connexion de HA : on y dépose le jeton, puis on revient au tableau de bord. */
  private maybeLogin(url: string): void {
    const base = this.deps.base();
    const token = this.deps.token();
    if (!base || !token || !this.view) return;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    if (u.origin !== new URL(base).origin || !u.pathname.startsWith('/auth/authorize')) return;
    // une seule tentative par minute : si le jeton est refusé, on laisse la page de connexion
    if (Date.now() - this.injectedAt < 60_000) return;
    this.injectedAt = Date.now();
    const tokens = {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 315_360_000,
      hassUrl: base,
      clientId: `${base}/`,
      expires: Date.now() + 315_360_000_000,
      refresh_token: ''
    };
    const target = `${base}${this.deps.path() || '/'}`;
    void this.view.webContents
      .executeJavaScript(
        `localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))}); location.replace(${JSON.stringify(target)});`
      )
      .catch(() => undefined);
  }

  private send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  private load(path?: string): void {
    const base = this.deps.base();
    if (!base || !this.view) {
      this.send('ha:dash:error', 'not-configured');
      return;
    }
    const view = this.view;
    void this.storageReset.then(() => {
      if (this.view !== view || this.deps.base() !== base) return;
      this.loadedBase = base;
      return view.webContents.loadURL(`${base}${path ?? (this.deps.path() || '/')}`);
    }).catch(() => this.send('ha:dash:error', 'session-reset-failed'));
  }

  private place(): void {
    if (!this.win) return;
    const { width, height } = this.deps.size();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    const w = Math.min(width, wa.width - 24);
    const h = Math.min(height, wa.height - 24);
    // coin bas-droit (près du tray), comme un menu de la barre des tâches
    this.win.setBounds({ x: wa.x + wa.width - w - 12, y: wa.y + wa.height - h - 12, width: w, height: h });
  }

  isVisible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  /** Ouvre la fenêtre (et va à `path` si donné : lien d'une notification). */
  show(path?: string): void {
    const win = this.create();
    const base = this.deps.base();
    if (path || base !== this.loadedBase) this.load(path);
    if (!win.isVisible()) this.place();
    win.show();
    win.focus();
  }

  hide(): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.hiddenAt = Date.now();
    this.win.hide();
  }

  toggle(): void {
    if (this.isVisible()) this.hide();
    else if (Date.now() - this.hiddenAt > 200) this.show();
  }

  /* actions de la barre du haut */
  reload(): void {
    if (this.loadedBase !== this.deps.base()) this.load();
    else this.view?.webContents.reload();
  }
  back(): void {
    const nav = this.view?.webContents.navigationHistory;
    if (nav?.canGoBack()) nav.goBack();
  }
  home(): void {
    this.load();
  }
  openExternal(): void {
    const url = this.view?.webContents.getURL();
    if (url && /^https?:/i.test(url)) void shell.openExternal(url);
  }
  togglePin(): boolean {
    this.pinned = !this.pinned;
    return this.pinned;
  }
  isSender(id: number): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.webContents.id === id;
  }

  /** Réglages changés (adresse) : la page sera rechargée à la prochaine ouverture. */
  invalidate(): void {
    this.loadedBase = null;
  }

  resetSession(): void {
    const visible = this.isVisible();
    this.destroy();
    this.loadedBase = null;
    this.injectedAt = 0;
    this.storageReset = this.storageReset.catch(() => undefined).then(() =>
      session.fromPartition(PARTITION).clearStorageData({
        storages: ['localstorage', 'cookies', 'indexdb', 'serviceworkers', 'cachestorage']
      })
    );
    void this.storageReset.catch(() => undefined);
    if (visible) this.show();
  }

  destroy(): void {
    this.view?.webContents.close();
    if (this.win && !this.win.isDestroyed()) {
      this.win.removeAllListeners('close');
      this.win.destroy();
    }
    this.win = null;
    this.view = null;
  }
}
