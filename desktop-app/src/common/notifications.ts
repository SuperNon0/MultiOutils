/**
 * Notifications de MultiOutils : toutes passent par les mêmes pop-ups (celles
 * de Home Assistant), réglées dans Réglages → Notifications.
 */
import { HA_TOAST_POSITIONS, type HaToastPosition, type HaToastSize } from './launcher';

/** Familles de notifications, chacune activable à part dans les réglages. */
export const NOTIF_KINDS = [
  'capture',
  'clipboard',
  'colorpicker',
  'autoclick',
  'desktop',
  'files',
  'launcher',
  'homeassistant',
  'app'
] as const;
export type NotifKind = (typeof NOTIF_KINDS)[number];

export const NOTIF_SIZES: HaToastSize[] = ['small', 'normal', 'large'];
export const NOTIF_DURATIONS = [3, 4, 6, 8, 12, 20, 30, 60] as const;

export interface NotifSettings {
  /** Interrupteur général : plus aucune pop-up (sauf alertes forcées). */
  enabled: boolean;
  position: HaToastPosition;
  size: HaToastSize;
  /** Durée d'affichage par défaut, en secondes (3 à 120). */
  duration: number;
  sound: boolean;
  /** Son par défaut : un son intégré ou le nom d'un fichier du dossier des sons. */
  soundName: string;
  /** Volume des sons, de 0 à 100. */
  volume: number;
  /** Ne pas déranger : seules les notifications importantes et les erreurs s'affichent. */
  doNotDisturb: boolean;
  /** Les erreurs s'affichent même si leur famille est coupée. */
  errorsAlways: boolean;
  kinds: Record<NotifKind, boolean>;
}

export function defaultNotifSettings(): NotifSettings {
  return {
    enabled: true,
    position: 'bottom-right',
    size: 'normal',
    duration: 6,
    sound: false,
    soundName: 'carillon',
    volume: 70,
    doNotDisturb: false,
    errorsAlways: true,
    kinds: Object.fromEntries(NOTIF_KINDS.map((k) => [k, true])) as Record<NotifKind, boolean>
  };
}

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const int = (v: unknown, min: number, max: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;

/** Nom de son valide : son intégré ou simple nom de fichier (pas de chemin). */
export function cleanSoundName(v: unknown, d: string): string {
  const s = typeof v === 'string' ? v.trim().slice(0, 120) : '';
  return s && !/[\\/:]/.test(s) && !s.includes('..') ? s : d;
}

/** Réglages lus en base : chaque valeur bornée, sinon celle par défaut. */
export function normalizeNotifSettings(raw: unknown): NotifSettings {
  const d = defaultNotifSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const k = (r.kinds && typeof r.kinds === 'object' ? r.kinds : {}) as Record<string, unknown>;
  return {
    enabled: bool(r.enabled, d.enabled),
    position: HA_TOAST_POSITIONS.includes(r.position as HaToastPosition) ? (r.position as HaToastPosition) : d.position,
    size: NOTIF_SIZES.includes(r.size as HaToastSize) ? (r.size as HaToastSize) : d.size,
    duration: int(r.duration, 3, 120, d.duration),
    sound: bool(r.sound, d.sound),
    soundName: cleanSoundName(r.soundName, d.soundName),
    volume: int(r.volume, 0, 100, d.volume),
    doNotDisturb: bool(r.doNotDisturb, d.doNotDisturb),
    errorsAlways: bool(r.errorsAlways, d.errorsAlways),
    kinds: Object.fromEntries(NOTIF_KINDS.map((kind) => [kind, bool(k[kind], d.kinds[kind])])) as Record<NotifKind, boolean>
  };
}

/**
 * Premier lancement de cette version : on reprend les réglages des pop-ups
 * Home Assistant (emplacement, son, ne pas déranger…) pour ne rien perdre.
 */
export function notifSettingsFromHa(ha: unknown): NotifSettings {
  const d = defaultNotifSettings();
  const n = (ha && typeof ha === 'object' ? ha : {}) as Record<string, unknown>;
  const base = normalizeNotifSettings({ ...n, duration: d.duration, sound: d.sound });
  return { ...base, kinds: { ...base.kinds, homeassistant: bool(n.enabled, true) } };
}

export interface NotifFilter {
  kind: NotifKind;
  important?: boolean;
  error?: boolean;
  /** Toujours affichée (ex. extinction du PC dans 30 s, test depuis les réglages). */
  force?: boolean;
}

/** La notification doit-elle s'afficher avec ces réglages ? */
export function notifAllowed(s: NotifSettings, f: NotifFilter): boolean {
  if (f.force) return true;
  if (!s.enabled) return false;
  if (!s.kinds[f.kind] && !(f.error && s.errorsAlways)) return false;
  if (s.doNotDisturb && !f.important && !f.error) return false;
  return true;
}

/** Famille par défaut des notifications d'un module (selon son id). */
export function notifKindForModule(moduleId: string): NotifKind {
  switch (moduleId) {
    case 'screenshot':
    case 'ocr':
    case 'ai':
      return 'capture';
    case 'clipboard':
      return 'clipboard';
    case 'color-picker':
    case 'colorpicker':
      return 'colorpicker';
    case 'autoclicker':
      return 'autoclick';
    case 'desktop':
      return 'desktop';
    case 'files':
      return 'files';
    case 'launcher':
      return 'launcher';
    default:
      return 'app';
  }
}
