/**
 * Liaison PC ↔ Home Assistant, partie pure (sans Electron, testée par vitest).
 *
 * MultiOutils s'enregistre auprès de l'intégration « mobile_app » de Home
 * Assistant, comme l'appli iPhone / Android :
 *  - HA crée un appareil (le PC) et ses capteurs (envoyés par webhook) ;
 *  - HA crée un service notify.mobile_app_<nom>, dont les messages arrivent
 *    par la connexion WebSocket ouverte par le PC (« local push ») : aucun
 *    port à ouvrir, pas de MQTT, pas d'intégration à installer dans HA.
 */
import type { HaNotification, HaNotificationAction } from '../../../../common/launcher';

/** Identifiant d'appli déclaré à HA (stable : ne pas changer). */
export const HA_APP_ID = 'io.multioutils.desktop';

/** Ce que HA renvoie à l'enregistrement (gardé en base). */
export interface HaRegistration {
  webhook_id: string;
  cloudhook_url?: string | null;
  remote_ui_url?: string | null;
  secret?: string | null;
  /** Nos propres infos, pour savoir s'il faut mettre l'enregistrement à jour. */
  device_id: string;
  device_name: string;
}

export interface HaDeviceInfo {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  manufacturer: string;
  model: string;
  osName: string;
  osVersion: string;
}

/** Corps de POST /api/mobile_app/registrations. */
export function registrationPayload(d: HaDeviceInfo): Record<string, unknown> {
  return {
    device_id: d.deviceId,
    app_id: HA_APP_ID,
    app_name: 'MultiOutils',
    app_version: d.appVersion,
    device_name: d.deviceName,
    manufacturer: d.manufacturer,
    model: d.model,
    os_name: d.osName,
    os_version: d.osVersion,
    supports_encryption: false,
    // notifications reçues par la connexion WebSocket du PC
    app_data: { push_websocket_channel: true }
  };
}

/** Corps du webhook « update_registration » (version de l'appli, nom…). */
export function updateRegistrationPayload(d: HaDeviceInfo): Record<string, unknown> {
  const { device_id: _id, app_id: _app, app_name: _n, supports_encryption: _e, os_name: _o, ...rest } =
    registrationPayload(d) as Record<string, unknown> & {
      device_id: unknown;
      app_id: unknown;
      app_name: unknown;
      supports_encryption: unknown;
      os_name: unknown;
    };
  return rest;
}

/**
 * Équivalent de homeassistant.util.slugify pour les noms simples :
 * « CONNOR-VII » → « connor_vii », « PC de Noë » → « pc_de_noe ».
 */
export function haSlugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Service notify que HA crée pour ce PC. */
export const haNotifyService = (deviceName: string): string => `notify.mobile_app_${haSlugify(deviceName) || 'pc'}`;

/** Nom d'appareil dans HA (« PC » si vide, à la demande de Noë). */
export function haDeviceName(custom: string): string {
  const v = custom.trim() || 'PC';
  return v.slice(0, 60);
}

/** Adresse WebSocket de l'API (http → ws, https → wss). */
export function haWebSocketUrl(base: string): string {
  return `${base.replace(/^http/i, 'ws')}/api/websocket`;
}

/** Adresse du webhook : en local d'abord (l'adresse configurée), sinon le cloud. */
export function haWebhookUrl(base: string, reg: Pick<HaRegistration, 'webhook_id'>): string {
  return `${base}/api/webhook/${encodeURIComponent(reg.webhook_id)}`;
}

/* ─────────────────────────── boutons (scripts HA) ─────────────────────────── */

/**
 * Boutons du PC dans HA : des scripts (script.pc_veille…) qui envoient la
 * commande au service notify du PC. L'appli mobile_app ne peut pas créer
 * d'entités « button » : un script s'affiche pareil (bouton « Exécuter »)
 * et se pose directement sur un tableau de bord.
 */
export const HA_BUTTONS = [
  { key: 'veille', command: 'sleep', name: 'Veille', icon: 'mdi:power-sleep' },
  { key: 'verrouiller', command: 'lock', name: 'Verrouiller', icon: 'mdi:monitor-lock' },
  { key: 'eteindre', command: 'shutdown', name: 'Éteindre', icon: 'mdi:power' },
  { key: 'redemarrer', command: 'restart', name: 'Redémarrer', icon: 'mdi:restart' }
] as const;

export interface HaButtonScript {
  objectId: string;
  config: Record<string, unknown>;
}

