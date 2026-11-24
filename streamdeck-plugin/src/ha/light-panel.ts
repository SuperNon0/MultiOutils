/**
 * Panneau lumière : un appui long sur une touche « HA : Lumière » ouvre un
 * profil Stream Deck fourni avec le plugin, réglé sur la lampe de la touche.
 *
 *   ┌────────┬────────┬────────┬────────┬────────┐
 *   │ Retour │ teinte │ teinte │ teinte │ teinte │
 *   ├────────┼────────┼────────┼────────┼────────┤
 *   │ Page   │ teinte │ teinte │ teinte │ teinte │
 *   ├────────┼────────┼────────┼────────┼────────┤
 *   │ lum. 1 │ lum. 2 │ lum. 3 │ lum. 4 │ lum. 5 │
 *   └────────┴────────┴────────┴────────┴────────┘
 *
 * Deux pages de 8 teintes (16 en tout). Une teinte est soit une couleur
 * (ampoule RVB), soit un blanc en kelvins (ampoule à nuances de blanc).
 * Fonctions pures (testées par vitest).
 */
import { kelvinToHex } from '../../../packages/shared/src/ha/model';
import type { HaRawState } from '../../../packages/shared/src/ha/socket';
import type { PressPlan } from './settings';

export const PANEL_PROFILE = 'profiles/multioutils-lumiere';
export const PANEL_ACTION = 'com.supernon0.multioutils.ha.light-panel';
export const LONG_PRESS_MS = 450;
export const SLOTS_PER_PAGE = 8;
export const PAGES = 2;
export const SLOT_COUNT = SLOTS_PER_PAGE * PAGES;
export const LEVEL_COUNT = 5;
export const DEFAULT_LEVELS = [10, 25, 50, 75, 100];

/** Teinte d'un emplacement : couleur (#rrggbb) ou blanc (kelvins). */
export interface PanelSlot {
  c?: string;
  k?: number;
}

/** Rôle d'une touche du profil (réglages posés dans le profil fourni). */
export type PanelRole = 'back' | 'page' | 'slot' | 'level';
export interface PanelKeySettings {
  [k: string]: unknown;
  role?: PanelRole;
  index?: number;
}

/** Ce que sait faire l'ampoule. */
export interface LightCaps {
  color: boolean;
  white: boolean;
  minK: number;
  maxK: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function lightCaps(st: HaRawState | undefined): LightCaps {
  const a = st?.attributes ?? {};
  const modes = Array.isArray(a.supported_color_modes) ? (a.supported_color_modes as string[]) : [];
  const minK = finite(a.min_color_temp_kelvin) ? Math.round(a.min_color_temp_kelvin as number) : 2200;
  const maxK = finite(a.max_color_temp_kelvin) ? Math.round(a.max_color_temp_kelvin as number) : 6500;
  return {
    color: modes.some((m) => COLOR_MODES.includes(m)),
    white: modes.includes('color_temp'),
    minK: Math.min(minK, maxK),
    maxK: Math.max(minK, maxK)
  };
}

/** Type d'ampoule, en mots. */
export function capsLabel(c: LightCaps): string {
  if (c.color && c.white) return 'couleurs et blancs';
  if (c.color) return 'couleurs';
  if (c.white) return 'nuances de blanc';
  return 'luminosité seule';
}

export const BASE_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#ff2d92'];
export const MORE_COLORS = ['#ff6f61', '#ffb340', '#c6f432', '#7ee8a2', '#64d2ff', '#a0c4ff', '#bf5af2', '#ff9ec7'];
export const BASE_WHITES = [2200, 2700, 3000, 3500, 4000, 4500, 5000, 6500];

/** Blancs répartis sur la plage de l'ampoule. */
export function spreadWhites(c: LightCaps, n: number): number[] {
  if (n <= 1) return [c.minK];
  return Array.from({ length: n }, (_, i) => Math.round((c.minK + ((c.maxK - c.minK) * i) / (n - 1)) / 50) * 50);
}

/** Teintes de départ selon l'ampoule. */
export function defaultSlots(c: LightCaps): PanelSlot[] {
  if (c.color && c.white) return [...BASE_COLORS.map((x) => ({ c: x })), ...BASE_WHITES.map((k) => ({ k: clampK(k, c) }))];
  if (c.color) return [...BASE_COLORS, ...MORE_COLORS].map((x) => ({ c: x }));
  if (c.white) return spreadWhites(c, SLOT_COUNT).map((k) => ({ k }));
  return [];
}

const clampK = (k: number, c: LightCaps): number => Math.max(c.minK, Math.min(c.maxK, Math.round(k)));

function cleanSlot(s: unknown): PanelSlot | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as PanelSlot;
  if (typeof o.c === 'string' && HEX.test(o.c)) return { c: o.c.toLowerCase() };
  if (finite(o.k) && o.k >= 1000 && o.k <= 12000) return { k: Math.round(o.k) };
  return null;
}

