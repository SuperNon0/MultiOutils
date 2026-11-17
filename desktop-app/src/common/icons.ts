import { cleanIndicator, renderIndicator, type IconIndicator, type IndicatorState } from '@multioutils/shared';
export type { IconIndicator } from '@multioutils/shared';

/**
 * Atelier d'icônes (module « Icônes ») : modèle de données et dessin SVG.
 * Partagé par le main (bibliothèque, export, pack Stream Deck) et le
 * renderer (éditeur). Fonctions pures, testées par vitest.
 */

/* ───────── bibliothèques de symboles ───────── */

export type SymbolLib = 'phosphor' | 'tabler' | 'mdi' | 'pack';
export type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

export interface SymbolRef {
  lib: SymbolLib;
  /** Nom dans la bibliothèque (« house », « lightbulb », « mdi:lamp ») ou, pour un pack, chemin de l'icône. */
  name: string;
  /** Graisse (Phosphor) ou variante (Tabler : outline / filled). */
  weight?: string;
  /** Pack Stream Deck installé (dossier). */
  pack?: string;
}

/** Symbole prêt à dessiner. */
export interface SymbolArt {
  viewBox: string;
  /** Contenu SVG intérieur (sans la balise <svg>). */
  body: string;
  /** Rendu au trait (Tabler outline) ou plein. */
  paint: 'fill' | 'stroke';
  /** Image (pack PNG) en data URL, à la place de body. */
  image?: string;
}

/** Entrée du catalogue d'une bibliothèque. */
export interface SymbolEntry {
  name: string;
  /** Identifiant de catégorie (traduit côté renderer). */
  cat: string;
  tags: string[];
}

export interface SymbolCatalog {
  lib: SymbolLib;
  entries: SymbolEntry[];
  categories: Array<{ id: string; label: string; count: number }>;
}

/* ───────── icône ───────── */

export type IconShape = 'squircle' | 'round' | 'rounded' | 'square' | 'none';
export type IconShadow = 'none' | 'soft' | 'glow';
export type IconCorner = 'tr' | 'tl' | 'br' | 'bl';

export interface IconColors {
  fg: string;
  bg: string;
  /** Second ton du fond (dégradé), vide = uni. */
  bg2?: string;
}

export interface IconDesign extends IconColors {
  id: string;
  name: string;
  folder: string | null;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  symbol: SymbolRef | null;
  /** Image importée (data URL, déjà réduite). */
  image?: string;
  /** Image : garder ses couleurs (true) ou la recolorer en silhouette. */
  imageKeep?: boolean;
  shape: IconShape;
  gradientAngle: number;
  shadow: IconShadow;
  /** Taille du symbole (0,2 à 1). */
  scale: number;
  /** Décalage en % de la touche (−50 à 50). */
  dx: number;
  dy: number;
  rotate: number;
  /** Épaisseur du trait (Tabler). */
  strokeWidth: number;
  text?: { value: string; size: number; color?: string; position: 'top' | 'center' | 'bottom'; weight: number };
  indicator?: IconIndicator | null;
  badge?: { symbol: SymbolRef; fg: string; bg: string; corner: IconCorner } | null;
  /** Version « éteint » (paire d'états) : couleurs et symbole qui changent. */
  off?: (Partial<IconColors> & { symbol?: SymbolRef | null }) | null;
}

export interface IconFolder {
  id: string;
  name: string;
  color: string;
}

export interface IconTheme extends IconColors {
  id: string;
  name: string;
  group: string;
  builtin?: boolean;
}

/** Style enregistré : apparence sans les symboles, les images ni l’identité.
 * Les champs ajoutés restent facultatifs pour lire les anciens styles. */
export interface IconStyle {
  id: string;
  name: string;
  look: Pick<IconDesign, 'fg' | 'bg' | 'bg2' | 'shape' | 'gradientAngle' | 'shadow' | 'scale' | 'strokeWidth'> &
    Partial<Pick<IconDesign, 'dx' | 'dy' | 'rotate' | 'imageKeep' | 'indicator'> & {
      text: NonNullable<IconDesign['text']> | null;
      badge: Omit<NonNullable<IconDesign['badge']>, 'symbol'> | null;
      off: Partial<IconColors> | null;
    }>;
}

export interface IconLibraryState {
  designs: IconDesign[];
  folders: IconFolder[];
  themes: IconTheme[];
  styles: IconStyle[];
  /** Derniers symboles utilisés (lib:name). */
  recent: string[];
}

