/**
 * Home Assistant (API REST) : quelles entités on peut piloter depuis le
 * lanceur, et quel service appeler. Sans dépendance Electron : testé par vitest.
 */

export interface HaState {
  entity_id: string;
  state: string;
  attributes?: { friendly_name?: string; [k: string]: unknown };
}

export type HaAction = 'toggle' | 'on' | 'off';

/** Domaines pilotables (allumer / éteindre / lancer). */
export const HA_DOMAINS = [
  'light',
  'switch',
  'fan',
  'cover',
  'input_boolean',
  'media_player',
  'climate',
  'humidifier',
  'scene',
  'script',
  'automation',
  'button',
  'input_button',
  'lock',
  'vacuum',
  'siren'
] as const;

/** Domaines qui se « lancent » (pas d'état allumé / éteint). */
const ONE_SHOT = new Set(['scene', 'script', 'button', 'input_button']);

export const haDomain = (entityId: string): string => entityId.split('.')[0] ?? '';

export function isControllable(s: HaState): boolean {
  return (HA_DOMAINS as readonly string[]).includes(haDomain(s.entity_id)) && s.state !== 'unavailable';
}

export const isOneShot = (entityId: string): boolean => ONE_SHOT.has(haDomain(entityId));

/** État considéré comme « allumé ». */
export function isOn(s: HaState): boolean {
  return ['on', 'open', 'opening', 'playing', 'unlocked', 'cleaning', 'heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only'].includes(
    s.state
  );
}

/** Service Home Assistant pour une action sur une entité : [domaine, service]. */
export function haService(entityId: string, action: HaAction, currentlyOn: boolean): [string, string] {
  const domain = haDomain(entityId);
  if (domain === 'scene' || domain === 'script') return [domain, 'turn_on'];
  if (domain === 'button' || domain === 'input_button') return [domain, 'press'];
  const wantOn = action === 'toggle' ? !currentlyOn : action === 'on';
  if (domain === 'cover') return ['cover', wantOn ? 'open_cover' : 'close_cover'];
  if (domain === 'lock') return ['lock', wantOn ? 'unlock' : 'lock'];
  if (domain === 'vacuum') return ['vacuum', wantOn ? 'start' : 'return_to_base'];
  return [domain, wantOn ? 'turn_on' : 'turn_off'];
}

/** Adresse de base nettoyée (« homeassistant.local:8123 » → http://…). */
export function haBaseUrl(raw: string): string | null {
  let v = raw.trim().replace(/\/+$/, '');
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Mot de fin de requête qui force une action (« salon off », « salon allumer »). */
export function splitHaAction(search: string): { text: string; action: HaAction } {
  const m = search.match(/^(.*?)\s+(on|off|allumer|allume|éteindre|eteindre|éteins|eteins|ouvrir|fermer)$/i);
  if (!m) return { text: search, action: 'toggle' };
  const w = m[2].toLowerCase();
  const on = ['on', 'allumer', 'allume', 'ouvrir'].includes(w);
  return { text: m[1], action: on ? 'on' : 'off' };
}