export function haButtonScripts(deviceName: string, powerCommands: boolean): HaButtonScript[] {
  const slug = haSlugify(deviceName) || 'pc';
  const service = haNotifyService(deviceName);
  return HA_BUTTONS.filter((b) => powerCommands || (b.command !== 'shutdown' && b.command !== 'restart')).map((b) => ({
    objectId: `${slug}_${b.key}`,
    config: {
      alias: `${deviceName} · ${b.name}`,
      description: 'Créé par MultiOutils : envoie la commande au PC.',
      icon: b.icon,
      mode: 'single',
      sequence: [{ action: service, data: { message: `command_${b.command}` } }]
    }
  }));
}

/* ───────────────────────────── notifications ───────────────────────────── */

export type HaCommand = 'lock' | 'sleep' | 'shutdown' | 'restart' | 'open_url' | 'dashboard' | 'launcher';
const SIMPLE_COMMANDS: HaCommand[] = ['lock', 'sleep', 'shutdown', 'restart', 'dashboard', 'launcher'];

export type ParsedHaMessage =
  | { kind: 'notify'; notification: HaNotification; imageSrc?: string }
  | { kind: 'clear'; tag: string | null }
  | { kind: 'command'; command: HaCommand; url?: string };

export interface ToastDefaults {
  duration: number;
  sound: boolean;
}

const s = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');

const COLOR_NAMES = ['lavande', 'or', 'ambre', 'corail', 'menthe'];
/** Quelques couleurs habituelles en anglais → accent « encre » le plus proche. */
const COLOR_ALIASES: Record<string, string> = {
  red: 'corail',
  orange: 'ambre',
  yellow: 'or',
  gold: 'or',
  green: 'menthe',
  teal: 'menthe',
  purple: 'lavande',
  violet: 'lavande',
  blue: 'lavande'
};

export function sanitizeColor(v: unknown): string | undefined {
  const c = s(v, 20).toLowerCase();
  if (!c) return undefined;
  if (COLOR_NAMES.includes(c)) return c;
  if (COLOR_ALIASES[c]) return COLOR_ALIASES[c];
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return undefined;
}

/** Icônes Material Design (mdi:) courantes → symboles du sprite « encre ». */
const MDI: Record<string, string> = {
  bell: 'bell',
  'bell-ring': 'bellon',
  home: 'home',
  'home-assistant': 'home',
  lightbulb: 'sun',
  'lightbulb-on': 'sun',
  'white-balance-sunny': 'sun',
  'weather-night': 'moon',
  lock: 'lock',
  'lock-open': 'lock',
  'door-open': 'lock',
  door: 'lock',
  camera: 'camera',
  cctv: 'camera',
  alert: 'alert',
  'alert-circle': 'alert',
  information: 'info',
  'information-outline': 'info',
  check: 'check',
  'check-circle': 'check',
  calendar: 'cal',
  clock: 'clock',
  'clock-outline': 'clock',
  alarm: 'clock',
  'washing-machine': 'refresh',
  'dishwasher': 'refresh',
  'robot-vacuum': 'home',
  thermometer: 'sun',
  'flash': 'zap',
  'lightning-bolt': 'zap',
  'package-variant': 'download',
  'package-variant-closed': 'download',
  email: 'mail',
  message: 'chat',
  phone: 'phone',
  cellphone: 'phone',
  music: 'play',
  play: 'play',
  wifi: 'wifi',
  heart: 'heart',
  star: 'star',
  'shield-home': 'shield',
  shield: 'shield',
  'battery-alert': 'alert',
  'trash-can': 'trash',
  delete: 'trash'
};

const SPRITES = new Set([
  'home', 'bell', 'bellon', 'alert', 'info', 'check', 'sun', 'moon', 'lock', 'camera', 'clock', 'cal',
  'zap', 'mail', 'chat', 'phone', 'play', 'wifi', 'heart', 'star', 'shield', 'trash', 'download',
  'refresh', 'sparkle', 'plug', 'monitor', 'key', 'cloud', 'signal', 'tag', 'pin', 'send', 'image'
]);

/** Icône : emoji, nom du sprite, ou mdi:… traduit. */
export function sanitizeIcon(v: unknown): string | undefined {
  const raw = s(v, 60);
  if (!raw) return undefined;
  if (raw.startsWith('mdi:')) return MDI[raw.slice(4)] ?? 'bell';
  if (SPRITES.has(raw)) return raw;
  // un emoji (ou deux) : affiché tel quel
  if ([...raw].length <= 4 && /\p{Extended_Pictographic}/u.test(raw)) return raw;
  return undefined;
}

const truthy = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1' || v === 'on';

