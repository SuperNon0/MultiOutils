/**
 * Modèle Home Assistant partagé (app + plugin Stream Deck) : catalogue des
 * entités lisible (nom, pièce, étage), icône par défaut, état « allumé »,
 * valeur affichée, action par défaut d'un appui, services et leurs champs,
 * règles d'affichage. Fonctions pures, testées par vitest.
 */
import type { HaRawState } from './socket';

/* ───────── catalogue ───────── */

export interface HaArea {
  id: string;
  name: string;
  floor?: string;
}
export interface HaFloor {
  id: string;
  name: string;
  level?: number;
}

/** Entité telle que la voit le panneau de réglages d'une touche. */
export interface HaEntityInfo {
  id: string;
  name: string;
  domain: string;
  state: string;
  area?: string;
  areaName?: string;
  floorName?: string;
  icon?: string;
  unit?: string;
  deviceClass?: string;
}

export interface HaCatalog {
  entities: HaEntityInfo[];
  areas: HaArea[];
  floors: HaFloor[];
}

interface RegEntity {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  name?: string | null;
  original_name?: string | null;
  icon?: string | null;
  hidden_by?: string | null;
  disabled_by?: string | null;
}
interface RegDevice {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

export const haDomainOf = (entityId: string): string => entityId.split('.')[0] ?? '';

/** Construit le catalogue à partir des états et des registres (optionnels). */
export function buildCatalog(
  states: HaRawState[],
  reg: { entities?: RegEntity[]; devices?: RegDevice[]; areas?: Array<{ area_id: string; name: string; floor_id?: string | null }>; floors?: Array<{ floor_id: string; name: string; level?: number | null }> } = {}
): HaCatalog {
  const floors: HaFloor[] = (reg.floors ?? []).map((f) => ({ id: f.floor_id, name: f.name, level: f.level ?? undefined }));
  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  const areas: HaArea[] = (reg.areas ?? []).map((a) => ({ id: a.area_id, name: a.name, floor: a.floor_id ?? undefined }));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const devById = new Map((reg.devices ?? []).map((d) => [d.id, d]));
  const entReg = new Map((reg.entities ?? []).map((e) => [e.entity_id, e]));

  const entities: HaEntityInfo[] = [];
  for (const s of states) {
    const r = entReg.get(s.entity_id);
    if (r?.disabled_by) continue;
    const attrs = s.attributes ?? {};
    const areaId = r?.area_id ?? (r?.device_id ? devById.get(r.device_id)?.area_id : undefined) ?? undefined;
    const area = areaId ? areaById.get(areaId) : undefined;
    const name =
      (typeof attrs.friendly_name === 'string' && attrs.friendly_name) ||
      r?.name ||
      r?.original_name ||
      s.entity_id.split('.')[1]?.replace(/_/g, ' ') ||
      s.entity_id;
    entities.push({
      id: s.entity_id,
      name,
      domain: haDomainOf(s.entity_id),
      state: s.state,
      area: area?.id,
      areaName: area?.name,
      floorName: area?.floor ? floorName.get(area.floor) : undefined,
      icon: (typeof attrs.icon === 'string' && attrs.icon) || r?.icon || undefined,
      unit: typeof attrs.unit_of_measurement === 'string' ? attrs.unit_of_measurement : undefined,
      deviceClass: typeof attrs.device_class === 'string' ? attrs.device_class : undefined
    });
  }
  entities.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { entities, areas: areas.sort((a, b) => a.name.localeCompare(b.name, 'fr')), floors };
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Recherche « salon lampe » dans nom, id, pièce et étage. */
export function searchEntities(
  list: HaEntityInfo[],
  query: string,
  filter: { area?: string; floor?: string; domain?: string } = {},
  limit = 60
): HaEntityInfo[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const out: Array<{ e: HaEntityInfo; score: number }> = [];
  for (const e of list) {
    if (filter.area && e.area !== filter.area) continue;
    if (filter.floor && e.floorName !== filter.floor) continue;
    if (filter.domain && e.domain !== filter.domain) continue;
    const hay = norm(`${e.name} ${e.id} ${e.areaName ?? ''} ${e.floorName ?? ''}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const n = norm(e.name);
    const score = words.length === 0 ? 0 : (n.startsWith(words[0]) ? 0 : 1) + (n.includes(words.join(' ')) ? 0 : 1);
    out.push({ e, score });
  }
  out.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name, 'fr'));
  return out.slice(0, limit).map((x) => x.e);
}

/* ───────── états ───────── */

const ON_STATES = new Set([
  'on',
  'open',
  'opening',
  'playing',
  'unlocked',
  'unlocking',
  'cleaning',
  'heat',
  'cool',
  'auto',
  'heat_cool',
  'dry',
  'fan_only',
  'home',
  'armed_home',
  'armed_away',
  'armed_night',
  'armed_vacation',
  'armed_custom_bypass',
  'triggered',
  'active',
  'detected'
]);

export const isUnavailable = (s: HaRawState | undefined): boolean => !s || s.state === 'unavailable' || s.state === 'unknown';

export function isOnState(s: HaRawState | undefined): boolean {
  if (!s) return false;
  const d = haDomainOf(s.entity_id);
  if (d === 'cover') return s.state === 'open' || s.state === 'opening';
  if (d === 'lock') return s.state === 'unlocked' || s.state === 'unlocking' || s.state === 'open';
  if (d === 'media_player') return s.state === 'playing';
  if (d === 'climate') return s.state !== 'off' && !isUnavailable(s);
  if (d === 'alarm_control_panel') return s.state !== 'disarmed' && !isUnavailable(s);
  return ON_STATES.has(s.state);
}

/** Domaines qui se « lancent » (pas d'état allumé / éteint). */
export const ONE_SHOT_DOMAINS = new Set(['scene', 'script', 'button', 'input_button']);
/** Domaines qu'on bascule d'un appui. */
export const TOGGLE_DOMAINS = new Set([
  'light',
  'switch',
  'fan',
  'input_boolean',
  'automation',
  'cover',
  'lock',
  'media_player',
  'climate',
  'humidifier',
  'siren',
  'vacuum',
  'remote',
  'water_heater',
  'valve',
  'group'
]);
/** Domaines purement affichés par défaut. */
export const DISPLAY_DOMAINS = new Set(['sensor', 'binary_sensor', 'weather', 'sun', 'person', 'device_tracker', 'zone', 'calendar', 'event', 'update', 'number', 'input_number', 'input_text', 'text', 'date', 'datetime', 'time']);

export type HaPress =
  | { kind: 'service'; domain: string; service: string; data?: Record<string, unknown>; target?: Record<string, unknown> }
  | { kind: 'none' };

/** Service appelé par un appui « automatique » sur une entité. */
export function defaultPress(s: HaRawState | undefined, entityId: string): HaPress {
  const d = haDomainOf(entityId);
  const target = { entity_id: entityId };
  const on = isOnState(s);
  switch (d) {
    case 'scene':
    case 'script':
      return { kind: 'service', domain: d, service: 'turn_on', target };
    case 'button':
    case 'input_button':
      return { kind: 'service', domain: d, service: 'press', target };
    case 'automation':
      return { kind: 'service', domain: d, service: 'trigger', target };
    case 'cover':
      return { kind: 'service', domain: 'cover', service: 'toggle', target };
    case 'valve':
      return { kind: 'service', domain: 'valve', service: 'toggle', target };
    case 'lock':
      return { kind: 'service', domain: 'lock', service: on ? 'lock' : 'unlock', target };
    case 'media_player':
      return { kind: 'service', domain: 'media_player', service: 'media_play_pause', target };
    case 'vacuum':
      return { kind: 'service', domain: 'vacuum', service: s?.state === 'cleaning' ? 'return_to_base' : 'start', target };
    case 'input_select':
    case 'select':
      return { kind: 'service', domain: d, service: 'select_next', data: { cycle: true }, target };
    case 'alarm_control_panel':
      return { kind: 'none' };
    default:
      return TOGGLE_DOMAINS.has(d) ? { kind: 'service', domain: 'homeassistant', service: 'toggle', target } : { kind: 'none' };
  }
}

/** Formate la valeur d'un état : « 21,5 °C », « 340 W », « Allumé »… */
export function formatState(s: HaRawState | undefined, decimals?: number | null, lang = 'fr'): string {
  if (!s) return '—';
  if (s.state === 'unavailable') return 'Indisponible';
  if (s.state === 'unknown') return '?';
  const unit = typeof s.attributes?.unit_of_measurement === 'string' ? (s.attributes.unit_of_measurement as string) : '';
  const num = Number(s.state);
  if (s.state.trim() !== '' && Number.isFinite(num)) {
    const fmt = new Intl.NumberFormat(lang, decimals == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const v = fmt.format(num);
    if (!unit) return v;
    return unit === '%' ? `${v} %` : `${v} ${unit}`;
  }
  const d = haDomainOf(s.entity_id);
  if (d === 'climate') {
    const cur = s.attributes?.current_temperature;
    if (typeof cur === 'number') return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(cur)} °`;
  }
  if (d === 'binary_sensor' && (s.state === 'on' || s.state === 'off')) {
    const pair = BINARY_FR[String(s.attributes?.device_class ?? '')];
    if (pair) return s.state === 'on' ? pair[0] : pair[1];
  }
  return STATE_FR[s.state] ?? s.state;
}

/** Capteurs binaires : « actif / inactif » selon leur type (comme Home Assistant). */
const BINARY_FR: Record<string, [string, string]> = {
  door: ['Ouvert', 'Fermé'],
  window: ['Ouvert', 'Fermé'],
  opening: ['Ouvert', 'Fermé'],
  garage_door: ['Ouvert', 'Fermé'],
  lock: ['Déverrouillé', 'Verrouillé'],
  motion: ['Mouvement', 'Calme'],
  occupancy: ['Occupé', 'Libre'],
  presence: ['Présent', 'Absent'],
  moisture: ['Humide', 'Sec'],
  smoke: ['Fumée', 'OK'],
  gas: ['Gaz', 'OK'],
  carbon_monoxide: ['CO', 'OK'],
  plug: ['Branché', 'Débranché'],
  power: ['Alimenté', 'Coupé'],
  connectivity: ['Connecté', 'Déconnecté'],
  battery: ['Faible', 'Normale'],
  battery_charging: ['En charge', 'Pas en charge'],
  problem: ['Problème', 'OK'],
  vibration: ['Vibration', 'Calme'],
  sound: ['Son', 'Calme']
};

const STATE_FR: Record<string, string> = {
  on: 'Allumé',
  off: 'Éteint',
  open: 'Ouvert',
  closed: 'Fermé',
  opening: 'Ouverture',
  closing: 'Fermeture',
  locked: 'Verrouillé',
  unlocked: 'Ouvert',
  playing: 'Lecture',
  paused: 'Pause',
  idle: 'Inactif',
  standby: 'Veille',
  home: 'Maison',
  not_home: 'Absent',
  heat: 'Chauffe',
  cool: 'Clim',
  auto: 'Auto',
  cleaning: 'Nettoie',
  docked: 'Base',
  returning: 'Retour',
  disarmed: 'Désarmée',
  armed_home: 'Armée',
  armed_away: 'Armée',
  armed_night: 'Nuit',
  triggered: 'Alarme',
  above_horizon: 'Jour',
  below_horizon: 'Nuit',
  sunny: 'Soleil',
  cloudy: 'Nuageux',
  partlycloudy: 'Éclaircies',
  rainy: 'Pluie',
  pouring: 'Averses',
  snowy: 'Neige',
  fog: 'Brouillard',
  'clear-night': 'Nuit claire',
  windy: 'Vent',
  lightning: 'Orage'
};

/** Valeur en pourcentage pour la jauge (luminosité, position, batterie…). */
export function gaugePercent(s: HaRawState | undefined, range?: { min?: number; max?: number }): number | null {
  if (!s || isUnavailable(s)) return null;
  const a = s.attributes ?? {};
  const d = haDomainOf(s.entity_id);
  if (d === 'light') return s.state === 'on' && typeof a.brightness === 'number' ? Math.round((a.brightness as number) / 2.55) : s.state === 'on' ? 100 : 0;
  if (d === 'cover' && typeof a.current_position === 'number') return a.current_position as number;
  if (d === 'media_player' && typeof a.volume_level === 'number') return Math.round((a.volume_level as number) * 100);
  if (d === 'fan' && typeof a.percentage === 'number') return a.percentage as number;
  const n = Number(s.state);
  if (!Number.isFinite(n)) return null;
  const min = range?.min ?? (typeof a.min === 'number' ? (a.min as number) : 0);
  const max = range?.max ?? (typeof a.max === 'number' ? (a.max as number) : a.unit_of_measurement === '%' ? 100 : NaN);
  if (!Number.isFinite(max) || max === min) return null;
  return Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
}

/** Couleur réelle d'une lumière allumée (#rrggbb), si connue. */
export function lightColor(s: HaRawState | undefined): string | null {
  if (!s || haDomainOf(s.entity_id) !== 'light' || s.state !== 'on') return null;
  const rgb = s.attributes?.rgb_color;
  if (Array.isArray(rgb) && rgb.length >= 3 && rgb.every((x) => typeof x === 'number')) {
    return '#' + (rgb as number[]).slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  }
  const k = s.attributes?.color_temp_kelvin;
  if (typeof k === 'number') return kelvinToHex(k);
  return null;
}

/** Approximation de la couleur d'un blanc (2000 K à 6500 K). */
export function kelvinToHex(k: number): string {
  const t = Math.max(1000, Math.min(40000, k)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (x: number): string => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/* ───────── icônes par défaut (noms Material Design Icons) ───────── */

const DOMAIN_ICONS: Record<string, [string, string?]> = {
  light: ['mdi:lightbulb', 'mdi:lightbulb-outline'],
  switch: ['mdi:toggle-switch-variant', 'mdi:toggle-switch-variant-off'],
  input_boolean: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'],
  fan: ['mdi:fan', 'mdi:fan-off'],
  cover: ['mdi:window-shutter-open', 'mdi:window-shutter'],
  lock: ['mdi:lock-open-variant', 'mdi:lock'],
  media_player: ['mdi:play-circle', 'mdi:speaker'],
  climate: ['mdi:thermostat', 'mdi:thermostat'],
  scene: ['mdi:palette'],
  script: ['mdi:script-text-play'],
  automation: ['mdi:robot', 'mdi:robot-off'],
  button: ['mdi:gesture-tap-button'],
  input_button: ['mdi:gesture-tap-button'],
  input_select: ['mdi:format-list-bulleted'],
  select: ['mdi:format-list-bulleted'],
  input_number: ['mdi:ray-vertex'],
  number: ['mdi:ray-vertex'],
  vacuum: ['mdi:robot-vacuum'],
  camera: ['mdi:cctv'],
  person: ['mdi:account', 'mdi:account-outline'],
  device_tracker: ['mdi:account', 'mdi:account-outline'],
  sun: ['mdi:white-balance-sunny', 'mdi:weather-night'],
  weather: ['mdi:weather-partly-cloudy'],
  alarm_control_panel: ['mdi:shield-lock', 'mdi:shield-off'],
  siren: ['mdi:bullhorn', 'mdi:bullhorn-outline'],
  humidifier: ['mdi:air-humidifier', 'mdi:air-humidifier-off'],
  water_heater: ['mdi:water-boiler', 'mdi:water-boiler-off'],
  remote: ['mdi:remote', 'mdi:remote-off'],
  valve: ['mdi:valve-open', 'mdi:valve-closed'],
  update: ['mdi:package-up', 'mdi:package'],
  calendar: ['mdi:calendar'],
  sensor: ['mdi:eye'],
  binary_sensor: ['mdi:checkbox-marked-circle', 'mdi:checkbox-blank-circle-outline'],
  zone: ['mdi:map-marker-radius'],
  group: ['mdi:google-circles-communities']
};

const SENSOR_ICONS: Record<string, string> = {
  temperature: 'mdi:thermometer',
  humidity: 'mdi:water-percent',
  power: 'mdi:flash',
  energy: 'mdi:lightning-bolt',
  battery: 'mdi:battery',
  illuminance: 'mdi:brightness-5',
  pressure: 'mdi:gauge',
  voltage: 'mdi:sine-wave',
  current: 'mdi:current-ac',
  carbon_dioxide: 'mdi:molecule-co2',
  pm25: 'mdi:blur',
  signal_strength: 'mdi:wifi',
  timestamp: 'mdi:clock-outline',
  monetary: 'mdi:cash',
  gas: 'mdi:meter-gas',
  water: 'mdi:water',
  speed: 'mdi:speedometer',
  distance: 'mdi:arrow-left-right',
  duration: 'mdi:timer-outline'
};

const BINARY_ICONS: Record<string, [string, string]> = {
  door: ['mdi:door-open', 'mdi:door-closed'],
  garage_door: ['mdi:garage-open', 'mdi:garage'],
  window: ['mdi:window-open', 'mdi:window-closed'],
  motion: ['mdi:motion-sensor', 'mdi:motion-sensor-off'],
  occupancy: ['mdi:home-account', 'mdi:home-outline'],
  presence: ['mdi:home', 'mdi:home-outline'],
  moisture: ['mdi:water-alert', 'mdi:water-off'],
  smoke: ['mdi:smoke-detector-alert', 'mdi:smoke-detector'],
  plug: ['mdi:power-plug', 'mdi:power-plug-off'],
  connectivity: ['mdi:check-network', 'mdi:close-network'],
  battery: ['mdi:battery-alert', 'mdi:battery'],
  lock: ['mdi:lock-open-variant', 'mdi:lock'],
  light: ['mdi:brightness-7', 'mdi:brightness-5'],
  sound: ['mdi:music-note', 'mdi:music-note-off'],
  vibration: ['mdi:vibrate', 'mdi:crop-portrait']
};

const COVER_ICONS: Record<string, [string, string]> = {
  garage: ['mdi:garage-open', 'mdi:garage'],
  door: ['mdi:door-open', 'mdi:door-closed'],
  gate: ['mdi:gate-open', 'mdi:gate'],
  blind: ['mdi:blinds-open', 'mdi:blinds'],
  curtain: ['mdi:curtains', 'mdi:curtains-closed'],
  window: ['mdi:window-open', 'mdi:window-closed'],
  awning: ['mdi:awning-outline', 'mdi:awning-outline']
};

/** Icône à afficher : celle de l'entité dans HA, sinon celle de son type. */
export function defaultIcon(s: HaRawState | undefined, entityId: string, on?: boolean): string {
  const own = s?.attributes?.icon;
  if (typeof own === 'string' && own.includes(':')) return own;
  const d = haDomainOf(entityId);
  const dc = typeof s?.attributes?.device_class === 'string' ? (s.attributes.device_class as string) : '';
  const isOn = on ?? isOnState(s);
  if (d === 'sensor' && SENSOR_ICONS[dc]) return SENSOR_ICONS[dc];
  if (d === 'binary_sensor' && BINARY_ICONS[dc]) return BINARY_ICONS[dc][isOn ? 0 : 1];
  if (d === 'cover' && COVER_ICONS[dc]) return COVER_ICONS[dc][isOn ? 0 : 1];
  const pair = DOMAIN_ICONS[d];
  if (!pair) return 'mdi:home-assistant';
  return isOn || !pair[1] ? pair[0] : pair[1];
}

/** « mdi:lightbulb-outline » → « mdiLightbulbOutline » (nom d'export @mdi/js). */
export function mdiExportName(icon: string): string | null {
  const m = /^mdi:([a-z0-9-]+)$/.exec(icon.trim());
  if (!m) return null;
  return 'mdi' + m[1].split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/* ───────── services ───────── */

export interface HaServiceField {
  key: string;
  name: string;
  description?: string;
  required?: boolean;
  example?: unknown;
  /** Type d'éditeur dans le panneau de réglages. */
  kind: 'number' | 'boolean' | 'select' | 'color' | 'text' | 'entity' | 'object' | 'kelvin' | 'time';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ value: string; label: string }>;
  advanced?: boolean;
}

export interface HaServiceInfo {
  domain: string;
  service: string;
  name: string;
  description?: string;
  /** Le service vise des entités (target). */
  target: boolean;
  /** Domaines d'entités acceptés comme cible (vide = tous). */
  targetDomains: string[];
  fields: HaServiceField[];
}

/** Normalise la réponse de get_services en une liste triée. */
export function normalizeServices(raw: unknown): HaServiceInfo[] {
  const out: HaServiceInfo[] = [];
  if (!raw || typeof raw !== 'object') return out;
  for (const [domain, services] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!services || typeof services !== 'object') continue;
    for (const [service, def] of Object.entries(services)) {
      const d = (def ?? {}) as { name?: string; description?: string; target?: { entity?: Array<{ domain?: string[] | string }> | { domain?: string[] | string } }; fields?: Record<string, unknown> };
      const ent = d.target?.entity;
      const entList = Array.isArray(ent) ? ent : ent ? [ent] : [];
      const targetDomains = entList.flatMap((e) => (Array.isArray(e.domain) ? e.domain : e.domain ? [e.domain] : []));
      out.push({
        domain,
        service,
        name: d.name || service.replace(/_/g, ' '),
        description: d.description,
        target: !!d.target,
        targetDomains,
        fields: normalizeFields(d.fields ?? {})
      });
    }
  }
  return out.sort((a, b) => `${a.domain}.${a.service}`.localeCompare(`${b.domain}.${b.service}`));
}

function normalizeFields(fields: Record<string, unknown>, advanced = false): HaServiceField[] {
  const out: HaServiceField[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    const f = (raw ?? {}) as { name?: string; description?: string; required?: boolean; example?: unknown; selector?: Record<string, Record<string, unknown> | null>; fields?: Record<string, unknown>; collapsed?: boolean; advanced?: boolean };
    // sections repliables (« advanced_fields ») : on aplatit
    if (f.fields && !f.selector) {
      out.push(...normalizeFields(f.fields, advanced || !!f.collapsed));
      continue;
    }
    const sel = f.selector ?? {};
    const kind = Object.keys(sel)[0] ?? 'text';
    const cfg = (sel[kind] ?? {}) as Record<string, unknown>;
    const base = { key, name: f.name || key.replace(/_/g, ' '), description: f.description, required: !!f.required, example: f.example, advanced: advanced || !!f.advanced };
    if (kind === 'number') {
      out.push({ ...base, kind: 'number', min: num(cfg.min), max: num(cfg.max), step: typeof cfg.step === 'number' ? cfg.step : undefined, unit: typeof cfg.unit_of_measurement === 'string' ? cfg.unit_of_measurement : undefined });
    } else if (kind === 'boolean' || kind === 'constant') {
      out.push({ ...base, kind: 'boolean' });
    } else if (kind === 'select') {
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      out.push({
        ...base,
        kind: 'select',
        options: opts.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String((o as { value: unknown }).value), label: String((o as { label?: unknown }).label ?? (o as { value: unknown }).value) }))
      });
    } else if (kind === 'color_rgb') {
      out.push({ ...base, kind: 'color' });
    } else if (kind === 'color_temp') {
      out.push({ ...base, kind: 'kelvin', min: num(cfg.min) ?? num(cfg.min_mireds) ?? 2000, max: num(cfg.max) ?? 6500, unit: 'K' });
    } else if (kind === 'entity') {
      out.push({ ...base, kind: 'entity' });
    } else if (kind === 'time' || kind === 'duration') {
      out.push({ ...base, kind: 'time' });
    } else if (kind === 'text' || kind === 'icon' || kind === 'template') {
      out.push({ ...base, kind: 'text' });
    } else {
      out.push({ ...base, kind: 'object' });
    }
  }
  return out;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/* ───────── données de service saisies à la main ───────── */

/**
 * Lit les données d'un service écrites en JSON ou en YAML simple
 * (« brightness_pct: 40 » une clé par ligne, listes [1, 2, 3]).
 */
export function parseServiceData(text: string): Record<string, unknown> {
  const t = text.trim();
  if (!t) return {};
  if (t.startsWith('{')) {
    const v = JSON.parse(t) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Il faut un objet { … }');
    return v as Record<string, unknown>;
  }
  const out: Record<string, unknown> = {};
  for (const line of t.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(line);
    if (!m) throw new Error(`Ligne non comprise : « ${line.trim()} »`);
    out[m[1]] = yamlScalar(m[2]);
  }
  return out;
}

function yamlScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === '') return null;
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') || v.startsWith('{')) {
    try {
      return JSON.parse(v);
    } catch {
      if (v.startsWith('[') && v.endsWith(']'))
        return v
          .slice(1, -1)
          .split(',')
          .map((x) => yamlScalar(x));
    }
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}
