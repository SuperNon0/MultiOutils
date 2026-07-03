import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import type { NavigateMsg } from '../common/types';

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let closeToTray = true;

export function setQuitting(value: boolean): void {
  quitting = value;
}

export function setCloseToTray(value: boolean): void {
  closeToTray = value;
}

/** Charge une « route » du renderer (dev server en dev, fichier en prod). */
export function loadRenderer(win: BrowserWindow, hash = ''): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(hash ? `${devUrl}#/${hash}` : devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: hash ? `/${hash}` : undefined
    });
  }
}

const PRELOAD = join(__dirname, '../preload/index.js');

export function preloadPath(): string {
  return PRELOAD;
}

export function createMainWindow(show = true): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0f11',
    title: 'MultiOutils',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (show) mainWindow?.show();
  });

  // Fermer la fenêtre la réduit dans le tray, ne quitte pas (docs/00 §0.4).
  mainWindow.on('close', (event) => {
    if (!quitting && closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  loadRenderer(mainWindow);
  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function showMainWindow(nav?: NavigateMsg): void {
  const win = createMainWindow(true);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (nav) {
    const send = (): void => win.webContents.send('host:navigate', nav);
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
}

/** Bascule ouvrir/masquer (clic gauche sur l'icône du tray, docs/00 §5.1). */
export function toggleMainWindow(): void {
  const win = getMainWindow();
  if (win && win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    showMainWindow();
  }
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