function parseActions(raw: unknown): HaNotificationAction[] {
  if (!Array.isArray(raw)) return [];
  const out: HaNotificationAction[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const action = s(r.action, 100);
    const title = s(r.title, 40) || action;
    if (!action || !title) continue;
    const uriRaw = s(r.uri ?? r.url, 1000);
    const uri = /^https?:\/\//i.test(uriRaw) || uriRaw.startsWith('/') ? uriRaw : undefined;
    out.push({
      action,
      title,
      ...(uri ? { uri } : {}),
      ...(truthy(r.destructive) ? { danger: true } : {})
    });
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Message reçu par le canal « local push » de HA → notification, effacement
 * ou commande. Accepte les champs de l'appli mobile (data.image, data.actions,
 * data.tag, data.timeout, data.clickAction / url, push.interruption-level…).
 */
export function parseHaMessage(
  raw: unknown,
  defaults: ToastDefaults,
  id: string,
  now = Date.now()
): ParsedHaMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const data = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const message = s(r.message, 2000);
  const title = s(r.title, 200);

  if (message === 'clear_notification') return { kind: 'clear', tag: s(data.tag, 100) || null };
  if (message.startsWith('command_')) {
    const cmd = message.slice(8);
    if ((SIMPLE_COMMANDS as string[]).includes(cmd)) {
      return { kind: 'command', command: cmd as HaCommand };
    }
    if (cmd === 'open_url' || cmd === 'webview') {
      const url = s(data.url ?? data.command, 1000);
      return /^https?:\/\//i.test(url) || url.startsWith('/') ? { kind: 'command', command: 'open_url', url } : null;
    }
    return null;
  }
  if (!message && !title) return null;

  const push = (data.push && typeof data.push === 'object' ? data.push : {}) as Record<string, unknown>;
  const level = s(push['interruption-level'], 20);
  const importance = s(data.importance ?? data.priority, 20).toLowerCase();
  const important =
    truthy(data.sticky) || truthy(data.persistent) || level === 'critical' || level === 'time-sensitive' ||
    importance === 'high' || importance === 'max' || importance === 'critical';

  const durationRaw = Number(data.duration ?? data.timeout);
  let duration = Number.isFinite(durationRaw) && durationRaw >= 0 ? Math.min(3600, Math.round(durationRaw)) : defaults.duration;
  if (important && !(Number.isFinite(durationRaw) && durationRaw > 0)) duration = 0;

  const soundRaw = data.sound ?? push.sound;
  const sound = soundRaw === undefined ? defaults.sound || important : !(soundRaw === false || soundRaw === 'none' || soundRaw === 'false');

  const attachment = (data.attachment && typeof data.attachment === 'object' ? data.attachment : {}) as Record<string, unknown>;
  const imageSrc = s(data.image ?? attachment.url, 2000) || undefined;
  const urlRaw = s(data.url ?? data.clickAction, 1000);
  const url = /^https?:\/\//i.test(urlRaw) || urlRaw.startsWith('/') ? urlRaw : undefined;
  const tag = s(data.tag, 100) || undefined;
  const icon = sanitizeIcon(data.icon ?? data.notification_icon);
  const color = sanitizeColor(data.color);

  const notification: HaNotification = {
    id,
    title: title || 'Home Assistant',
    message,
    duration,
    important,
    sound,
    actions: parseActions(data.actions),
    receivedAt: now,
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    ...(tag ? { tag } : {}),
    ...(url ? { url } : {})
  };
  return { kind: 'notify', notification, ...(imageSrc ? { imageSrc } : {}) };
}

/** Pile de notifications : même tag = remplacée, au plus `max` gardées. */
export function pushToast(list: HaNotification[], n: HaNotification, max = 5): HaNotification[] {
  const rest = n.tag ? list.filter((x) => x.tag !== n.tag) : list;
  const next = [n, ...rest];
  if (next.length <= max) return next;
  // on retire d'abord les plus anciennes non importantes
  const out = [...next];
  while (out.length > max) {
    const idx = out.map((x) => x.important).lastIndexOf(false);
    out.splice(idx >= 1 ? idx : out.length - 1, 1);
  }
  return out;
}

/**
 * Adresse à télécharger pour une image de notification, et s'il faut y joindre
 * le jeton : chemin relatif (/api/camera_proxy/…) ou même origine que HA.
 */
export function resolveHaImage(src: string, base: string): { url: string; auth: boolean } | null {
  if (src.startsWith('data:image/')) return null;
  if (src.startsWith('/')) return { url: `${base}${src}`, auth: true };
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const u = new URL(src);
    const b = new URL(base);
    return { url: u.toString(), auth: u.origin === b.origin };
  } catch {
    return null;
  }
}