/** Pack d'icônes installé dans le logiciel Stream Deck. */
export interface StreamDeckPackInfo {
  id: string;
  name: string;
  author?: string;
  count: number;
}
export interface StreamDeckPackIcon {
  path: string;
  name: string;
  tags: string[];
}

/* ───────── thèmes prêts ───────── */

const T = (group: string, id: string, name: string, bg: string, fg: string, bg2?: string): IconTheme => ({ id: `${group}-${id}`, name, group, bg, fg, ...(bg2 ? { bg2 } : {}), builtin: true });

export const BUILTIN_THEMES: IconTheme[] = [
  // accents de MultiOutils (mêmes valeurs que le kit encre)
  T('multioutils', 'lavande', 'Lavande', '#a99bff', '#120d2e'),
  T('multioutils', 'or', 'Or', '#e8c547', '#1b1504'),
  T('multioutils', 'ambre', 'Ambre', '#f0a64a', '#1a1206'),
  T('multioutils', 'corail', 'Corail', '#ff7a59', '#2a0d05'),
  T('multioutils', 'menthe', 'Menthe', '#4fd1b5', '#05211b'),
  T('multioutils', 'encre', 'Encre', '#141b28', '#a99bff'),
  // couleurs système Apple (fond plein, symbole blanc)
  T('apple', 'rouge', 'Rouge', '#ff3b30', '#ffffff'),
  T('apple', 'orange', 'Orange', '#ff9500', '#ffffff'),
  T('apple', 'jaune', 'Jaune', '#ffcc00', '#ffffff'),
  T('apple', 'vert', 'Vert', '#34c759', '#ffffff'),
  T('apple', 'menthe', 'Menthe', '#00c7be', '#ffffff'),
  T('apple', 'sarcelle', 'Sarcelle', '#30b0c7', '#ffffff'),
  T('apple', 'cyan', 'Cyan', '#32ade6', '#ffffff'),
  T('apple', 'bleu', 'Bleu', '#007aff', '#ffffff'),
  T('apple', 'indigo', 'Indigo', '#5856d6', '#ffffff'),
  T('apple', 'violet', 'Violet', '#af52de', '#ffffff'),
  T('apple', 'rose', 'Rose', '#ff2d55', '#ffffff'),
  T('apple', 'brun', 'Brun', '#a2845e', '#ffffff'),
  T('apple', 'gris', 'Gris', '#8e8e93', '#ffffff'),
  // fond sombre, symbole coloré (comme les touches Home Assistant)
  T('sombre', 'jaune', 'Jaune', '#1c1c1e', '#ffd60a'),
  T('sombre', 'orange', 'Orange', '#1c1c1e', '#ff9f0a'),
  T('sombre', 'vert', 'Vert', '#1c1c1e', '#30d158'),
  T('sombre', 'bleu', 'Bleu', '#1c1c1e', '#0a84ff'),
  T('sombre', 'violet', 'Violet', '#1c1c1e', '#bf5af2'),
  T('sombre', 'rouge', 'Rouge', '#1c1c1e', '#ff453a'),
  T('sombre', 'blanc', 'Blanc', '#1c1c1e', '#f2f2f7'),
  // pastel
  T('pastel', 'peche', 'Pêche', '#f7c6a3', '#5a2e12'),
  T('pastel', 'ciel', 'Ciel', '#a8d8ea', '#123a4a'),
  T('pastel', 'lilas', 'Lilas', '#cdb4db', '#3b2147'),
  T('pastel', 'rose', 'Rose', '#ffafcc', '#561a31'),
  T('pastel', 'menthe', 'Menthe', '#b9fbc0', '#13401a'),
  // néon
  T('neon', 'jaune', 'Jaune', '#0b0b0f', '#faff00'),
  T('neon', 'cyan', 'Cyan', '#0b0b0f', '#00e5ff'),
  T('neon', 'magenta', 'Magenta', '#0b0b0f', '#ff00e5'),
  T('neon', 'vert', 'Vert', '#0b0b0f', '#39ff14'),
  // dégradés façon icônes d'apps
  T('degrade', 'aube', 'Aube', '#ff9a56', '#ffffff', '#ff4e7a'),
  T('degrade', 'ocean', 'Océan', '#36d1dc', '#ffffff', '#5b86e5'),
  T('degrade', 'foret', 'Forêt', '#56ab2f', '#ffffff', '#a8e063'),
  T('degrade', 'nuit', 'Nuit', '#2b1055', '#e0d7ff', '#7597de'),
  // monochrome
  T('mono', 'noir', 'Noir', '#000000', '#ffffff'),
  T('mono', 'blanc', 'Blanc', '#ffffff', '#1c1c1e'),
  T('mono', 'graphite', 'Graphite', '#3a3a3c', '#e5e5ea')
];