/** Teintes affichées : celles réglées sur la touche, sinon celles de départ. */
export function resolveSlots(custom: unknown, c: LightCaps): Array<PanelSlot | null> {
  const base = defaultSlots(c);
  const list = Array.isArray(custom) ? custom : [];
  return Array.from({ length: SLOT_COUNT }, (_, i) => (list.length ? cleanSlot(list[i]) : base[i] ?? null));
}

export function resolveLevels(custom: unknown): number[] {
  const list = Array.isArray(custom) ? custom : [];
  return DEFAULT_LEVELS.map((d, i) => {
    const v = list[i];
    return finite(v) ? Math.max(1, Math.min(100, Math.round(v))) : d;
  });
}

/** Blanc le plus proche d'une couleur (pour une ampoule sans couleurs). */
export function hexToKelvin(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const b = n & 255;
  // plus c'est bleu, plus c'est froid
  const warm = (r - b + 255) / 510;
  return Math.round((6500 - warm * 4300) / 50) * 50;
}

/** Couleur affichée sur la touche. */
export function slotHex(s: PanelSlot): string {
  return s.c ?? kelvinToHex(s.k ?? 4000);
}

/** Appel Home Assistant pour une teinte, adapté à l'ampoule. */
export function slotPlan(entity: string, s: PanelSlot | null, c: LightCaps): PressPlan {
  if (!entity) return { kind: 'none', reason: 'Aucune lampe' };
  if (!s) return { kind: 'none', reason: 'Emplacement vide' };
  const target = { entity_id: entity };
  if (s.c) {
    if (c.color || !c.white) return { kind: 'service', domain: 'light', service: 'turn_on', data: { rgb_color: hexRgb(s.c) }, target };
    return { kind: 'service', domain: 'light', service: 'turn_on', data: { color_temp_kelvin: clampK(hexToKelvin(s.c), c) }, target };
  }
  const k = s.k as number;
  // Home Assistant convertit un blanc en couleur pour une ampoule RVB sans blancs.
  return { kind: 'service', domain: 'light', service: 'turn_on', data: { color_temp_kelvin: c.white ? clampK(k, c) : k }, target };
}

export function levelPlan(entity: string, pct: number): PressPlan {
  if (!entity) return { kind: 'none', reason: 'Aucune lampe' };
  return { kind: 'service', domain: 'light', service: 'turn_on', data: { brightness_pct: pct }, target: { entity_id: entity } };
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luminosité actuelle en % (0 si éteinte). */
export function currentLevel(st: HaRawState | undefined): number {
  if (st?.state !== 'on') return 0;
  const b = st.attributes?.brightness;
  return finite(b) ? Math.round(b / 2.55) : 100;
}

/** La teinte correspond-elle à l'état actuel de la lampe ? */
export function slotActive(s: PanelSlot | null, st: HaRawState | undefined): boolean {
  if (!s || st?.state !== 'on') return false;
  const a = st.attributes ?? {};
  if (s.c && a.color_mode !== 'color_temp' && Array.isArray(a.rgb_color)) {
    const [r, g, b] = hexRgb(s.c);
    const [r2, g2, b2] = a.rgb_color as number[];
    return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) < 24;
  }
  if (s.k && a.color_mode === 'color_temp' && finite(a.color_temp_kelvin)) return Math.abs(s.k - (a.color_temp_kelvin as number)) <= 60;
  return false;
}

/* ───────── dessin des touches du panneau ───────── */

export interface PanelLook {
  dark: boolean;
  background: string;
  accent: string;
}

const esc = (s: string): string => s.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch] as string);
const fit = (t: string, max: number): string => (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t);
const lum = (hex: string): number => {
  const [r, g, b] = hexRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const FONT = 'font-family="Segoe UI, Arial, sans-serif"';
const wrap = (body: string, dim = false): string =>
  `data:image/svg+xml;charset=utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"${dim ? ' opacity="0.4"' : ''}>${body}</svg>`)}`;

function textOn(bg: string): string {
  return lum(bg) > 0.6 ? '#15161a' : '#ffffff';
}

/** Touche « teinte » : pastille pleine, coche si c'est la teinte actuelle. */
export function renderSlot(look: PanelLook, s: PanelSlot | null, active: boolean): string {
  const fg = look.dark ? '#f0ede6' : '#1b1d22';
  if (!s) {
    return wrap(`<rect width="144" height="144" rx="22" fill="${look.background}"/><rect x="34" y="34" width="76" height="76" rx="38" fill="none" stroke="${fg}" stroke-opacity=".25" stroke-width="3" stroke-dasharray="7 7"/>`);
  }
  const hex = slotHex(s);
  const ink = textOn(hex);
  const label = s.k ? `<text x="72" y="124" text-anchor="middle" ${FONT} font-size="21" font-weight="700" fill="${ink}" opacity=".85">${s.k} K</text>` : '';
  const ring = active ? `<rect x="5" y="5" width="134" height="134" rx="19" fill="none" stroke="${ink}" stroke-width="6"/>` : '';
  const check = active ? `<path d="M50 70l15 15 30-32" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  return wrap(`<rect width="144" height="144" rx="22" fill="${hex}"/>${ring}${check}${label}`);
}