/** Lien d'une notification : relatif = page de HA (ouvert dans la mini fenêtre). */
export function resolveHaLink(link: string, base: string | null): { kind: 'dashboard'; path: string } | { kind: 'external'; url: string } | null {
  if (link.startsWith('/')) return { kind: 'dashboard', path: link };
  if (!/^https?:\/\//i.test(link)) return null;
  if (base) {
    try {
      const u = new URL(link);
      if (u.origin === new URL(base).origin) return { kind: 'dashboard', path: `${u.pathname}${u.search}${u.hash}` };
    } catch {
      return null;
    }
  }
  return { kind: 'external', url: link };
}

/* ───────────────────────────────── capteurs ───────────────────────────────── */

export interface HaSensorDef {
  unique_id: string;
  name: string;
  type: 'sensor' | 'binary_sensor';
  icon: string;
  unit_of_measurement?: string;
  device_class?: string;
  state_class?: string;
  entity_category?: 'diagnostic';
}

export const HA_SENSORS: HaSensorDef[] = [
  { unique_id: 'cpu_usage', name: 'Processeur', type: 'sensor', icon: 'mdi:cpu-64-bit', unit_of_measurement: '%', state_class: 'measurement' },
  { unique_id: 'memory_usage', name: 'Mémoire utilisée', type: 'sensor', icon: 'mdi:memory', unit_of_measurement: '%', state_class: 'measurement' },
  { unique_id: 'disk_usage', name: 'Disque système utilisé', type: 'sensor', icon: 'mdi:harddisk', unit_of_measurement: '%', state_class: 'measurement' },
  { unique_id: 'idle_time', name: 'Inactif depuis', type: 'sensor', icon: 'mdi:timer-sand', unit_of_measurement: 's', device_class: 'duration', state_class: 'measurement' },
  { unique_id: 'user_state', name: 'État de la session', type: 'sensor', icon: 'mdi:account' },
  { unique_id: 'active', name: 'Utilisé', type: 'binary_sensor', icon: 'mdi:monitor-account', device_class: 'occupancy' },
  { unique_id: 'locked', name: 'Session verrouillée', type: 'binary_sensor', icon: 'mdi:monitor-lock' },
  { unique_id: 'on_battery', name: 'Sur batterie', type: 'binary_sensor', icon: 'mdi:battery' },
  { unique_id: 'last_boot', name: 'Dernier démarrage', type: 'sensor', icon: 'mdi:restart', device_class: 'timestamp', entity_category: 'diagnostic' },
  { unique_id: 'app_version', name: 'Version de MultiOutils', type: 'sensor', icon: 'mdi:application', entity_category: 'diagnostic' }
];

export type HaSensorValues = Record<string, string | number | boolean | null>;

/** Corps du webhook « register_sensor » pour une définition et sa valeur actuelle. */
export function registerSensorPayload(def: HaSensorDef, value: string | number | boolean | null): Record<string, unknown> {
  const { unique_id, name, type, icon, ...rest } = def;
  return {
    type: 'register_sensor',
    data: { unique_id, name, type, icon, state: value, ...rest }
  };
}

/**
 * Corps du webhook « update_sensor_states » : seulement les capteurs qui ont
 * changé (ou tous si `force`).
 */
export function sensorUpdates(
  values: HaSensorValues,
  previous: HaSensorValues | null,
  force = false
): Array<{ unique_id: string; type: string; state: unknown; icon: string }> {
  const out: Array<{ unique_id: string; type: string; state: unknown; icon: string }> = [];
  for (const def of HA_SENSORS) {
    if (!(def.unique_id in values)) continue;
    const v = values[def.unique_id];
    if (!force && previous && previous[def.unique_id] === v) continue;
    out.push({ unique_id: def.unique_id, type: def.type, state: v, icon: def.icon });
  }
  return out;
}

/** Usage CPU (%) entre deux relevés de os.cpus(). */
export function cpuPercent(
  prev: Array<{ times: Record<string, number> }>,
  cur: Array<{ times: Record<string, number> }>
): number {
  let idle = 0;
  let total = 0;
  cur.forEach((c, i) => {
    const p = prev[i];
    if (!p) return;
    for (const k of Object.keys(c.times)) {
      const d = (c.times[k] ?? 0) - (p.times[k] ?? 0);
      total += d;
      if (k === 'idle') idle += d;
    }
  });
  if (total <= 0) return 0;
  return Math.round(((total - idle) / total) * 1000) / 10;
}

/** Délai avant la prochaine tentative de connexion (2 s → 60 s). */
export const reconnectDelay = (attempt: number): number => Math.min(60_000, 2000 * 2 ** Math.min(attempt, 5));
