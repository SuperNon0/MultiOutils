/**
 * Home Assistant côté PC : relie la liaison (link.ts), les pop-ups
 * (toasts.ts), la mini fenêtre du tableau de bord (dashboard.ts) et les
 * commandes reçues de HA (boutons Veille, Verrouiller, Éteindre, Redémarrer). Appelé par le module
 * Lanceur, qui garde l'adresse et le jeton de HA.
 */
import { app, ipcMain, powerMonitor, shell } from 'electron';
import { execFile } from 'node:child_process';
import os from 'node:os';
import type { HaNotification, HaSettings, HaLinkStatus } from '../../../../common/launcher';
import type { MainHostContext } from '../../../module-registry';
import {
  haDeviceName,
  parseHaMessage,
  pushToast,
  resolveHaImage,
  resolveHaLink,
  type HaCommand,
  type HaRegistration
} from '../core/ha-link';
import { haBaseUrl } from '../core/homeassistant';
import { DashboardWindow } from './dashboard';
import { HaLink, type HaLinkCoreStatus } from './link';
import { PcSensors } from './sensors';
import { ToastWindow } from './toasts';

const REG_KEY = 'launcher.ha.registration';
const DEVICE_ID_KEY = 'launcher.ha.deviceId';
const HISTORY_KEY = 'launcher.ha.history';
const HISTORY_MAX = 50;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const HA_DASHBOARD_SHORTCUT_ID = 'homeassistant.dashboard';

export interface HaIntegrationDeps {
  ctx: MainHostContext;
  settings(): HaSettings;
  token(): string | null;
  kvGet<T>(key: string, fallback: T): T;
  kvSet(key: string, value: unknown): void;
  showLauncher(): void;
}

export interface HaIntegration {
  status(): HaLinkStatus;
  /** Réglages changés : redémarre ce qui doit l'être. */
  apply(before: HaSettings | null): Promise<void>;
  /** Jeton changé. */
  tokenChanged(): void;
  openDashboard(path?: string): void;
  toggleDashboard(): void;
  history(): HaNotification[];
  showTest(): void;
  dispose(): void;
}

let toastSeq = 0;

