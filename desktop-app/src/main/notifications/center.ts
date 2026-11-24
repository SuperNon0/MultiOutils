/**
 * Centre des notifications : TOUTES les notifications de MultiOutils (capture
 * enregistrée, couleur copiée, erreurs, Home Assistant…) s'affichent dans les
 * mêmes pop-ups « encre », à la place des notifications Windows. Réglages →
 * Notifications décide de ce qui s'affiche (familles, ne pas déranger),
 * où (emplacement, taille), combien de temps et avec quel son.
 */
import { app, ipcMain, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { HA_BUILTIN_SOUNDS, type HaNotification, type HaSoundList } from '../../common/launcher';
import { notifAllowed, type NotifFilter, type NotifKind, type NotifSettings } from '../../common/notifications';
import { classifySoundRef, HA_SOUND_EXTS, matchSoundFile, pushToast } from '../modules/launcher/core/ha-link';
import { ToastWindow } from './window';

const SOUND_MAX_BYTES = 4 * 1024 * 1024;
export const SOUND_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm'
};

/** Options d'une notification simple (titre + texte). */
export interface NotifyOptions {
  /** Famille (sinon celle du module qui notifie). */
  kind?: NotifKind;
  /** Erreur : liseré corail ; passe « ne pas déranger ». */
  error?: boolean;
  important?: boolean;
  /** Toujours affichée, quels que soient les réglages. */
  force?: boolean;
  /** Symbole du sprite « encre » ou emoji. */
  icon?: string;
  color?: string;
  /** Secondes ; 0 = reste jusqu'à fermeture (sinon la durée des réglages). */
  duration?: number;
  /** Même tag = remplace la précédente. */
  tag?: string;
  /** Clic sur la carte. */
  onClick?: () => void;
  actions?: Array<{ title: string; run: () => void; danger?: boolean }>;
}

/** Ce que fait une pop-up quand on clique dessus ou sur un de ses boutons. */
export interface PopupHandlers {
  onOpen?(n: HaNotification): void;
  onAction?(n: HaNotification, action: string): void;
}

export interface NotificationHub {
  notify(title: string, body?: string, opts?: NotifyOptions): void;
  /** La notification passerait-elle les réglages ? */
  allowed(filter: NotifFilter): boolean;
  /** Affiche une pop-up déjà construite (Home Assistant), sans filtrer. */
  show(n: HaNotification, handlers?: PopupHandlers): void;
  dismiss(id: string): void;
  /** Retire les pop-ups qui correspondent (ex. un tag effacé par HA). */
  clear(match: (n: HaNotification) => boolean): void;
  settings(): NotifSettings;
  /** Son par défaut des réglages, prêt à jouer. */
  defaultSound(): Promise<{ soundName?: string; soundSrc?: string }>;
  /** Fichier du dossier des sons → data URL. */
  readSoundFile(name: string): Promise<string | undefined>;
  /** Réglages changés : replace la pile si l'emplacement ou le volume a bougé. */
  refresh(): void;
  dispose(): void;
}

const ICONS: Record<NotifKind, string> = {
  capture: 'camera',
  clipboard: 'clipboard',
  colorpicker: 'eyedropper',
  autoclick: 'mouse',
  desktop: 'grid',
  launcher: 'search',
  homeassistant: 'home',
  app: 'bell'
};

let seq = 0;