export const THEME_GROUPS: Array<{ id: string; label: string }> = [
  { id: 'multioutils', label: 'MultiOutils' },
  { id: 'apple', label: 'Couleurs Apple' },
  { id: 'sombre', label: 'Fond sombre' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'neon', label: 'Néon' },
  { id: 'degrade', label: 'Dégradés' },
  { id: 'mono', label: 'Monochrome' },
  { id: 'perso', label: 'Mes thèmes' }
];

/* ───────── valeurs par défaut et nettoyage ───────── */

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, fb: string): string => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fb);
const num = (v: unknown, min: number, max: number, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb);
const str = (v: unknown, max: number, fb = ''): string => (typeof v === 'string' ? v.slice(0, max) : fb);
const SHAPES: IconShape[] = ['squircle', 'round', 'rounded', 'square', 'none'];
const SHADOWS: IconShadow[] = ['none', 'soft', 'glow'];
const CORNERS: IconCorner[] = ['tr', 'tl', 'br', 'bl'];
const LIBS: SymbolLib[] = ['phosphor', 'tabler', 'mdi', 'pack'];

export const newIconId = (): string => `ic_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function defaultDesign(partial: Partial<IconDesign> = {}): IconDesign {
  const now = Date.now();
  return {
    id: newIconId(),
    name: 'Nouvelle icône',
    folder: null,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    symbol: { lib: 'phosphor', name: 'house', weight: 'fill' },
    fg: '#ffffff',
    bg: '#007aff',
    shape: 'squircle',
    gradientAngle: 135,
    shadow: 'none',
    scale: 0.56,
    dx: 0,
    dy: 0,
    rotate: 0,
    strokeWidth: 2,
    text: undefined,
    badge: null,
    off: null,
    ...partial
  };
}

export function sanitizeSymbol(v: unknown): SymbolRef | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const lib = LIBS.includes(r.lib as SymbolLib) ? (r.lib as SymbolLib) : null;
  const name = str(r.name, 300).trim();
  if (!lib || !name || name.includes('..')) return null;
  return { lib, name, ...(typeof r.weight === 'string' ? { weight: r.weight.slice(0, 20) } : {}), ...(typeof r.pack === 'string' ? { pack: r.pack.slice(0, 200) } : {}) };
}

/** Nettoie une icône reçue du renderer ou lue sur le disque. */
export function sanitizeDesign(v: unknown): IconDesign | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const d = defaultDesign();
  const id = str(r.id, 60).trim();
  if (!/^[a-z0-9_-]{3,60}$/i.test(id)) return null;
  const textRaw = r.text as Record<string, unknown> | undefined;
  const badgeRaw = r.badge as Record<string, unknown> | null | undefined;
  const offRaw = r.off as Record<string, unknown> | null | undefined;
  const image = typeof r.image === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(r.image) && r.image.length < 3_000_000 ? r.image : undefined;
  const badgeSym = badgeRaw ? sanitizeSymbol(badgeRaw.symbol) : null;
  return {
    id,
    name: str(r.name, 80, d.name).trim() || d.name,
    folder: typeof r.folder === 'string' && r.folder ? r.folder.slice(0, 60) : null,
    favorite: r.favorite === true,
    createdAt: num(r.createdAt, 0, 1e15, d.createdAt),
    updatedAt: num(r.updatedAt, 0, 1e15, d.updatedAt),
    symbol: r.symbol === null ? null : (sanitizeSymbol(r.symbol) ?? (image ? null : d.symbol)),
    ...(image ? { image, imageKeep: r.imageKeep !== false } : {}),
    fg: hex(r.fg, d.fg),
    bg: hex(r.bg, d.bg),
    ...(typeof r.bg2 === 'string' && HEX.test(r.bg2) ? { bg2: r.bg2.toLowerCase() } : {}),
    shape: SHAPES.includes(r.shape as IconShape) ? (r.shape as IconShape) : d.shape,
    gradientAngle: num(r.gradientAngle, 0, 360, d.gradientAngle),
    shadow: SHADOWS.includes(r.shadow as IconShadow) ? (r.shadow as IconShadow) : 'none',
    scale: num(r.scale, 0.15, 1.2, d.scale),
    dx: num(r.dx, -50, 50, 0),
    dy: num(r.dy, -50, 50, 0),
    rotate: num(r.rotate, -180, 180, 0),
    strokeWidth: num(r.strokeWidth, 0.5, 4, d.strokeWidth),
    text:
      textRaw && typeof textRaw.value === 'string' && textRaw.value.trim()
        ? {
            value: textRaw.value.slice(0, 24),
            size: num(textRaw.size, 8, 90, 26),
            ...(typeof textRaw.color === 'string' && HEX.test(textRaw.color) ? { color: textRaw.color } : {}),
            position: (['top', 'center', 'bottom'] as const).includes(textRaw.position as 'top') ? (textRaw.position as 'top' | 'center' | 'bottom') : 'bottom',
            weight: num(textRaw.weight, 300, 900, 600)
          }
        : undefined,
    indicator: cleanIndicator(r.indicator),
    badge:
      badgeRaw && badgeSym
        ? { symbol: badgeSym, fg: hex(badgeRaw.fg, '#ffffff'), bg: hex(badgeRaw.bg, '#ff3b30'), corner: CORNERS.includes(badgeRaw.corner as IconCorner) ? (badgeRaw.corner as IconCorner) : 'tr' }
        : null,
    off: offRaw
      ? {
          ...(typeof offRaw.fg === 'string' && HEX.test(offRaw.fg) ? { fg: offRaw.fg } : {}),
          ...(typeof offRaw.bg === 'string' && HEX.test(offRaw.bg) ? { bg: offRaw.bg } : {}),
          ...(typeof offRaw.bg2 === 'string' && HEX.test(offRaw.bg2) ? { bg2: offRaw.bg2 } : {}),
          ...(offRaw.symbol !== undefined ? { symbol: sanitizeSymbol(offRaw.symbol) } : {})
        }
      : null
  };
}

/** Variante « éteint » d'une icône (paire d'états). */
export function offVariant(d: IconDesign): IconDesign {
  if (!d.off) return d;
  return {
    ...d,
    fg: d.off.fg ?? d.fg,
    bg: d.off.bg ?? d.bg,
    bg2: d.off.bg2 ?? (d.off.bg ? undefined : d.bg2),
    symbol: d.off.symbol === undefined ? d.symbol : d.off.symbol
  };
}

/** Applique un thème (couleurs) à une icône. */
export function applyTheme(d: IconDesign, t: IconColors): IconDesign {
  return { ...d, fg: t.fg, bg: t.bg, bg2: t.bg2, updatedAt: Date.now() };
}

/** Capture les réglages visuels sans enregistrer les symboles ou les images. */
export function styleLook(d: IconDesign): IconStyle['look'] {
  return structuredClone({
    fg: d.fg, bg: d.bg, bg2: d.bg2, shape: d.shape, gradientAngle: d.gradientAngle,
    shadow: d.shadow, scale: d.scale, strokeWidth: d.strokeWidth,
    imageKeep: d.imageKeep ?? true, indicator: d.indicator ?? null,
    dx: d.dx, dy: d.dy, rotate: d.rotate, text: d.text ?? null,
    badge: d.badge ? { fg: d.badge.fg, bg: d.badge.bg, corner: d.badge.corner } : null,
    off: d.off ? { fg: d.off.fg, bg: d.off.bg, bg2: d.off.bg2 } : null
  });
}

/** Validation commune à l’enregistrement et au rechargement de la bibliothèque. */
export function sanitizeStyle(v: unknown): IconStyle | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[a-z0-9_-]{3,60}$/i.test(r.id) || typeof r.name !== 'string') return null;
  if (!r.look || typeof r.look !== 'object' || Array.isArray(r.look)) return null;
  const raw = r.look as Record<string, unknown>;
  // Les couleurs de la pastille se valident indépendamment de son symbole.
  const badge = raw.badge && typeof raw.badge === 'object'
    ? { ...raw.badge, symbol: { lib: 'mdi', name: 'circle' } } : null;
  const d = sanitizeDesign({ ...raw, badge, id: 'style_tmp' });
  if (!d) return null;
  const full = styleLook(d);
  return {
    id: r.id,
    name: r.name.trim().slice(0, 40) || 'Style',
    look: {
      fg: d.fg, bg: d.bg, bg2: d.bg2, shape: d.shape, gradientAngle: d.gradientAngle,
      shadow: d.shadow, scale: d.scale, strokeWidth: d.strokeWidth,
      ...('imageKeep' in raw ? { imageKeep: raw.imageKeep !== false } : {}),
      ...('indicator' in raw ? { indicator: full.indicator } : {}),
      ...('dx' in raw ? { dx: full.dx } : {}),
      ...('dy' in raw ? { dy: full.dy } : {}),
      ...('rotate' in raw ? { rotate: full.rotate } : {}),
      ...('text' in raw ? { text: full.text } : {}),
      ...('badge' in raw ? { badge: full.badge } : {}),
      ...('off' in raw ? { off: full.off } : {})
    }
  };
}

/** Réapplique les réglages sans changer les symboles ni l’image de la cible. */
export function applyStyle(d: IconDesign, s: IconStyle['look']): IconDesign {
  const { text, badge, off, ...rest } = structuredClone(s);
  const offSymbol = d.off && 'symbol' in d.off ? { symbol: d.off.symbol } : {};
  const nextOff = off
    ? { fg: off.fg, bg: off.bg, bg2: off.bg2, ...offSymbol }
    : d.off && 'symbol' in d.off ? offSymbol : null;
  return {
    ...d, ...rest, bg2: s.bg2,
    symbol: d.symbol, image: d.image,
    ...('text' in s ? { text: text ?? undefined } : {}),
    // Aucune pastille créée sans symbole choisi sur l’icône cible.
    badge: badge && d.badge ? { ...d.badge, fg: badge.fg, bg: badge.bg, corner: badge.corner } : d.badge,
    ...('off' in s ? { off: nextOff } : {}),
    updatedAt: Date.now()
  };
}

/* ───────── dessin ───────── */

/** Superellipse façon icône iOS (carré « continu »), dans un carré de côté `s`. */
export function squirclePath(s: number, inset = 0): string {
  const n = 5; // exposant : proche des icônes d'apps
  const r = s / 2 - inset;
  const c = s / 2;
  const pts: string[] = [];
  const steps = 72;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = c + r * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n);
    const y = c + r * Math.sign(st) * Math.pow(Math.abs(st), 2 / n);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function shapeMarkup(shape: IconShape, size: number, fill: string, extra = ''): string {
  switch (shape) {
    case 'squircle':
      return `<path d="${squirclePath(size)}" fill="${fill}"${extra}/>`;
    case 'round':
      return `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"${extra}/>`;
    case 'rounded':
      return `<rect width="${size}" height="${size}" rx="${size * 0.16}" fill="${fill}"${extra}/>`;
    case 'square':
      return `<rect width="${size}" height="${size}" fill="${fill}"${extra}/>`;
    default:
      return '';
  }
}