/** Touche « luminosité » : barres et pourcentage, en surbrillance si c'est le niveau actuel. */
export function renderLevel(look: PanelLook, pct: number, index: number, active: boolean, lampHex: string | null): string {
  const color = lampHex ?? look.accent;
  const fg = look.dark ? '#f0ede6' : '#1b1d22';
  const bg = active ? color : look.background;
  const ink = active ? textOn(color) : fg;
  const bars = Array.from({ length: LEVEL_COUNT }, (_, i) => {
    const h = 10 + i * 9;
    const on = i <= index;
    return `<rect x="${31 + i * 17}" y="${74 - h}" width="12" height="${h}" rx="3" fill="${on ? (active ? ink : color) : ink}" opacity="${on ? 1 : 0.22}"/>`;
  }).join('');
  return wrap(`<rect width="144" height="144" rx="22" fill="${bg}"/>${bars}<text x="72" y="118" text-anchor="middle" ${FONT} font-size="32" font-weight="700" fill="${ink}">${pct} %</text>`);
}

/** Touche « Retour ». */
export function renderBack(look: PanelLook, name: string): string {
  const fg = look.dark ? '#f0ede6' : '#1b1d22';
  return wrap(
    `<rect width="144" height="144" rx="22" fill="${look.background}"/>` +
      `<path d="M62 34 38 56l24 22M40 56h44a22 22 0 0 1 0 44h-8" fill="none" stroke="${look.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<text x="72" y="130" text-anchor="middle" ${FONT} font-size="19" font-weight="600" fill="${fg}">${esc(fit(name || 'Retour', 13))}</text>`
  );
}

/** Touche « Page » : 1/2 ou 2/2, avec ce que contient la page suivante. */
export function renderPage(look: PanelLook, page: number, caps: LightCaps, lampHex: string | null, offline: boolean): string {
  const fg = look.dark ? '#f0ede6' : '#1b1d22';
  const dot = lampHex ? `<circle cx="72" cy="40" r="16" fill="${lampHex}"/>` : `<circle cx="72" cy="40" r="15" fill="none" stroke="${fg}" stroke-opacity=".35" stroke-width="3"/>`;
  const warn = offline ? `<circle cx="18" cy="18" r="8" fill="#efb36b" stroke="${look.background}" stroke-width="3"/>` : '';
  return wrap(
    `<rect width="144" height="144" rx="22" fill="${look.background}"/>${dot}` +
      `<text x="72" y="94" text-anchor="middle" ${FONT} font-size="30" font-weight="700" fill="${fg}">${page + 1} / ${PAGES}</text>` +
      `<text x="72" y="124" text-anchor="middle" ${FONT} font-size="17" fill="${fg}" opacity=".7">${esc(capsLabel(caps) === 'luminosité seule' ? 'Page' : 'Teintes')}</text>${warn}`
  );
}

/* ───────── profil fourni avec le plugin ───────── */

/** Touches du profil (colonne, ligne) → rôle. Stream Deck 15 touches. */
export function panelLayout(): Array<{ col: number; row: number; settings: PanelKeySettings }> {
  const keys: Array<{ col: number; row: number; settings: PanelKeySettings }> = [];
  keys.push({ col: 0, row: 0, settings: { role: 'back' } });
  keys.push({ col: 0, row: 1, settings: { role: 'page' } });
  for (let i = 0; i < SLOTS_PER_PAGE; i++) keys.push({ col: 1 + (i % 4), row: Math.floor(i / 4), settings: { role: 'slot', index: i } });
  for (let i = 0; i < LEVEL_COUNT; i++) keys.push({ col: i, row: 2, settings: { role: 'level', index: i } });
  return keys;
}

/** Contenu du manifest.json du profil (format reconnu par Stream Deck pour les profils de plugin). */
export function profileManifest(): Record<string, unknown> {
  const actions: Record<string, unknown> = {};
  for (const k of panelLayout()) {
    actions[`${k.col},${k.row}`] = {
      Name: 'Panneau lumière',
      Settings: k.settings,
      State: 0,
      States: [{ FFamily: '', FSize: '', FStyle: '', FUnderline: '', Image: '', Title: '', TitleAlignment: '', TitleColor: '', TitleShow: '' }],
      UUID: PANEL_ACTION
    };
  }
  return {
    Actions: actions,
    DeviceModel: '20GAA9902',
    InstalledByPluginUUID: 'com.supernon0.multioutils',
    Name: 'MultiOutils Lumière',
    PreconfiguredName: 'MultiOutils Lumière',
    Version: '1.0'
  };
}
