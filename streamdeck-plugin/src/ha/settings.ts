/**
 * Réglages d'une touche Home Assistant et traduction en appel de service.
 * Fonctions pures (testées par vitest).
 */
import {
  defaultPress,
  haDomainOf,
  isOnState,
  parseServiceData
} from '../../../packages/shared/src/ha/model';
import type { HaRawState } from '../../../packages/shared/src/ha/socket';

export type HaMode =
  | 'auto'
  | 'toggle'
  | 'on'
  | 'off'
  | 'preset'
  | 'cycle'
  | 'adjust'
  | 'media'
  | 'service'
  | 'display'
  | 'event'
  | 'template'
  | 'camera';

export interface HaKeySettings {
  [k: string]: unknown;
  entity?: string;
  mode?: HaMode;
  /** preset : valeurs selon le domaine. */
  preset?: { brightness?: number | null; color?: string; kelvin?: number | null; position?: number | null; temperature?: number | null; hvac?: string; percentage?: number | null; volume?: number | null; option?: string; value?: number | null };
  /** cycle : liste « 100, 50, 10 » (luminosité %, position %, options…). */
  cycle?: string;
  /** adjust : pas (+ ou −). */
  step?: number;
  /** media : action du lecteur. */
  media?: 'play_pause' | 'next' | 'previous' | 'mute' | 'volume_up' | 'volume_down' | 'stop';
  /** service libre. */
  service?: string;
  data?: string;
  /** Viser l'entité de la touche (par défaut oui). */
  targetSelf?: boolean;
  /** événement. */
  eventType?: string;
  eventData?: string;
  /** modèle affiché. */
  template?: string;
  refresh?: number;
  /** caméra : ouvrir en grand à l'appui. */
  cameraOpen?: boolean;
  confirm?: boolean;
  /** Affichage. */
  titleMode?: 'auto' | 'custom' | 'none';
  titleText?: string;
  /** Couleur du texte dessiné par le plugin ; absente = contraste automatique. */
  textColor?: string;
  customIcon?: boolean;
  libraryIcon?: string;
  /** Icône de l'atelier : suivre l'état de l'entité (défaut), ou toujours la version allumée / éteinte. */
  libraryState?: 'auto' | 'on' | 'off';
  /** Icône de l'atelier : remplacer la couleur du symbole par celle de la lampe (sinon ses couleurs d'origine). */
  libraryLampColor?: boolean;
  valueMode?: 'auto' | 'show' | 'hide';
  /** Texte affiché à la place de l'état quand l'entité est active / inactive (ex. « Ouvert » / « Fermé »). */
  stateOnText?: string;
  stateOffText?: string;
  decimals?: number | null;
  gauge?: boolean;
  lightColor?: boolean;
  art?: boolean;
  icon?: string;
  iconOff?: string;
  color?: string;
  colorOff?: string;
  style?: 'accent' | 'plein' | 'symbole' | 'teinte';
  /** Couleur de fond des icônes automatiques ; absente = fond du thème. */
  bgColor?: string;
  /** Lumière : un appui long ouvre le panneau lumière (profil Stream Deck). */
  panel?: boolean;
  /** Panneau lumière : 16 teintes ({ c: '#rrggbb' } ou { k: kelvins }), absentes = selon l'ampoule. */
  panelSlots?: Array<{ c?: string; k?: number } | null>;
  /** Panneau lumière : 5 luminosités en %. */
  panelLevels?: number[];
}

export type PressPlan =
  | { kind: 'service'; domain: string; service: string; data?: Record<string, unknown>; target?: Record<string, unknown> }
  | { kind: 'event'; type: string; data?: Record<string, unknown> }
  | { kind: 'camera'; id: string }
  | { kind: 'none'; reason?: string };

