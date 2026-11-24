/**
 * Home Assistant côté PC : relie la liaison (link.ts), les pop-ups
 * (centre des notifications, main/notifications), la mini fenêtre du tableau de bord (dashboard.ts) et les
 * commandes reçues de HA (boutons Veille, Verrouiller, Éteindre, Redémarrer). Appelé par le module
 * Lanceur, qui garde l'adresse et le jeton de HA.
 */
import { app, ipcMain, powerMonitor, shell } from 'electron';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { extname } from 'node:path';
import type { HaNotification, HaSettings, HaLinkStatus } from '../../../../common/launcher';
import type { MainHostContext } from '../../../module-registry';
import { SOUND_TYPES, type PopupHandlers } from '../../../notifications/center';
import {
  classifySoundRef,
  haDeviceName,
  parseHaMessage,
  resolveHaImage,
  resolveHaLink,
  type HaCommand,
  type HaRegistration
} from '../core/ha-link';
import { haBaseUrl } from '../core/homeassistant';
import { DashboardWindow } from './dashboard';
import { HaLink, type HaLinkCoreStatus } from './link';
import { PcSensors } from './sensors';
import { createStreamDeckBridge } from './streamdeck-bridge';

const REG_KEY = 'launcher.ha.registration';
const DEVICE_ID_KEY = 'launcher.ha.deviceId';
const HISTORY_KEY = 'launcher.ha.history';
const HISTORY_MAX = 50;
const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const SOUND_MAX_BYTES = 4 * 1024 * 1024;
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

  const hub = ctx.notifications;
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

  const remember = (n: HaNotification): void => {
    // l'image et le son (lourds) ne sont pas gardés dans l'historique
    const { image: _img, soundSrc: _snd, ...light } = n;
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

  /* ───────── sons ───────── */

  const fetchSound = async (url: string, auth: boolean): Promise<string | undefined> => {
    const token = deps.token();
    try {
      const res = await fetch(url, {
        headers: auth && token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(8000)
      });
      let type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!type.startsWith('audio/')) {
        // serveur qui répond application/octet-stream : on se fie à l'extension
        type = SOUND_TYPES[extname(new URL(url).pathname).toLowerCase()] ?? '';
      }
      if (!res.ok || !type) return undefined;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > SOUND_MAX_BYTES) return undefined;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      return undefined;
    }
  };

  /** Son à jouer : intégré (nom), adresse HA ou fichier du PC. Sinon le son des réglages. */
  const resolveSound = async (ref: string | undefined): Promise<{ soundName?: string; soundSrc?: string }> => {
    const c = ref ? classifySoundRef(ref, base()) : null;
    if (c?.kind === 'builtin') return { soundName: c.name };
    if (c) {
      const src = c.kind === 'url' ? await fetchSound(c.url, c.auth) : await hub.readSoundFile(c.name);
      if (src) return { soundSrc: src };
    }
    return hub.defaultSound();
  };

  /** Clic sur une pop-up HA, ou sur un de ses boutons. */
  const popupHandlers: PopupHandlers = {
    onOpen(n) {
      const target = n.url ? resolveHaLink(n.url, base()) : null;
      if (target?.kind === 'external') void shell.openExternal(target.url);
      else dashboard.show(target?.path);
    },
    onAction(n, action) {
      const a = n.actions.find((x) => x.action === action);
      if (!a) return;
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
        ctx.notify('Home Assistant', ctx.i18n.t('ha.actionFailed', { msg: err instanceof Error ? err.message : String(err) }), {
          kind: 'homeassistant',
          error: true
        });
      });
    }
  };

  /** `force` : toujours affichée (extinction dans 30 s, test des réglages). */
  const showNotification = async (n: HaNotification, imageSrc?: string, soundRef?: string, force = false): Promise<void> => {
    remember(n);
    ctx.broadcast('ha:history', history);
    if (!hub.allowed({ kind: 'homeassistant', important: n.important, force })) return;
    n = { ...n, source: 'Home Assistant' };
    if (imageSrc) {
      const image = await fetchImage(imageSrc);
      if (image) n = { ...n, image };
    }
    if (n.sound) n = { ...n, ...(await resolveSound(soundRef)) };
    if (!n.size && hub.settings().size !== 'normal') n = { ...n, size: hub.settings().size };
    hub.show(n, popupHandlers);
  };

  const run = (file: string, args: string[]): void => {
    execFile(file, args, { windowsHide: true }, (err) => {
      if (err) log('[ha] commande :', err.message);
    });
  };

  /**
   * `local` : demandé depuis le PC lui-même (touche Stream Deck), donc sans
   * passer par les autorisations données à Home Assistant.
   */
  const runCommand = (command: HaCommand, extra: { url?: string }, local = false): void => {
    const cfg = local ? { commands: true, powerCommands: true } : s().link;
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
      }, undefined, undefined, true);
    }
  };

  const onPush = (raw: unknown): void => {
    const cfg = hub.settings();
    const parsed = parseHaMessage(raw, { duration: cfg.duration, sound: cfg.sound }, `ha-${Date.now().toString(36)}-${++toastSeq}`);
    if (!parsed) return;
    if (parsed.kind === 'clear') {
      const tag = parsed.tag;
      hub.clear((t) => t.source === 'Home Assistant' && (!tag || t.tag === tag));
      return;
    }
    if (parsed.kind === 'command') {
      runCommand(parsed.command, parsed);
      return;
    }
    void showNotification(parsed.notification, parsed.imageSrc, parsed.soundRef);
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
  const onResume = (): void => {
    link.nudge();
    streamDeck.nudge();
  };
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

  const dashOnly = (fn: () => unknown) => (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    dashboard.isSender(e.sender.id) ? fn() : undefined;
  ipcMain.on('ha:dash:reload', dashOnly(() => dashboard.reload()));
  ipcMain.on('ha:dash:back', dashOnly(() => dashboard.back()));
  ipcMain.on('ha:dash:home', dashOnly(() => dashboard.home()));
  ipcMain.on('ha:dash:external', dashOnly(() => dashboard.openExternal()));
  ipcMain.on('ha:dash:hide', dashOnly(() => dashboard.hide()));
  ipcMain.handle('ha:dash:pin', dashOnly(() => dashboard.togglePin()));

  ctx.registerLocalCommand('homeassistant.dashboard', () => dashboard.toggle());

  // Touches PC du Stream Deck (veille, verrouillage, extinction, redémarrage).
  ctx.registerLocalCommand('pc.sleep', () => runCommand('sleep', {}, true));
  ctx.registerLocalCommand('pc.lock', () => runCommand('lock', {}, true));
  ctx.registerLocalCommand('pc.shutdown', () => runCommand('shutdown', {}, true));
  ctx.registerLocalCommand('pc.restart', () => runCommand('restart', {}, true));
  ctx.registerLocalCommand('pc.cancelShutdown', () => {
    if (isWin) run('shutdown.exe', ['/a']);
  });

  // Pont Home Assistant du plugin Stream Deck (même adresse, même jeton).
  const streamDeck = createStreamDeckBridge({ ctx, settings: s, token: deps.token });

  const api: HaIntegration = {
    status,
    async apply(before) {
      const cur = s();
      const urlChanged = !before || before.url !== cur.url;
      if (urlChanged) dashboard.invalidate();
      if (before && (urlChanged || before.remoteUrl !== cur.remoteUrl)) streamDeck.restart();
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
      broadcastStatus();
    },
    tokenChanged() {
      dashboard.resetSession();
      streamDeck.restart();
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
        duration: hub.settings().duration,
        important: false,
        sound: hub.settings().sound,
        icon: 'home',
        actions: [
          { action: 'test_ok', title: t('ha.test.ok') },
          { action: 'test_dash', title: t('ha.test.dashboard'), uri: '/' }
        ],
        receivedAt: Date.now()
      }, undefined, undefined, true);
    },
    dispose() {
      powerMonitor.off('resume', onResume);
      powerMonitor.off('unlock-screen', onResume);
      powerMonitor.off('lock-screen', onLockChange);
      link.stop(false);
      streamDeck.dispose();
      dashboard.destroy();
    }
  };
  return api;
}