export function createNotificationCenter(deps: {
  settings(): NotifSettings;
  t(key: string, vars?: Record<string, string | number>): string;
}): NotificationHub {
  const s = deps.settings;
  let toasts: HaNotification[] = [];
  const handlers = new Map<string, PopupHandlers>();
  const win = new ToastWindow(
    () => s().position,
    () => s().volume
  );

  const setToasts = (next: HaNotification[]): void => {
    toasts = next;
    for (const id of handlers.keys()) if (!toasts.some((t) => t.id === id)) handlers.delete(id);
    win.set(toasts);
  };
  const dismiss = (id: string): void => setToasts(toasts.filter((t) => t.id !== id));

  /* ───────── sons ───────── */

  /** Dossier des sons personnalisés (on y dépose ses .mp3 / .wav…). */
  const soundsDir = (): string => {
    const dir = join(app.getPath('userData'), 'ha-sons');
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // dossier non créé : la liste sera vide
    }
    return dir;
  };

  const soundFiles = async (): Promise<string[]> => {
    try {
      const all = await readdir(soundsDir());
      return all.filter((f) => HA_SOUND_EXTS.includes(extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  };

  const readSoundFile = async (name: string): Promise<string | undefined> => {
    const file = matchSoundFile(name, await soundFiles());
    if (!file) return undefined;
    const full = join(soundsDir(), file);
    try {
      if ((await stat(full)).size > SOUND_MAX_BYTES) return undefined;
      const buf = await readFile(full);
      return `data:${SOUND_TYPES[extname(file).toLowerCase()] ?? 'audio/mpeg'};base64,${buf.toString('base64')}`;
    } catch {
      return undefined;
    }
  };

  /** Son intégré ou fichier du dossier des sons ; sinon le carillon. */
  const localSound = async (ref: string): Promise<{ soundName?: string; soundSrc?: string }> => {
    const c = classifySoundRef(ref, null);
    if (c?.kind === 'builtin') return { soundName: c.name };
    if (c?.kind === 'file') {
      const src = await readSoundFile(c.name);
      if (src) return { soundSrc: src };
    }
    return { soundName: 'carillon' };
  };
  const defaultSound = (): Promise<{ soundName?: string; soundSrc?: string }> => localSound(s().soundName);

  /* ───────── notifications simples ───────── */

  const notify = (title: string, body = '', opts: NotifyOptions = {}): void => {
    const kind = opts.kind ?? 'app';
    const cfg = s();
    if (!notifAllowed(cfg, { kind, important: opts.important, error: opts.error, force: opts.force })) return;
    const id = `mo-${Date.now().toString(36)}-${++seq}`;
    const actions = opts.actions ?? [];
    let n: HaNotification = {
      id,
      title,
      message: body,
      icon: opts.icon ?? (opts.error ? 'alert' : ICONS[kind]),
      ...(opts.color ? { color: opts.color } : opts.error ? { color: 'corail' } : {}),
      duration: opts.duration ?? (opts.error ? Math.max(cfg.duration, 10) : cfg.duration),
      important: !!opts.important,
      error: !!opts.error,
      sound: cfg.sound,
      size: cfg.size,
      ...(opts.tag ? { tag: opts.tag } : {}),
      actions: actions.map((a, i) => ({ action: `a${i}`, title: a.title, ...(a.danger ? { danger: true } : {}) })),
      receivedAt: Date.now(),
      source: 'MultiOutils'
    };
    const h: PopupHandlers = {
      ...(opts.onClick ? { onOpen: () => opts.onClick?.() } : {}),
      ...(actions.length ? { onAction: (_n, action) => actions[Number(action.slice(1))]?.run() } : {})
    };
    const go = (): void => {
      handlers.set(n.id, h);
      setToasts(pushToast(toasts, n));
    };
    if (n.sound) {
      void defaultSound().then((snd) => {
        n = { ...n, ...snd };
        go();
      });
    } else go();
  };

  /* ───────── IPC (fenêtre des pop-ups, réglages) ───────── */

  ipcMain.handle('ha:toasts', (e) => win.current(e.sender.id));
  ipcMain.on('ha:toastResize', (e, h: unknown) => {
    if (typeof h === 'number' && Number.isFinite(h)) win.resize(e.sender.id, h);
  });
  ipcMain.on('ha:toastDismiss', (e, id: unknown) => {
    if (win.isSender(e.sender.id) && typeof id === 'string') dismiss(id);
  });
  ipcMain.on('ha:toastOpen', (e, id: unknown) => {
    if (!win.isSender(e.sender.id)) return;
    const n = toasts.find((t) => t.id === id);
    if (!n) return;
    const h = handlers.get(n.id);
    dismiss(n.id);
    h?.onOpen?.(n);
  });
  ipcMain.on('ha:toastAction', (e, id: unknown, action: unknown) => {
    if (!win.isSender(e.sender.id) || typeof action !== 'string') return;
    const n = toasts.find((t) => t.id === id);
    if (!n || !n.actions.some((x) => x.action === action)) return;
    const h = handlers.get(n.id);
    dismiss(n.id);
    h?.onAction?.(n, action);
  });
  ipcMain.handle('ha:sounds', async (): Promise<HaSoundList> => ({
    builtin: [...HA_BUILTIN_SOUNDS],
    files: await soundFiles(),
    folder: soundsDir()
  }));
  ipcMain.handle('ha:openSoundsFolder', () => shell.openPath(soundsDir()));
  /** Écoute d'un son depuis les réglages. */
  ipcMain.handle('ha:soundPreview', async (_e, name: unknown) => {
    if (typeof name !== 'string') return null;
    return { ...(await localSound(name)), volume: s().volume };
  });
  ipcMain.handle('notif:test', () => {
    const t = deps.t;
    notify(t('notif.test.title'), t('notif.test.message'), {
      force: true,
      icon: 'bell',
      actions: [{ title: t('notif.test.ok'), run: () => undefined }]
    });
  });

  let lastSettings = JSON.stringify([s().position, s().volume]);

  return {
    notify,
    allowed: (f) => notifAllowed(s(), f),
    show(n, h) {
      if (h) handlers.set(n.id, h);
      setToasts(pushToast(toasts, n));
    },
    dismiss,
    clear(match) {
      setToasts(toasts.filter((t) => !match(t)));
    },
    settings: s,
    defaultSound,
    readSoundFile,
    refresh() {
      const now = JSON.stringify([s().position, s().volume]);
      if (now !== lastSettings) {
        lastSettings = now;
        win.set(toasts);
      }
    },
    dispose() {
      win.destroy();
    }
  };
}