const hexToRgb = (hex: string): [number, number, number] | null => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valeurs d'un cycle « 100, 50, 10 » ou « Film, Lecture ». */
export function cycleItems(text: string | undefined): string[] {
  return (text ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Prochaine valeur du cycle après l'état actuel. */
export function nextCycle(items: string[], current: string | number | null | undefined): string | undefined {
  if (!items.length) return undefined;
  const cur = current == null ? '' : String(current);
  const curNum = Number(cur);
  let i = items.findIndex((x) => x === cur || (Number.isFinite(curNum) && cur !== '' && Math.abs(Number(x.replace(',', '.')) - curNum) < 1.5));
  return items[(i + 1) % items.length];
}

/** Ce que fait un appui, selon les réglages et l'état actuel. */
export function planPress(s: HaKeySettings, state: HaRawState | undefined): PressPlan {
  const id = s.entity ?? '';
  const domain = haDomainOf(id);
  const target = id ? { entity_id: id } : undefined;
  const mode = s.mode ?? 'auto';
  const attrs = state?.attributes ?? {};
  switch (mode) {
    case 'auto': {
      if (!id) return { kind: 'none', reason: 'Aucune entité' };
      if (domain === 'camera') return { kind: 'camera', id };
      const p = defaultPress(state, id);
      return p.kind === 'service' ? p : { kind: 'none', reason: 'Affichage seul' };
    }
    case 'toggle':
      if (!id) return { kind: 'none', reason: 'Aucune entité' };
      if (['scene', 'script', 'button', 'input_button', 'automation'].includes(domain)) return defaultPress(state, id) as PressPlan;
      if (domain === 'lock') return { kind: 'service', domain, service: isOnState(state) ? 'lock' : 'unlock', target };
      return { kind: 'service', domain: 'homeassistant', service: 'toggle', target };
    case 'on':
    case 'off': {
      const on = mode === 'on';
      if (domain === 'cover') return { kind: 'service', domain, service: on ? 'open_cover' : 'close_cover', target };
      if (domain === 'valve') return { kind: 'service', domain, service: on ? 'open_valve' : 'close_valve', target };
      if (domain === 'lock') return { kind: 'service', domain, service: on ? 'unlock' : 'lock', target };
      if (domain === 'vacuum') return { kind: 'service', domain, service: on ? 'start' : 'return_to_base', target };
      return { kind: 'service', domain: 'homeassistant', service: on ? 'turn_on' : 'turn_off', target };
    }
    case 'preset':
      return presetPlan(s, domain, target);
    case 'cycle': {
      const items = cycleItems(s.cycle);
      if (!items.length) return { kind: 'none', reason: 'Liste vide' };
      if (domain === 'light') {
        const cur = state?.state === 'on' && finite(attrs.brightness) ? Math.round((attrs.brightness as number) / 2.55) : 0;
        const next = Number(nextCycle(items, cur));
        return next <= 0
          ? { kind: 'service', domain: 'light', service: 'turn_off', target }
          : { kind: 'service', domain: 'light', service: 'turn_on', data: { brightness_pct: next }, target };
      }
      if (domain === 'cover') return { kind: 'service', domain, service: 'set_cover_position', data: { position: Number(nextCycle(items, attrs.current_position as number)) }, target };
      if (domain === 'fan') return { kind: 'service', domain, service: 'set_percentage', data: { percentage: Number(nextCycle(items, attrs.percentage as number)) }, target };
      if (domain === 'climate') return { kind: 'service', domain, service: 'set_temperature', data: { temperature: Number(nextCycle(items, attrs.temperature as number)?.replace(',', '.')) }, target };
      if (domain === 'input_select' || domain === 'select') return { kind: 'service', domain, service: 'select_option', data: { option: nextCycle(items, state?.state) }, target };
      if (domain === 'input_number' || domain === 'number') return { kind: 'service', domain, service: 'set_value', data: { value: Number(nextCycle(items, state?.state)?.replace(',', '.')) }, target };
      if (domain === 'media_player') return { kind: 'service', domain, service: 'select_source', data: { source: nextCycle(items, attrs.source as string) }, target };
      return { kind: 'none', reason: 'Cycle non géré pour ce type' };
    }
    case 'adjust': {
      const step = finite(s.step) && s.step !== 0 ? s.step : 10;
      if (domain === 'light') return { kind: 'service', domain, service: 'turn_on', data: { brightness_step_pct: step }, target };
      if (domain === 'climate') {
        const cur = finite(attrs.temperature) ? (attrs.temperature as number) : 20;
        return { kind: 'service', domain, service: 'set_temperature', data: { temperature: Math.round((cur + step) * 10) / 10 }, target };
      }
      if (domain === 'cover') {
        const cur = finite(attrs.current_position) ? (attrs.current_position as number) : 0;
        return { kind: 'service', domain, service: 'set_cover_position', data: { position: Math.max(0, Math.min(100, cur + step)) }, target };
      }
      if (domain === 'fan') return { kind: 'service', domain, service: step > 0 ? 'increase_speed' : 'decrease_speed', data: { percentage_step: Math.abs(step) }, target };
      if (domain === 'media_player') {
        const cur = finite(attrs.volume_level) ? (attrs.volume_level as number) : 0.3;
        return { kind: 'service', domain, service: 'volume_set', data: { volume_level: Math.max(0, Math.min(1, Math.round((cur + step / 100) * 100) / 100)) }, target };
      }
      if (domain === 'input_number' || domain === 'number') {
        const cur = Number(state?.state);
        const max = finite(attrs.max) ? (attrs.max as number) : Infinity;
        const min = finite(attrs.min) ? (attrs.min as number) : -Infinity;
        return { kind: 'service', domain, service: 'set_value', data: { value: Math.max(min, Math.min(max, (Number.isFinite(cur) ? cur : 0) + step)) }, target };
      }
      return { kind: 'none', reason: 'Réglage non géré pour ce type' };
    }
    case 'media': {
      const map: Record<string, string> = { play_pause: 'media_play_pause', next: 'media_next_track', previous: 'media_previous_track', volume_up: 'volume_up', volume_down: 'volume_down', stop: 'media_stop' };
      if (s.media === 'mute') return { kind: 'service', domain: 'media_player', service: 'volume_mute', data: { is_volume_muted: !attrs.is_volume_muted }, target };
      return { kind: 'service', domain: 'media_player', service: map[s.media ?? 'play_pause'] ?? 'media_play_pause', target };
    }
    case 'service': {
      const m = /^([a-z0-9_]+)\.([a-z0-9_]+)$/.exec((s.service ?? '').trim());
      if (!m) return { kind: 'none', reason: 'Service à choisir' };
      const data = parseServiceData(s.data ?? '');
      // une cible écrite dans les données prime
      const own: Record<string, unknown> = {};
      for (const k of ['entity_id', 'device_id', 'area_id', 'floor_id', 'label_id']) {
        if (k in data) {
          own[k] = data[k];
          delete data[k];
        }
      }
      const t = Object.keys(own).length ? own : s.targetSelf !== false && id ? target : undefined;
      return { kind: 'service', domain: m[1], service: m[2], data, target: t };
    }
    case 'event':
      if (!s.eventType?.trim()) return { kind: 'none', reason: 'Événement à nommer' };
      return { kind: 'event', type: s.eventType.trim(), data: parseServiceData(s.eventData ?? '') };
    case 'camera':
      return id ? { kind: 'camera', id } : { kind: 'none', reason: 'Aucune caméra' };
    default:
      return { kind: 'none' };
  }
}

function presetPlan(s: HaKeySettings, domain: string, target: Record<string, unknown> | undefined): PressPlan {
  const p = s.preset ?? {};
  switch (domain) {
    case 'light': {
      const data: Record<string, unknown> = {};
      if (finite(p.brightness)) data.brightness_pct = p.brightness;
      const rgb = p.color ? hexToRgb(p.color) : null;
      if (rgb) data.rgb_color = rgb;
      else if (finite(p.kelvin)) data.color_temp_kelvin = p.kelvin;
      if (data.brightness_pct === 0) return { kind: 'service', domain, service: 'turn_off', target };
      return { kind: 'service', domain, service: 'turn_on', data, target };
    }
    case 'cover':
      return { kind: 'service', domain, service: 'set_cover_position', data: { position: finite(p.position) ? p.position : 50 }, target };
    case 'climate': {
      if (p.hvac) return { kind: 'service', domain, service: 'set_hvac_mode', data: { hvac_mode: p.hvac }, target };
      return { kind: 'service', domain, service: 'set_temperature', data: { temperature: finite(p.temperature) ? p.temperature : 20 }, target };
    }
    case 'fan':
      return { kind: 'service', domain, service: 'set_percentage', data: { percentage: finite(p.percentage) ? p.percentage : 50 }, target };
    case 'media_player':
      return { kind: 'service', domain, service: 'volume_set', data: { volume_level: finite(p.volume) ? p.volume / 100 : 0.3 }, target };
    case 'input_select':
    case 'select':
      return p.option ? { kind: 'service', domain, service: 'select_option', data: { option: p.option }, target } : { kind: 'none', reason: 'Option à choisir' };
    case 'input_number':
    case 'number':
      return { kind: 'service', domain, service: 'set_value', data: { value: finite(p.value) ? p.value : 0 }, target };
    default:
      return { kind: 'none', reason: 'Préréglage non géré pour ce type' };
  }
}

/** La touche montre-t-elle une valeur par défaut ? (capteurs, thermostat…) */
export function showsValueByDefault(entity: string, mode: HaMode | undefined): boolean {
  const d = haDomainOf(entity);
  if (mode === 'display' || mode === 'template') return true;
  return ['sensor', 'climate', 'input_number', 'number', 'weather', 'input_select', 'select', 'input_text', 'text'].includes(d);
}

/** Jauge par défaut. */
export function gaugeByDefault(entity: string): boolean {
  return ['light', 'cover', 'media_player', 'fan'].includes(haDomainOf(entity));
}