const escAttr = (s: string): string => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string);
const escText = (s: string): string => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string);

/** Colore un symbole : currentColor et couleurs fixes → couleur choisie. */
export function paintBody(body: string, color: string): string {
  return body.replace(/currentColor/g, color);
}

function symbolMarkup(art: SymbolArt, color: string, box: { x: number; y: number; size: number }, strokeWidth: number, keepImage: boolean, uid: string): string {
  if (art.image) {
    const img = `<image href="${escAttr(art.image)}" x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" preserveAspectRatio="xMidYMid meet"`;
    if (keepImage) return `${img}/>`;
    // silhouette recolorée : la forme vient de l'opacité de l'image
    return `<defs><filter id="r${uid}" color-interpolation-filters="sRGB"><feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>${img} filter="url(#r${uid})"/>`;
  }
  const [, , vw, vh] = art.viewBox.split(/[\s,]+/).map(Number);
  const vb = Math.max(vw || 24, vh || 24);
  const k = box.size / vb;
  const paint = art.paint === 'stroke' ? `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` : `fill="${color}"`;
  return `<g transform="translate(${box.x.toFixed(2)} ${box.y.toFixed(2)}) scale(${k.toFixed(4)})" ${paint}>${paintBody(art.body, color)}</g>`;
}