export function createHaIntegration(deps: HaIntegrationDeps): HaIntegration {
  const { ctx } = deps;
  const isWin = process.platform === 'win32';
  const s = (): HaSettings => deps.settings();
  const base = (): string | null => haBaseUrl(s().url);
  const log = (...args: unknown[]): void => {
    if (!app.isPackaged) console.warn(...args);
  };

  let toasts: HaNotification[] = [];
  let history = deps.kvGet<HaNotification[]>(HISTORY_KEY, []).filter((n) => n && typeof n.id === 'string').slice(0, HISTORY_MAX);
  let coreStatus: HaLinkCoreStatus | null = null;

  const deviceId = (): string => {
    let id = deps.kvGet<string>(DEVICE_ID_KEY, '');
    if (!id) {
      id = HaLink.newDeviceId();
      deps.kvSet(DEVICE_ID_KEY, id);
    }
    return id;
  };

  const sensors = new PcSensors();
  const toastWin = new ToastWindow(() => s().notifications.position);
  const dashboard = new DashboardWindow({
    base,
    token: deps.token,
    path: () => s().dashboard.path,
    size: () => ({ width: s().dashboard.width, height: s().dashboard.height }),
    hideOnBlur: () => s().dashboard.hideOnBlur
  });

  const status = (): HaLinkStatus => {
    const core = coreStatus ?? link.status();
    return {
      ...core,
      ...(s().link.enabled ? {} : { state: 'off' as const }),
      buttons: s().link.enabled ? link.buttonIds() : []
    };
  };
  const broadcastStatus = (): void => ctx.broadcast('ha:status', status());

  /* ───────── pop-ups ───────── */

  const setToasts = (next: HaNotification[]): void => {
    toasts = next;
    toastWin.set(toasts);
  };
  const dismiss = (id: string): void => setToasts(toasts.filter((t) => t.id !== id));

  const remember = (n: HaNotification): void => {
    // l'image (lourde) n'est pas gardée dans l'historique
    const { image: _img, ...light } = n;
    history = [light, ...history.filter((h) => h.id !== n.id)].slice(0, HISTORY_MAX);
    deps.kvSet(HISTORY_KEY, history);
  };

  const fetchImage = async (src: string): Promise<string | undefined> => {
    if (src.startsWith('data:image/')) return src.length < IMAGE_MAX_BYTES * 1.4 ? src : undefined;
    const b = base();
    if (!b) return undefined;
    const target = resolveHaImage(src, b);
    if (!target) return undefined;
    const token = deps.token();
    try {
      const res = await fetch(target.url, {
        headers: target.auth && token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(8000)
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return undefined;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > IMAGE_MAX_BYTES) return undefined;
      return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch {
      return undefined;
    }
  };

  const showNotification = async (n: HaNotification, imageSrc?: string): Promise<void> => {
    const cfg = s().notifications;
    remember(n);
    ctx.broadcast('ha:history', history);
    if (!cfg.enabled) return;
    if (cfg.doNotDisturb && !n.important) return;
    if (imageSrc) {
      const image = await fetchImage(imageSrc);
      if (image) n = { ...n, image };
    }
    setToasts(pushToast(toasts, n));
  };

  const run = (file: string, args: string[]): void => {
    execFile(file, args, { windowsHide: true }, (err) => {
      if (err) log('[ha] commande :', err.message);
    });
  };

  const runCommand = (command: HaCommand, extra: { url?: string }): void => {
    const cfg = s().link;
    if (command === 'dashboard') return void dashboard.show();
    if (command === 'launcher') return void deps.showLauncher();
    if (command === 'open_url' && extra.url) {
      const target = resolveHaLink(extra.url, base());
      if (target?.kind === 'dashboard') dashboard.show(target.path);
      else if (target?.kind === 'external') void shell.openExternal(target.url);
      return;
    }
    if (!cfg.commands || !isWin) return;
    if (command === 'lock') run('rundll32.exe', ['user32.dll,LockWorkStation']);
    else if (command === 'sleep') {
      // veille (et pas hibernation, contrairement à SetSuspendState de powrprof)
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"
      ]);
    } else if ((command === 'shutdown' || command === 'restart') && cfg.powerCommands) {
      // 30 s pour annuler, depuis la pop-up
      run('shutdown.exe', [command === 'shutdown' ? '/s' : '/r', '/t', '30', '/c', 'Home Assistant (MultiOutils)']);
      void showNotification({
        id: `ha-local-${++toastSeq}`,
        title: ctx.i18n.t(command === 'shutdown' ? 'ha.cmd.shutdown' : 'ha.cmd.restart'),
        message: ctx.i18n.t('ha.cmd.powerSub'),
        duration: 30,
        important: true,
        sound: true,
        icon: 'alert',
        color: 'corail',
        actions: [{ action: 'MULTIOUTILS_CANCEL_SHUTDOWN', title: ctx.i18n.t('common.cancel'), danger: true }],
        receivedAt: Date.now()
      });
    }
  };

  const onPush = (raw: unknown): void => {
    const cfg = s().notifications;
    const parsed = parseHaMessage(raw, { duration: cfg.duration, sound: cfg.sound }, `ha-${Date.now().toString(36)}-${++toastSeq}`);
    if (!parsed) return;
    if (parsed.kind === 'clear') {
      setToasts(parsed.tag ? toasts.filter((t) => t.tag !== parsed.tag) : []);
      return;
    }
    if (parsed.kind === 'command') {
      runCommand(parsed.command, parsed);
      return;
    }
    void showNotification(parsed.notification, parsed.imageSrc);
  };

  const link = new HaLink({
    url: () => s().url,
    token: deps.token,
    device: () => ({
      deviceId: deviceId(),
      deviceName: haDeviceName(s().link.deviceName),
      appVersion: app.getVersion(),
      manufacturer: 'MultiOutils',
      model: isWin ? 'PC Windows' : `PC ${os.platform()}`,
      osName: isWin ? 'Windows' : os.platform(),
      osVersion: os.release()
    }),
    loadRegistration: () => {
      const r = deps.kvGet<HaRegistration | null>(REG_KEY, null);
      return r && typeof r.webhook_id === 'string' ? r : null;
    },
    saveRegistration: (reg) => deps.kvSet(REG_KEY, reg),
    sensors: () => (s().link.sensors ? sensors.read() : null),
    sensorInterval: () => s().link.sensorInterval,
    buttons: () => (s().link.enabled && s().link.buttons && s().link.commands ? { powerCommands: s().link.powerCommands } : null),
    onPush,
    onStatus: (st) => {
      coreStatus = st;
      broadcastStatus();
    },
    log
  });

  // veille, réveil, verrouillage : on reconnecte / on renvoie l'état tout de suite
  const onResume = (): void => link.nudge();
  const onLockChange = (): void => void link.pushSensors(false);
  powerMonitor.on('resume', onResume);
  powerMonitor.on('unlock-screen', onResume);
  powerMonitor.on('lock-screen', onLockChange);

  /* ───────── IPC ───────── */

  ipcMain.handle('ha:status', () => status());
  ipcMain.handle('ha:forget', () => {
    link.forget();
    if (s().link.enabled) link.start();
    broadcastStatus();
    return status();
  });
  ipcMain.handle('ha:reconnect', () => {
    if (s().link.enabled) link.start();
    return status();
  });
  ipcMain.handle('ha:history', () => history);
  ipcMain.handle('ha:clearHistory', () => {
    history = [];
    deps.kvSet(HISTORY_KEY, history);
    ctx.broadcast('ha:history', history);
  });
  ipcMain.handle('ha:testToast', () => api.showTest());
  ipcMain.handle('ha:openDashboard', (_e, path?: unknown) => dashboard.show(typeof path === 'string' && path.startsWith('/') ? path : undefined));

  ipcMain.handle('ha:toasts', (e) => (toastWin.isSender(e.sender.id) ? toastWin.current() : null));
  ipcMain.on('ha:toastResize', (e, h: unknown) => {
    if (toastWin.isSender(e.sender.id) && typeof h === 'number' && Number.isFinite(h)) toastWin.resize(h);
  });
  ipcMain.on('ha:toastDismiss', (e, id: unknown) => {
    if (toastWin.isSender(e.sender.id) && typeof id === 'string') dismiss(id);
  });
  ipcMain.on('ha:toastOpen', (e, id: unknown) => {
    if (!toastWin.isSender(e.sender.id)) return;
    const n = toasts.find((t) => t.id === id);
    if (!n) return;
    dismiss(n.id);
    const target = n.url ? resolveHaLink(n.url, base()) : null;
    if (target?.kind === 'external') void shell.openExternal(target.url);
    else dashboard.show(target?.path);
  });
  ipcMain.on('ha:toastAction', (e, id: unknown, action: unknown) => {
    if (!toastWin.isSender(e.sender.id)) return;
    const n = toasts.find((t) => t.id === id);
    const a = n?.actions.find((x) => x.action === action);
    if (!n || !a) return;
    dismiss(n.id);
    if (a.action === 'MULTIOUTILS_CANCEL_SHUTDOWN') {
      if (isWin) run('shutdown.exe', ['/a']);
      return;
    }
    if (a.uri) {
      const target = resolveHaLink(a.uri, base());
      if (target?.kind === 'external') void shell.openExternal(target.url);
      else if (target) dashboard.show(target.path);
      return;
    }
    if (n.id.startsWith('ha-local-')) return;
    void link.fireAction(a.action, n.tag ? { tag: n.tag } : {}).catch((err) => {
      ctx.notify('Home Assistant', ctx.i18n.t('ha.actionFailed', { msg: err instanceof Error ? err.message : String(err) }));
    });
  });

  const dashOnly = (fn: () => unknown) => (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    dashboard.isSender(e.sender.id) ? fn() : undefined;
  ipcMain.on('ha:dash:reload', dashOnly(() => dashboard.reload()));
  ipcMain.on('ha:dash:back', dashOnly(() => dashboard.back()));
  ipcMain.on('ha:dash:home', dashOnly(() => dashboard.home()));
  ipcMain.on('ha:dash:external', dashOnly(() => dashboard.openExternal()));
  ipcMain.on('ha:dash:hide', dashOnly(() => dashboard.hide()));
  ipcMain.handle('ha:dash:pin', dashOnly(() => dashboard.togglePin()));

  ctx.registerLocalCommand('homeassistant.dashboard', () => dashboard.toggle());

  const api: HaIntegration = {
    status,
    async apply(before) {
      const cur = s();
      const urlChanged = !before || before.url !== cur.url;
      if (urlChanged) dashboard.invalidate();
      const linkChanged =
        !before ||
        urlChanged ||
        before.link.enabled !== cur.link.enabled ||
        before.link.deviceName !== cur.link.deviceName ||
        before.link.sensors !== cur.link.sensors;
      if (linkChanged) {
        if (cur.link.enabled) link.start();
        else link.stop();
      }
      if (
        !linkChanged &&
        (before?.link.buttons !== cur.link.buttons ||
          before?.link.commands !== cur.link.commands ||
          before?.link.powerCommands !== cur.link.powerCommands)
      ) {
        void link.ensureButtons();
      }
      if (before && before.notifications.position !== cur.notifications.position) toastWin.set(toasts);
      broadcastStatus();
    },
    tokenChanged() {
      dashboard.invalidate();
      if (s().link.enabled) link.start();
    },
    openDashboard: (path) => dashboard.show(path),
    toggleDashboard: () => dashboard.toggle(),
    history: () => history,
    showTest() {
      const t = ctx.i18n.t;
      void showNotification({
        id: `ha-local-${++toastSeq}`,
        title: t('ha.test.title'),
        message: t('ha.test.message'),
        duration: s().notifications.duration,
        important: false,
        sound: s().notifications.sound,
        icon: 'home',
        actions: [
          { action: 'test_ok', title: t('ha.test.ok') },
          { action: 'test_dash', title: t('ha.test.dashboard'), uri: '/' }
        ],
        receivedAt: Date.now()
      });
    },
    dispose() {
      powerMonitor.off('resume', onResume);
      powerMonitor.off('unlock-screen', onResume);
      powerMonitor.off('lock-screen', onLockChange);
      link.stop(false);
      toastWin.destroy();
      dashboard.destroy();
    }
  };
  return api;
}