export interface RenderInput {
  design: IconDesign;
  /** Symbole principal résolu (null = pas de symbole). */
  art: SymbolArt | null;
  /** Symbole de la pastille résolu. */
  badgeArt?: SymbolArt | null;
  /** Côté en pixels (144 par défaut, 288 pour les écrans haute résolution). */
  size?: number;
  indicatorState?: IndicatorState;
}

let uidSeq = 0;

/** Dessine l'icône en SVG (chaîne complète). */
export function renderIconSvg({ design: d, art, badgeArt, size = 144, indicatorState }: RenderInput): string {
  const S = size;
  const uid = (++uidSeq).toString(36);
  const defs: string[] = [];
  const parts: string[] = [];
  let bgFill = d.bg;
  if (d.bg2) {
    const a = ((d.gradientAngle - 90) * Math.PI) / 180;
    const x = Math.cos(a) / 2;
    const y = Math.sin(a) / 2;
    defs.push(`<linearGradient id="g${uid}" x1="${(0.5 - x).toFixed(3)}" y1="${(0.5 - y).toFixed(3)}" x2="${(0.5 + x).toFixed(3)}" y2="${(0.5 + y).toFixed(3)}"><stop offset="0" stop-color="${d.bg}"/><stop offset="1" stop-color="${d.bg2}"/></linearGradient>`);
    bgFill = `url(#g${uid})`;
  }
  parts.push(shapeMarkup(d.shape, S, bgFill));

  const textOn = !!d.text?.value;
  const symSize = S * d.scale;
  let cy = S / 2 + (d.dy / 100) * S;
  if (textOn && d.text?.position === 'bottom') cy -= S * 0.08;
  if (textOn && d.text?.position === 'top') cy += S * 0.08;
  const cx = S / 2 + (d.dx / 100) * S;
  if (art && !(textOn && d.text?.position === 'center')) {
    if (d.shadow !== 'none') {
      defs.push(
        d.shadow === 'soft'
          ? `<filter id="s${uid}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${(S * 0.02).toFixed(1)}" stdDeviation="${(S * 0.025).toFixed(1)}" flood-color="#000" flood-opacity=".35"/></filter>`
          : `<filter id="s${uid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(S * 0.035).toFixed(1)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      );
    }
    const inner = symbolMarkup(art, d.fg, { x: cx - symSize / 2, y: cy - symSize / 2, size: symSize }, d.strokeWidth, !!d.imageKeep, uid);
    const rot = d.rotate ? ` transform="rotate(${d.rotate} ${cx.toFixed(1)} ${cy.toFixed(1)})"` : '';
    parts.push(`<g${rot}${d.shadow !== 'none' ? ` filter="url(#s${uid})"` : ''}>${inner}</g>`);
  }
  if (textOn && d.text) {
    const t = d.text;
    const fs = (t.size / 144) * S;
    const y = t.position === 'top' ? S * 0.2 + fs * 0.35 : t.position === 'center' ? S / 2 + fs * 0.35 : S * 0.86;
    parts.push(
      `<text x="${S / 2}" y="${y.toFixed(1)}" text-anchor="middle" font-family="-apple-system, 'SF Pro Display', 'Segoe UI', Arial, sans-serif" font-size="${fs.toFixed(1)}" font-weight="${t.weight}" fill="${t.color ?? d.fg}">${escText(t.value)}</text>`
    );
  }
  if (d.badge && badgeArt) {
    const b = d.badge;
    const r = S * 0.17;
    const m = S * 0.04 + r;
    const bx = b.corner.endsWith('r') ? S - m : m;
    const by = b.corner.startsWith('t') ? m : S - m;
    parts.push(`<circle cx="${bx}" cy="${by}" r="${r}" fill="${b.bg}" stroke="${d.shape === 'none' ? 'none' : d.bg}" stroke-width="${(S * 0.02).toFixed(1)}"/>`);
    parts.push(symbolMarkup(badgeArt, b.fg, { x: bx - r * 0.62, y: by - r * 0.62, size: r * 1.24 }, Math.max(1.5, d.strokeWidth), false, uid + 'b'));
  }
  parts.push(renderIndicator(d.indicator, indicatorState, S));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${parts.join('')}</svg>`;
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Clé courte d'un symbole (récents, cache). */
export const symbolKey = (s: SymbolRef): string => `${s.lib}:${s.pack ? s.pack + '/' : ''}${s.name}${s.weight ? '@' + s.weight : ''}`;

/** Nom de fichier sûr pour l'export. */
export function exportFileName(name: string, suffix = ''): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 _-]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'icone';
  return `${base}${suffix}`;
}

/* ───────── sélection rangée par dossiers ───────── */

/** Symboles Phosphor choisis pour un Stream Deck, rangés par usage. */
export const CURATED: Array<{ id: string; label: string; names: string[] }> = [
  { id: 'maison', label: 'Maison', names: ['house', 'house-line', 'door', 'door-open', 'garage', 'bed', 'couch', 'armchair', 'bathtub', 'shower', 'toilet', 'cooking-pot', 'oven', 'coffee', 'washing-machine', 'robot', 'broom', 'plant', 'flower', 'tree'] },
  { id: 'lumieres', label: 'Lumières', names: ['lightbulb', 'lightbulb-filament', 'lamp', 'lamp-pendant', 'sun', 'sun-dim', 'moon', 'moon-stars', 'sparkle', 'magic-wand', 'palette'] },
  { id: 'climat', label: 'Climat et énergie', names: ['thermometer', 'thermometer-hot', 'thermometer-cold', 'snowflake', 'fire', 'fan', 'drop', 'wind', 'cloud', 'cloud-rain', 'cloud-sun', 'umbrella', 'plug', 'plugs', 'lightning', 'battery-full', 'battery-charging', 'solar-panel', 'charging-station', 'gas-pump'] },
  { id: 'securite', label: 'Sécurité', names: ['lock', 'lock-open', 'lock-key', 'lock-simple', 'key', 'shield-check', 'bell', 'bell-ringing', 'bell-slash', 'siren', 'camera', 'security-camera', 'video-camera', 'warning'] },
  { id: 'medias', label: 'Médias', names: ['play', 'pause', 'stop', 'skip-forward', 'skip-back', 'rewind', 'fast-forward', 'shuffle', 'repeat', 'speaker-high', 'speaker-low', 'speaker-x', 'speaker-none', 'music-note', 'music-notes', 'playlist', 'microphone', 'microphone-slash', 'microphone-stage', 'headphones', 'radio', 'television', 'record', 'broadcast', 'screencast'] },
  { id: 'pc', label: 'Ordinateur', names: ['power', 'moon', 'lock-simple', 'sign-out', 'arrows-clockwise', 'monitor', 'desktop', 'laptop', 'cpu', 'memory', 'hard-drives', 'mouse', 'keyboard', 'wifi-high', 'wifi-slash', 'bluetooth', 'terminal', 'code', 'browser', 'app-window', 'squares-four', 'gear', 'gear-six', 'sliders', 'sliders-horizontal', 'toggle-left', 'toggle-right'] },
  { id: 'apps', label: 'Applications', names: ['spotify-logo', 'youtube-logo', 'twitch-logo', 'discord-logo', 'steam-logo', 'game-controller', 'joystick', 'headset', 'globe', 'envelope', 'chat-circle', 'phone', 'phone-call', 'calendar', 'calendar-check', 'note', 'notepad', 'list-checks', 'kanban', 'rocket'] },
  { id: 'fichiers', label: 'Fichiers', names: ['folder', 'folder-open', 'file', 'file-text', 'clipboard', 'copy', 'scissors', 'trash', 'download', 'upload', 'share-network', 'link', 'printer', 'image', 'images', 'camera-rotate', 'pencil', 'pen', 'paint-brush', 'eyedropper'] },
  { id: 'temps', label: 'Temps', names: ['alarm', 'clock', 'timer', 'hourglass', 'calendar'] },
  { id: 'deplacements', label: 'Déplacements', names: ['car', 'car-profile', 'bicycle', 'airplane', 'map-pin', 'navigation-arrow', 'buildings'] },
  { id: 'gens', label: 'Personnes', names: ['user', 'users', 'user-circle', 'baby', 'dog', 'cat', 'heart', 'star', 'smiley'] },
  { id: 'etats', label: 'États', names: ['check', 'check-circle', 'x', 'x-circle', 'plus', 'minus', 'info', 'question', 'warning', 'notification', 'arrow-clockwise', 'arrow-counter-clockwise'] }
];

/* ───────── recherche en français ───────── */

/** Mots français → mots anglais des bibliothèques (la recherche accepte les deux). */
export const FR_WORDS: Record<string, string[]> = {
  maison: ['house', 'home'], lampe: ['lamp', 'light', 'lightbulb'], lumiere: ['light', 'lamp', 'bulb'], ampoule: ['bulb', 'lightbulb'],
  porte: ['door'], fenetre: ['window'], volet: ['shutter', 'blinds'], volets: ['shutter', 'blinds'], garage: ['garage'],
  chambre: ['bed'], lit: ['bed'], canape: ['couch', 'sofa'], salon: ['couch', 'sofa'], cuisine: ['kitchen', 'cooking', 'chef'],
  salle: ['bath', 'shower'], bain: ['bath', 'bathtub'], douche: ['shower'], toilettes: ['toilet'], four: ['oven'], cafe: ['coffee'],
  frigo: ['fridge'], lave: ['washing', 'dishwasher'], linge: ['washing', 'laundry'], aspirateur: ['vacuum', 'robot'], plante: ['plant'],
  arbre: ['tree'], fleur: ['flower'], jardin: ['garden', 'plant', 'flower'], chauffage: ['heat', 'thermometer', 'fire', 'radiator'],
  temperature: ['thermometer', 'temperature'], froid: ['snowflake', 'cold'], chaud: ['fire', 'hot', 'heat'], clim: ['air', 'snowflake', 'fan'],
  ventilateur: ['fan'], eau: ['water', 'drop'], goutte: ['drop'], vent: ['wind'], pluie: ['rain'], nuage: ['cloud'], soleil: ['sun'],
  lune: ['moon'], nuit: ['moon', 'night'], jour: ['sun', 'day'], neige: ['snow', 'snowflake'], meteo: ['weather', 'cloud', 'sun'],
  prise: ['plug', 'outlet', 'socket'], electricite: ['lightning', 'bolt', 'power'], energie: ['lightning', 'power', 'energy'],
  batterie: ['battery'], solaire: ['solar'], voiture: ['car'], velo: ['bicycle', 'bike'], avion: ['airplane', 'plane'], carte: ['map'],
  verrou: ['lock'], cadenas: ['lock'], serrure: ['lock'], cle: ['key'], securite: ['shield', 'security', 'lock'], alarme: ['alarm', 'siren', 'bell'],
  sonnette: ['bell', 'doorbell'], cloche: ['bell'], camera: ['camera', 'video'], appareil: ['camera', 'device'], photo: ['camera', 'image', 'photo'],
  lecture: ['play'], jouer: ['play'], pause: ['pause'], arret: ['stop'], suivant: ['next', 'skip', 'forward'], precedent: ['previous', 'back', 'skip'],
  musique: ['music', 'note'], son: ['speaker', 'volume', 'sound'], volume: ['volume', 'speaker'], muet: ['mute', 'slash', 'speaker-x'],
  micro: ['microphone', 'mic'], casque: ['headphones', 'headset'], enceinte: ['speaker'], tele: ['television', 'tv'], television: ['television', 'tv'],
  film: ['film', 'movie', 'video'], radio: ['radio'], jeu: ['game', 'controller'], jeux: ['game', 'controller'], manette: ['gamepad', 'controller', 'joystick'],
  ordinateur: ['computer', 'desktop', 'laptop', 'monitor'], ecran: ['monitor', 'screen', 'display'], portable: ['laptop', 'phone'],
  clavier: ['keyboard'], souris: ['mouse'], eteindre: ['power', 'off'], allumer: ['power', 'on'], veille: ['sleep', 'moon'], redemarrer: ['restart', 'reload', 'arrows-clockwise'],
  verrouiller: ['lock'], reglages: ['settings', 'gear', 'sliders'], parametres: ['settings', 'gear'], outil: ['tool', 'wrench'],
  dossier: ['folder'], fichier: ['file'], document: ['file', 'document'], copier: ['copy'], coller: ['paste', 'clipboard'], couper: ['scissors', 'cut'],
  poubelle: ['trash'], supprimer: ['trash', 'delete'], telecharger: ['download'], envoyer: ['send', 'upload'], partager: ['share'], lien: ['link'],
  imprimante: ['printer'], image: ['image', 'picture'], dessin: ['pencil', 'paint', 'brush'], crayon: ['pencil'], couleur: ['palette', 'color'],
  calendrier: ['calendar'], horloge: ['clock'], heure: ['clock', 'time'], minuteur: ['timer'], reveil: ['alarm'], sablier: ['hourglass'],
  message: ['chat', 'message'], courriel: ['mail', 'envelope'], mail: ['mail', 'envelope'], telephone: ['phone'], appel: ['phone', 'call'],
  personne: ['user', 'person'], utilisateur: ['user'], famille: ['users', 'family'], bebe: ['baby'], chien: ['dog'], chat: ['cat', 'chat'],
  coeur: ['heart'], etoile: ['star'], favori: ['star', 'heart'], valider: ['check'], ok: ['check'], fermer: ['x', 'close'], ajouter: ['plus', 'add'],
  moins: ['minus'], info: ['info'], question: ['question'], attention: ['warning', 'alert'], recherche: ['search', 'magnifying'], chercher: ['search', 'magnifying'],
  wifi: ['wifi'], internet: ['globe', 'wifi', 'browser'], navigateur: ['browser', 'globe'], code: ['code', 'terminal'], fusee: ['rocket'],
  argent: ['money', 'currency', 'coin'], panier: ['cart', 'basket'], cadeau: ['gift'], sport: ['sport', 'ball'], sante: ['heart', 'health', 'medical'],
  robot: ['robot'], ia: ['robot', 'sparkle', 'brain'], magie: ['magic', 'sparkle'], scene: ['magic', 'sparkle', 'movie'], ecouteurs: ['headphones', 'earbuds']
};

/** Mots à chercher pour un mot tapé (sans accents, minuscules) : lui-même + traductions. */
export function searchVariants(word: string): string[] {
  const w = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const exact = FR_WORDS[w] ?? FR_WORDS[w.replace(/s$/, '')] ?? [];
  return [w, ...exact];
}
