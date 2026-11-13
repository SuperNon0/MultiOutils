/**
 * Module « Bureau » : zones posées sur le bureau Windows qui regroupent des
 * icônes (zones de raccourcis) ou affichent un vrai dossier (zones-dossier).
 *
 * Les fichiers ne bougent JAMAIS à cause d'une zone de raccourcis : la zone
 * n'est qu'une vue sur le dossier Bureau (choix de Noë, dossier de proposition
 * du 13/11/2026). Ce fichier est partagé main / renderer et ne contient que
 * des types et de la logique pure (testée dans desktop.test.ts).
 */

export type ZoneKind = 'shortcuts' | 'folder';
export type ZoneView = 'icons' | 'list' | 'details';
export type ZoneSort = 'manual' | 'name' | 'type' | 'size' | 'date' | 'opens';
export type ZoneIconSize = 'small' | 'medium' | 'large';

/** Position d'une zone, en pixels CSS, relative à la zone de travail de son écran. */
export interface ZoneBounds {
  displayId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Zone {
  id: string;
  kind: ZoneKind;
  title: string;
  /** Couleur du point / de l'accent de la zone ; null = accent de l'appli. */
  color: string | null;
  bounds: ZoneBounds;
  view: ZoneView;
  sort: ZoneSort;
  sortDesc: boolean;
  iconSize: ZoneIconSize;
  /** Zone de raccourcis : noms des éléments du Bureau qu'elle regroupe (ordre manuel). */
  items: string[];
  /** Zone « À trier » : reçoit tout élément du Bureau qui n'est dans aucune zone. */
  inbox: boolean;
  /** Zone-dossier : chemin affiché. */
  folder: string | null;
  /** Zone-dossier : ouvrir les sous-dossiers dans la zone même. */
  navigate: boolean;
  locked: boolean;
  enabled: boolean;
  createdAt: number;
  /** Repliée : seule la barre de titre reste visible (se déplie au survol ou au clic). */
  rolled: boolean;
  /** Onglet : id de la zone qui l'héberge (null = zone indépendante). */
  tabOf: string | null;
  /** Zone hôte d'un groupe d'onglets : onglet affiché (null = elle-même). */
  activeTab: string | null;
  /** Ordre de l'onglet dans son groupe. */
  tabOrder: number;
  /** Reste visible quand on masque le bureau (double-clic). */
  keepOnHide: boolean;
  /** Apparence propre à la zone (complète le style par défaut des réglages). */
  style: Partial<ZoneStyle>;
  /** Page où vit la zone ('' = première page). */
  pageId: string;
  /** Présente sur toutes les pages. */
  allPages: boolean;
}

/** Apparence d'une zone (étape 3). */
export interface ZoneStyle {
  /** Couleur de fond ; null = fond du thème de MultiOutils (verre). */
  bg: string | null;
  /** Opacité du fond (%), null = réglage général. */
  opacity: number | null;
  /** Cadre et fond visibles seulement au survol. */
  invisible: boolean;
  /** Arrondi des coins (px), 0 = carré. */
  radius: number;
  titleBar: 'visible' | 'hover' | 'hidden';
  titleLook: 'flat' | 'bold';
  titleFont: 'ui' | 'mono' | 'serif';
  titleSize: number;
  titleColor: string | null;
  /** Teinte appliquée à toutes les icônes. */
  iconTint: string | null;
  /** Icônes fondues dans le fond d'écran, nettes au survol. */
  iconFade: boolean;
  /** Liseré de couleur à gauche. */
  stripe: boolean;
}

export interface SavedStyle {
  id: string;
  name: string;
  style: Partial<ZoneStyle>;
}

export interface DesktopPage {
  id: string;
  name: string;
}

/** Page automatique : selon l'heure ou l'application au premier plan. */
export type PageAutoRule =
  | { id: string; pageId: string; type: 'time'; from: string; to: string; days: number[] }
  | { id: string; pageId: string; type: 'app'; exe: string };

export interface DesktopSettings {
  /** Interrupteur général du module. */
  enabled: boolean;
  /** Masque les icônes natives de Windows (elles sont alors affichées par les zones). */
  hideNativeIcons: boolean;
  /** Opacité du fond des zones, 40 à 100 %. */
  opacity: number;
  /** Aimantation entre zones et aux bords de l'écran. */
  snap: boolean;
  /** Espace laissé entre deux zones aimantées (px). */
  gap: number;
  /** Ouverture d'une zone repliée : au survol, après un délai, ou au clic. */
  rollOpen: 'hover' | 'delay' | 'click';
  /** Délai de survol avant ouverture (ms), pour rollOpen = 'delay'. */
  rollDelay: number;
  /** Une zone collée au bord haut de l'écran se replie toute seule. */
  autoRollEdge: boolean;
  /** Double-clic sur le bureau vide : masquer / réafficher les zones. */
  dblClickHide: boolean;
  /** Masquage automatique après N secondes sans utiliser le bureau (0 = jamais). */
  autoHideSec: number;
  /** Zones masquées : les réafficher quand la souris touche un bord d'écran. */
  edgeReveal: boolean;
  /** Aperçu au-dessus des fenêtres : raccourci et mode. */
  peekShortcut: string;
  peekMode: 'hold' | 'toggle';
  /** Coin actif qui lance l'aperçu. */
  hotCorner: 'off' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Style des onglets d'un groupe. */
  tabStyle: 'tabs' | 'segments' | 'menu';
  /** Apparence par défaut de toutes les zones. */
  defaultStyle: ZoneStyle;
  savedStyles: SavedStyle[];
  pages: DesktopPage[];
  activePage: string;
  /** Molette sur le bureau vide : page suivante / précédente. */
  pageWheel: boolean;
  /** Pastille avec les points de page au changement de page. */
  pageIndicator: boolean;
  pageNextShortcut: string;
  pagePrevShortcut: string;
  pageAuto: PageAutoRule[];
  /** Une disposition par configuration d'écrans, rétablie au branchement. */
  layoutPerScreens: boolean;
}

export type EntryKind =
  | 'folder'
  | 'shortcut'
  | 'app'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'archive'
  | 'code'
  | 'text'
  | 'other';

/** Un élément d'un dossier, tel qu'affiché dans une zone. */
export interface DesktopEntry {
  name: string;
  path: string;
  isDir: boolean;
  kind: EntryKind;
  /** Extension en minuscules, sans le point ('' pour un dossier). */
  ext: string;
  size: number;
  mtime: number;
}

/** Contenu d'une zone, calculé par le main. */
export interface ZoneContent {
  zoneId: string;
  /** Dossier actuellement affiché (zone-dossier, après navigation). */
  path: string | null;
  /** Peut-on remonter (zone-dossier naviguée plus bas que sa racine) ? */
  canGoUp: boolean;
  entries: DesktopEntry[];
  error: 'missing' | 'unreachable' | null;
}

export interface DesktopState {
  settings: DesktopSettings;
  zones: Zone[];
  /** Les fonctions natives (fenêtres collées au bureau, icônes masquées) sont-elles disponibles ? */
  native: boolean;
  nativeError: string | null;
  /** Écrans, pour la mini-carte de la page Bureau. */
  displays: Array<{ id: string; label: string; workArea: { x: number; y: number; width: number; height: number }; primary: boolean }>;
}

export interface ZoneTab {
  id: string;
  title: string;
  color: string | null;
  kind: ZoneKind;
  count: number;
}

/** Message envoyé à la fenêtre d'une zone (ou d'un groupe d'onglets). */
export interface ZoneWindowMsg {
  /** Zone affichée (l'onglet actif d'un groupe). */
  zone: Zone;
  /** Zone qui porte la fenêtre (position, repli). */
  host: Zone;
  /** Onglets du groupe (une seule entrée = zone simple). */
  tabs: ZoneTab[];
  content: ZoneContent;
  settings: DesktopSettings;
  /** La zone est-elle dépliée temporairement (survol d'une zone repliée) ? */
  expanded: boolean;
  /** Aperçu au-dessus des fenêtres en cours. */
  peek: boolean;
}

export const ZONE_MIN_WIDTH = 160;
export const ZONE_MIN_HEIGHT = 36;
/** Hauteur de la barre de titre (zone repliée = cette hauteur). */
export const ZONE_TITLE_HEIGHT = 36;
export const ZONE_COLORS = ['#a99bff', '#e0a33a', '#2fae95', '#e46a52', '#5b7be0', '#b25fd6', '#2f9e5a', '#d9534f'];

export function defaultDesktopSettings(): DesktopSettings {
  return {
    enabled: true,
    hideNativeIcons: true,
    opacity: 90,
    snap: true,
    gap: 12,
    rollOpen: 'delay',
    rollDelay: 400,
    autoRollEdge: false,
    dblClickHide: true,
    autoHideSec: 0,
    edgeReveal: false,
    peekShortcut: 'Control+Alt+Space',
    peekMode: 'hold',
    hotCorner: 'off',
    tabStyle: 'tabs',
    defaultStyle: defaultZoneStyle(),
    savedStyles: [],
    pages: [{ id: 'p1', name: 'Bureau' }],
    activePage: 'p1',
    pageWheel: true,
    pageIndicator: true,
    pageNextShortcut: 'Control+Alt+PageDown',
    pagePrevShortcut: 'Control+Alt+PageUp',
    pageAuto: [],
    layoutPerScreens: true
  };
}

export function defaultZoneStyle(): ZoneStyle {
  return {
    bg: null,
    opacity: null,
    invisible: false,
    radius: 14,
    titleBar: 'visible',
    titleLook: 'flat',
    titleFont: 'ui',
    titleSize: 13.5,
    titleColor: null,
    iconTint: null,
    iconFade: false,
    stripe: false
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const hexOrNull = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);

/** Ne garde que les champs de style valides (pour une zone : rien d'imposé). */
export function normalizeStyle(raw: unknown): Partial<ZoneStyle> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Partial<ZoneStyle> = {};
  if ('bg' in r) out.bg = hexOrNull(r.bg);
  if ('opacity' in r) out.opacity = r.opacity === null ? null : clamp(Math.round(Number(r.opacity) || 0), 0, 100);
  if ('invisible' in r) out.invisible = Boolean(r.invisible);
  if ('radius' in r) out.radius = clamp(Math.round(Number(r.radius) || 0), 0, 24);
  if ('titleBar' in r) out.titleBar = oneOf(r.titleBar, ['visible', 'hover', 'hidden'] as const, 'visible');
  if ('titleLook' in r) out.titleLook = oneOf(r.titleLook, ['flat', 'bold'] as const, 'flat');
  if ('titleFont' in r) out.titleFont = oneOf(r.titleFont, ['ui', 'mono', 'serif'] as const, 'ui');
  if ('titleSize' in r) out.titleSize = clamp(Number(r.titleSize) || 13.5, 10, 22);
  if ('titleColor' in r) out.titleColor = hexOrNull(r.titleColor);
  if ('iconTint' in r) out.iconTint = hexOrNull(r.iconTint);
  if ('iconFade' in r) out.iconFade = Boolean(r.iconFade);
  if ('stripe' in r) out.stripe = Boolean(r.stripe);
  return out;
}

/** Style complet d'une zone : défaut des réglages, puis ses propres choix. */
export function effectiveStyle(zone: Pick<Zone, 'style'>, settings: Pick<DesktopSettings, 'defaultStyle' | 'opacity'>): ZoneStyle & { opacity: number } {
  const s = { ...defaultZoneStyle(), ...settings.defaultStyle, ...zone.style };
  return { ...s, opacity: s.opacity ?? settings.opacity };
}

/* ------------------------------------------------------------- pages */
/** Page effective d'une zone ('' ou page disparue = première page). */
export function pageOf(zone: Pick<Zone, 'pageId'>, pages: DesktopPage[]): string {
  return pages.some((p) => p.id === zone.pageId) ? zone.pageId : (pages[0]?.id ?? '');
}

export function onActivePage(zone: Pick<Zone, 'pageId' | 'allPages'>, settings: Pick<DesktopSettings, 'pages' | 'activePage'>): boolean {
  return zone.allPages || pageOf(zone, settings.pages) === settings.activePage;
}

/** Page voisine (boucle aux extrémités). */
export function nextPage(settings: Pick<DesktopSettings, 'pages' | 'activePage'>, dir: 1 | -1): string {
  const i = settings.pages.findIndex((p) => p.id === settings.activePage);
  const n = settings.pages.length;
  if (n === 0) return settings.activePage;
  return settings.pages[(((i < 0 ? 0 : i) + dir) % n + n) % n].id;
}

const minutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

/** Page voulue par les règles automatiques (la première qui s'applique), ou null. */
export function autoPage(rules: PageAutoRule[], ctx: { now: Date; exe: string | null }, pages: DesktopPage[]): string | null {
  for (const r of rules) {
    if (!pages.some((p) => p.id === r.pageId)) continue;
    if (r.type === 'app') {
      const want = r.exe.trim().toLowerCase().replace(/^.*[\\/]/, '');
      if (want && ctx.exe && ctx.exe.toLowerCase().replace(/^.*[\\/]/, '') === want) return r.pageId;
      continue;
    }
    const from = minutes(r.from);
    const to = minutes(r.to);
    if (from === null || to === null) continue;
    if (r.days.length > 0 && !r.days.includes(ctx.now.getDay())) continue;
    const cur = ctx.now.getHours() * 60 + ctx.now.getMinutes();
    const inside = from <= to ? cur >= from && cur < to : cur >= from || cur < to;
    if (inside) return r.pageId;
  }
  return null;
}

function normalizePages(raw: unknown, fallback: DesktopPage[]): DesktopPage[] {
  const list = (Array.isArray(raw) ? raw : [])
    .filter((p): p is DesktopPage => !!p && typeof p.id === 'string' && p.id !== '')
    .map((p) => ({ id: p.id, name: String(p.name ?? '').slice(0, 40) || 'Page' }));
  const seen = new Set<string>();
  const unique = list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  return unique.length > 0 ? unique : fallback;
}

function normalizePageAuto(raw: unknown): PageAutoRule[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => r && typeof r.id === 'string' && typeof r.pageId === 'string')
    .map((r): PageAutoRule =>
      r.type === 'app'
        ? { id: r.id, pageId: r.pageId, type: 'app', exe: String(r.exe ?? '') }
        : {
            id: r.id,
            pageId: r.pageId,
            type: 'time',
            from: String(r.from ?? '09:00'),
            to: String(r.to ?? '18:00'),
            days: (Array.isArray(r.days) ? r.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6)
          }
    );
}

/* ---------------------------------------------------------- dispositions */
export interface DisplayLike {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor?: number;
}

/** Clé d'une configuration d'écrans (taille et place de chacun). */
export function screensKey(displays: DisplayLike[]): string {
  return displays
    .map((d) => `${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}`)
    .sort()
    .join('|');
}

export type LayoutEntry = Pick<Zone, 'bounds' | 'rolled' | 'enabled'>;
export type Layout = Record<string, LayoutEntry>;

export function layoutOf(zones: Zone[]): Layout {
  const out: Layout = {};
  for (const z of zones) out[z.id] = { bounds: { ...z.bounds }, rolled: z.rolled, enabled: z.enabled };
  return out;
}

/** Remet chaque zone connue de la disposition à sa place. */
export function applyLayout(zones: Zone[], layout: Layout): Zone[] {
  return zones.map((z) => {
    const l = layout[z.id];
    return l ? { ...z, bounds: { ...l.bounds }, rolled: l.rolled } : z;
  });
}

/**
 * Échange les écrans : chaque zone passe sur l'écran suivant, à la même place
 * en proportion (utile quand une station d'accueil inverse les écrans).
 */
export function swapScreens(
  zones: Zone[],
  displays: Array<{ id: string; workArea: { width: number; height: number } }>
): Zone[] {
  if (displays.length < 2) return zones;
  const idx = new Map(displays.map((d, i) => [d.id, i]));
  return zones.map((z) => {
    const i = idx.get(z.bounds.displayId) ?? 0;
    const from = displays[i];
    const to = displays[(i + 1) % displays.length];
    const fx = from.workArea.width ? to.workArea.width / from.workArea.width : 1;
    const fy = from.workArea.height ? to.workArea.height / from.workArea.height : 1;
    const width = Math.min(z.bounds.width, to.workArea.width);
    const height = Math.min(z.bounds.height, to.workArea.height);
    return {
      ...z,
      bounds: {
        displayId: to.id,
        x: Math.round(Math.min(z.bounds.x * fx, to.workArea.width - width)),
        y: Math.round(Math.min(z.bounds.y * fy, to.workArea.height - height)),
        width,
        height
      }
    };
  });
}

/** Fichier d'export d'une disposition (i6) et contenu d'un instantané (i4, i5). */
export interface DesktopBundle {
  app: 'MultiOutils';
  kind: 'desktop-layout';
  version: 1;
  at: number;
  zones: Zone[];
  pages: DesktopPage[];
  rules?: Rule[];
}

export interface Snapshot {
  id: string;
  name: string;
  at: number;
  /** 'manual' : instantané ; 'daily' : sauvegarde quotidienne automatique. */
  type: 'manual' | 'daily';
  bundle: DesktopBundle;
}

/** Lit un fichier d'export ; null s'il ne vient pas de MultiOutils. */
export function parseBundle(raw: unknown): DesktopBundle | null {
  const b = raw as Partial<DesktopBundle> | null;
  if (!b || b.app !== 'MultiOutils' || b.kind !== 'desktop-layout' || !Array.isArray(b.zones)) return null;
  return {
    app: 'MultiOutils',
    kind: 'desktop-layout',
    version: 1,
    at: Number(b.at) || Date.now(),
    zones: b.zones.filter((z) => z && typeof z.id === 'string').map(normalizeZone),
    pages: normalizePages(b.pages, defaultDesktopSettings().pages),
    rules: Array.isArray(b.rules) ? b.rules.filter((r) => r && typeof r.id === 'string').map(normalizeRule) : undefined
  };
}

/** Garde les `keep` dernières sauvegardes quotidiennes (une par jour) et tous les instantanés. */
export function pruneDaily(list: Snapshot[], keep = 7): Snapshot[] {
  const daily = list.filter((s) => s.type === 'daily').sort((a, b) => b.at - a.at);
  const days = new Set<string>();
  const kept = new Set<string>();
  for (const s of daily) {
    const day = new Date(s.at).toISOString().slice(0, 10);
    if (days.has(day) || days.size >= keep) continue;
    days.add(day);
    kept.add(s.id);
  }
  return list.filter((s) => s.type === 'manual' || kept.has(s.id));
}

function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

export function normalizeSettings(raw: Partial<DesktopSettings> | null | undefined): DesktopSettings {
  const d = defaultDesktopSettings();
  const s = { ...d, ...(raw ?? {}) };
  return {
    enabled: Boolean(s.enabled),
    hideNativeIcons: Boolean(s.hideNativeIcons),
    opacity: clamp(Math.round(Number(s.opacity) || d.opacity), 40, 100),
    snap: Boolean(s.snap),
    gap: clamp(Math.round(Number(s.gap) || 0), 0, 64),
    rollOpen: oneOf(s.rollOpen, ['hover', 'delay', 'click'] as const, d.rollOpen),
    rollDelay: clamp(Math.round(Number(s.rollDelay) || 0), 0, 3000),
    autoRollEdge: Boolean(s.autoRollEdge),
    dblClickHide: Boolean(s.dblClickHide),
    autoHideSec: clamp(Math.round(Number(s.autoHideSec) || 0), 0, 3600),
    edgeReveal: Boolean(s.edgeReveal),
    peekShortcut: typeof s.peekShortcut === 'string' ? s.peekShortcut : d.peekShortcut,
    peekMode: oneOf(s.peekMode, ['hold', 'toggle'] as const, d.peekMode),
    hotCorner: oneOf(s.hotCorner, ['off', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const, d.hotCorner),
    tabStyle: oneOf(s.tabStyle, ['tabs', 'segments', 'menu'] as const, d.tabStyle),
    defaultStyle: { ...defaultZoneStyle(), ...normalizeStyle(s.defaultStyle) },
    savedStyles: (Array.isArray(s.savedStyles) ? s.savedStyles : [])
      .filter((x) => x && typeof x.id === 'string')
      .map((x) => ({ id: x.id, name: String(x.name ?? '').slice(0, 40), style: normalizeStyle(x.style) })),
    ...(() => {
      const pages = normalizePages(s.pages, d.pages);
      return { pages, activePage: pages.some((p) => p.id === s.activePage) ? s.activePage : pages[0].id };
    })(),
    pageWheel: Boolean(s.pageWheel),
    pageIndicator: Boolean(s.pageIndicator),
    pageNextShortcut: typeof s.pageNextShortcut === 'string' ? s.pageNextShortcut : d.pageNextShortcut,
    pagePrevShortcut: typeof s.pagePrevShortcut === 'string' ? s.pagePrevShortcut : d.pagePrevShortcut,
    pageAuto: normalizePageAuto(s.pageAuto),
    layoutPerScreens: Boolean(s.layoutPerScreens)
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/* ------------------------------------------------------------- catégories */
const KINDS: Array<[EntryKind, string[]]> = [
  ['shortcut', ['lnk', 'url', 'website']],
  ['app', ['exe', 'msi', 'appref-ms', 'bat', 'cmd', 'ps1']],
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff', 'ico', 'avif', 'psd']],
  ['video', ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'm4v']],
  ['audio', ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma']],
  ['pdf', ['pdf']],
  ['doc', ['doc', 'docx', 'odt', 'rtf', 'pages']],
  ['sheet', ['xls', 'xlsx', 'ods', 'csv', 'numbers']],
  ['slides', ['ppt', 'pptx', 'odp', 'key']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso']],
  ['code', ['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css', 'c', 'cpp', 'cs', 'java', 'go', 'rs', 'php', 'sh', 'yml', 'yaml', 'xml', 'sql']],
  ['text', ['txt', 'md', 'log', 'ini', 'cfg']]
];
const KIND_BY_EXT = new Map<string, EntryKind>();
for (const [kind, exts] of KINDS) for (const e of exts) KIND_BY_EXT.set(e, kind);

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function kindOf(name: string, isDir: boolean): EntryKind {
  if (isDir) return 'folder';
  return KIND_BY_EXT.get(extOf(name)) ?? 'other';
}

/** Nom affiché : sans l'extension pour les raccourcis (comme Windows). */
export function displayName(entry: Pick<DesktopEntry, 'name' | 'kind' | 'isDir'>): string {
  if (entry.isDir) return entry.name;
  if (entry.kind === 'shortcut' || entry.name.toLowerCase().endsWith('.appref-ms')) {
    const i = entry.name.lastIndexOf('.');
    return i > 0 ? entry.name.slice(0, i) : entry.name;
  }
  return entry.name;
}

/* --------------------------------------------------------------------- tri */
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/**
 * Trie les éléments d'une zone. Les dossiers passent toujours en premier
 * (sauf en ordre manuel, qui suit `manual` : l'ordre des items de la zone).
 */
export function sortEntries(
  entries: DesktopEntry[],
  sort: ZoneSort,
  desc: boolean,
  opts: { manual?: string[]; opens?: Record<string, number> } = {}
): DesktopEntry[] {
  const list = [...entries];
  if (sort === 'manual') {
    const order = new Map((opts.manual ?? []).map((n, i) => [n, i]));
    list.sort((a, b) => (order.get(a.name) ?? 1e9) - (order.get(b.name) ?? 1e9) || collator.compare(a.name, b.name));
    return desc ? list.reverse() : list;
  }
  const key = (e: DesktopEntry): number | string => {
    switch (sort) {
      case 'type':
        return e.ext;
      case 'size':
        return e.size;
      case 'date':
        return e.mtime;
      case 'opens':
        return opts.opens?.[e.path] ?? 0;
      default:
        return displayName(e);
    }
  };
  list.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    const ka = key(a);
    const kb = key(b);
    let r = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : collator.compare(String(ka), String(kb));
    if (r === 0) r = collator.compare(a.name, b.name);
    return desc ? -r : r;
  });
  return list;
}

/* --------------------------------------------------------- répartition */
/**
 * Contenu de chaque zone de raccourcis : ses items présents sur le Bureau,
 * plus, pour la zone « À trier », tout ce qui n'est dans aucune autre zone.
 * Un élément revendiqué par plusieurs zones reste dans la première.
 */
export function distribute(zones: Zone[], desktop: DesktopEntry[]): Map<string, DesktopEntry[]> {
  const byName = new Map(desktop.map((e) => [e.name, e]));
  const taken = new Set<string>();
  const out = new Map<string, DesktopEntry[]>();
  for (const z of zones) {
    if (z.kind !== 'shortcuts' || !z.enabled) continue;
    const list: DesktopEntry[] = [];
    for (const name of z.items) {
      const e = byName.get(name);
      if (e && !taken.has(name)) {
        taken.add(name);
        list.push(e);
      }
    }
    out.set(z.id, list);
  }
  const inbox = zones.find((z) => z.kind === 'shortcuts' && z.enabled && z.inbox);
  if (inbox) {
    const list = out.get(inbox.id) ?? [];
    for (const e of desktop) if (!taken.has(e.name)) list.push(e);
    out.set(inbox.id, list);
  }
  return out;
}

/** Retire `names` de toutes les zones puis les ajoute à `zoneId` (à la fin ou avant `before`). */
export function assignItems(zones: Zone[], zoneId: string, names: string[], before?: string): Zone[] {
  const set = new Set(names);
  return zones.map((z) => {
    if (z.kind !== 'shortcuts') return z;
    let items = z.items.filter((n) => !set.has(n));
    if (z.id === zoneId) {
      const at = before ? items.indexOf(before) : -1;
      items = at >= 0 ? [...items.slice(0, at), ...names, ...items.slice(at)] : [...items, ...names];
    }
    return items.length === z.items.length && items.every((n, i) => n === z.items[i]) ? z : { ...z, items };
  });
}

/** Suit un renommage ou une suppression sur le Bureau. */
export function renameItem(zones: Zone[], from: string, to: string | null): Zone[] {
  return zones.map((z) =>
    z.items.includes(from)
      ? { ...z, items: to ? z.items.map((n) => (n === from ? to : n)) : z.items.filter((n) => n !== from) }
      : z
  );
}

/* -------------------------------------------------------- géométrie */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Garde la zone dans la zone de travail, à une taille minimale. */
export function clampToArea(r: Rect, area: Rect): Rect {
  const width = clamp(Math.round(r.width), ZONE_MIN_WIDTH, area.width);
  const height = clamp(Math.round(r.height), ZONE_MIN_HEIGHT, area.height);
  const x = clamp(Math.round(r.x), area.x, area.x + area.width - width);
  const y = clamp(Math.round(r.y), area.y, area.y + area.height - height);
  return { x, y, width, height };
}

/**
 * Aimantation : colle les bords de `r` à ceux des autres zones (avec `gap`)
 * et aux bords de l'écran, quand ils sont à moins de `threshold` px.
 * `mode` 'move' déplace la zone ; 'resize' n'ajuste que le bord droit / bas.
 */
export function snapRect(
  r: Rect,
  others: Rect[],
  area: Rect,
  opts: { gap: number; threshold?: number; mode?: 'move' | 'resize' }
): Rect {
  const th = opts.threshold ?? 12;
  const gap = opts.gap;
  const mode = opts.mode ?? 'move';
  const xs: number[] = [area.x, area.x + area.width];
  const ys: number[] = [area.y, area.y + area.height];
  for (const o of others) {
    xs.push(o.x, o.x + o.width, o.x - gap, o.x + o.width + gap);
    ys.push(o.y, o.y + o.height, o.y - gap, o.y + o.height + gap);
  }
  const best = (value: number, targets: number[]): number | null => {
    let res: number | null = null;
    let dist = th + 1;
    for (const t of targets) {
      const d = Math.abs(t - value);
      if (d <= th && d < dist) {
        dist = d;
        res = t;
      }
    }
    return res;
  };
  const out = { ...r };
  if (mode === 'move') {
    const l = best(r.x, xs);
    const rr = best(r.x + r.width, xs);
    if (l !== null && (rr === null || Math.abs(l - r.x) <= Math.abs(rr - (r.x + r.width)))) out.x = l;
    else if (rr !== null) out.x = rr - r.width;
    const t = best(r.y, ys);
    const b = best(r.y + r.height, ys);
    if (t !== null && (b === null || Math.abs(t - r.y) <= Math.abs(b - (r.y + r.height)))) out.y = t;
    else if (b !== null) out.y = b - r.height;
  } else {
    const rr = best(r.x + r.width, xs);
    if (rr !== null && rr - r.x >= ZONE_MIN_WIDTH) out.width = rr - r.x;
    const b = best(r.y + r.height, ys);
    if (b !== null && b - r.y >= ZONE_MIN_HEIGHT) out.height = b - r.y;
  }
  return out;
}

/** Premier emplacement libre (balayage en colonnes depuis le coin haut-gauche). */
export function freeSpot(size: { width: number; height: number }, others: Rect[], area: Rect, gap: number): Rect {
  const step = 24;
  const fits = (c: Rect): boolean =>
    others.every(
      (o) =>
        c.x + c.width + gap <= o.x ||
        o.x + o.width + gap <= c.x ||
        c.y + c.height + gap <= o.y ||
        o.y + o.height + gap <= c.y
    );
  for (let x = area.x + gap; x + size.width <= area.x + area.width; x += step) {
    for (let y = area.y + gap; y + size.height <= area.y + area.height; y += step) {
      const c = { x, y, width: size.width, height: size.height };
      if (fits(c)) return c;
    }
  }
  return { x: area.x + gap, y: area.y + gap, width: size.width, height: size.height };
}

/** Une zone neuve, avec les réglages par défaut. */
export function newZone(
  id: string,
  kind: ZoneKind,
  title: string,
  bounds: ZoneBounds,
  extra: Partial<Zone> = {}
): Zone {
  return {
    id,
    kind,
    title,
    color: null,
    bounds,
    view: kind === 'folder' ? 'details' : 'icons',
    sort: kind === 'folder' ? 'name' : 'manual',
    sortDesc: false,
    iconSize: 'medium',
    items: [],
    inbox: false,
    folder: null,
    navigate: true,
    locked: false,
    enabled: true,
    createdAt: Date.now(),
    rolled: false,
    tabOf: null,
    activeTab: null,
    tabOrder: 0,
    keepOnHide: false,
    style: {},
    pageId: '',
    allPages: false,
    ...extra
  };
}

/** Valide une zone lue depuis la base (champs manquants = valeurs par défaut). */
export function normalizeZone(raw: Partial<Zone> & { id: string }): Zone {
  const kind: ZoneKind = raw.kind === 'folder' ? 'folder' : 'shortcuts';
  const b = raw.bounds ?? { displayId: '', x: 24, y: 24, width: 320, height: 240 };
  const base = newZone(raw.id, kind, String(raw.title ?? ''), {
    displayId: String(b.displayId ?? ''),
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    width: Math.max(ZONE_MIN_WIDTH, Number(b.width) || 320),
    height: Math.max(ZONE_MIN_HEIGHT, Number(b.height) || 240)
  });
  const views: ZoneView[] = ['icons', 'list', 'details'];
  const sorts: ZoneSort[] = ['manual', 'name', 'type', 'size', 'date', 'opens'];
  const sizes: ZoneIconSize[] = ['small', 'medium', 'large'];
  return {
    ...base,
    color: typeof raw.color === 'string' ? raw.color : null,
    view: views.includes(raw.view as ZoneView) ? (raw.view as ZoneView) : base.view,
    sort: sorts.includes(raw.sort as ZoneSort) ? (raw.sort as ZoneSort) : base.sort,
    sortDesc: Boolean(raw.sortDesc),
    iconSize: sizes.includes(raw.iconSize as ZoneIconSize) ? (raw.iconSize as ZoneIconSize) : base.iconSize,
    items: Array.isArray(raw.items) ? raw.items.filter((n): n is string => typeof n === 'string') : [],
    inbox: kind === 'shortcuts' && Boolean(raw.inbox),
    folder: kind === 'folder' && typeof raw.folder === 'string' ? raw.folder : null,
    navigate: raw.navigate !== false,
    locked: Boolean(raw.locked),
    enabled: raw.enabled !== false,
    createdAt: Number(raw.createdAt) || Date.now(),
    rolled: Boolean(raw.rolled),
    tabOf: typeof raw.tabOf === 'string' && raw.tabOf !== raw.id ? raw.tabOf : null,
    activeTab: typeof raw.activeTab === 'string' ? raw.activeTab : null,
    tabOrder: Number(raw.tabOrder) || 0,
    keepOnHide: Boolean(raw.keepOnHide),
    style: normalizeStyle(raw.style),
    pageId: typeof raw.pageId === 'string' ? raw.pageId : '',
    allPages: Boolean(raw.allPages)
  };
}

/** Taille d'un fichier lisible (« 3,4 Mo »). */
export function formatSize(bytes: number, lang = 'fr'): string {
  if (bytes < 1024) return `${bytes} ${lang === 'fr' ? 'o' : 'B'}`;
  const units = lang === 'fr' ? ['Ko', 'Mo', 'Go', 'To'] : ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = v >= 100 ? Math.round(v).toString() : v.toFixed(1);
  return `${lang === 'fr' ? n.replace('.', ',') : n} ${units[i]}`;
}

/* ---------------------------------------------------------- onglets */
/** Membres d'un groupe : l'hôte puis ses onglets, dans l'ordre. */
export function groupOf(zones: Zone[], hostId: string): Zone[] {
  const host = zones.find((z) => z.id === hostId);
  if (!host) return [];
  const members = zones.filter((z) => z.tabOf === hostId).sort((a, b) => a.tabOrder - b.tabOrder);
  return [host, ...members];
}

/** Hôte de la fenêtre qui affiche une zone (elle-même si indépendante). */
export function hostIdOf(zones: Zone[], id: string): string {
  const z = zones.find((o) => o.id === id);
  return z?.tabOf && zones.some((o) => o.id === z.tabOf) ? z.tabOf : id;
}

/** Ajoute `zoneId` (et ses propres onglets) au groupe de `targetId`, et l'affiche. */
export function mergeTab(zones: Zone[], zoneId: string, targetId: string): Zone[] {
  const hostId = hostIdOf(zones, targetId);
  if (hostIdOf(zones, zoneId) === hostId) return zones;
  const moving = new Set([zoneId, ...zones.filter((z) => z.tabOf === zoneId).map((z) => z.id)]);
  let order = Math.max(0, ...zones.filter((z) => z.tabOf === hostId).map((z) => z.tabOrder));
  return zones.map((z) => {
    if (moving.has(z.id)) return { ...z, tabOf: hostId, activeTab: null, rolled: false, tabOrder: ++order };
    if (z.id === hostId) return { ...z, activeTab: zoneId };
    return z;
  });
}

/** Sort un onglet de son groupe ; si c'est l'hôte, le suivant prend sa place. */
export function detachTab(zones: Zone[], zoneId: string, bounds: ZoneBounds): Zone[] {
  const z = zones.find((o) => o.id === zoneId);
  if (!z) return zones;
  if (z.tabOf) {
    const hostId = z.tabOf;
    return zones.map((o) =>
      o.id === zoneId
        ? { ...o, tabOf: null, activeTab: null, bounds }
        : o.id === hostId && o.activeTab === zoneId
          ? { ...o, activeTab: null }
          : o
    );
  }
  const members = groupOf(zones, zoneId).slice(1);
  if (members.length === 0) return zones;
  const heir = members[0];
  return zones.map((o) => {
    if (o.id === zoneId) return { ...o, activeTab: null, bounds };
    if (o.id === heir.id) return { ...o, tabOf: null, activeTab: null, bounds: z.bounds, rolled: z.rolled };
    if (o.tabOf === zoneId) return { ...o, tabOf: heir.id };
    return o;
  });
}

/** Décale un onglet d'un cran (-1 à gauche, +1 à droite) dans son groupe. */
export function moveTab(zones: Zone[], zoneId: string, dir: -1 | 1): Zone[] {
  const hostId = hostIdOf(zones, zoneId);
  const members = groupOf(zones, hostId).slice(1);
  const i = members.findIndex((m) => m.id === zoneId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= members.length) return zones;
  const order = new Map(members.map((m, k) => [m.id, k]));
  order.set(members[i].id, j);
  order.set(members[j].id, i);
  return zones.map((o) => (order.has(o.id) ? { ...o, tabOrder: order.get(o.id)! } : o));
}

/* ------------------------------------------------------------ règles */
export type RuleField = 'kind' | 'ext' | 'name' | 'target' | 'age' | 'size';
export type RuleOp = 'is' | 'isNot' | 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'regex' | 'gt' | 'lt';

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value: string;
}

export type RuleAction =
  /** Ranger dans une zone (les fichiers restent sur le Bureau). */
  | { type: 'zone'; zoneId: string }
  /** Déplacer vraiment les fichiers d'un dossier vers un autre. */
  | { type: 'move'; source: string; dest: string };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  match: 'all' | 'any';
  conditions: RuleCondition[];
  action: RuleAction;
  /** 'continuous' : surveille les nouveaux fichiers ; 'once' : seulement à la demande. */
  mode: 'once' | 'continuous';
}

export interface RuleLogEntry {
  id: string;
  at: number;
  ruleId: string;
  ruleName: string;
  name: string;
  action: 'zone' | 'move';
  /** zone : zone d'arrivée ; move : chemins d'origine et d'arrivée. */
  zoneId?: string;
  from?: string;
  to?: string;
  undone?: boolean;
}

/** Champs pour lesquels chaque opérateur a un sens. */
export const RULE_OPS: Record<RuleField, RuleOp[]> = {
  kind: ['is', 'isNot'],
  ext: ['is', 'isNot'],
  name: ['contains', 'startsWith', 'endsWith', 'equals', 'regex'],
  target: ['contains', 'startsWith', 'endsWith', 'equals', 'regex'],
  age: ['gt', 'lt'],
  size: ['gt', 'lt']
};

const DAY = 86_400_000;

function textTest(op: RuleOp, hay: string, needle: string): boolean {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  switch (op) {
    case 'contains':
      return h.includes(n);
    case 'startsWith':
      return h.startsWith(n);
    case 'endsWith':
      return h.endsWith(n);
    case 'equals':
      return h === n;
    case 'regex':
      try {
        return new RegExp(needle, 'i').test(hay);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** Une condition est-elle vraie pour cet élément ? (`target` : cible d'un raccourci) */
export function matchCondition(c: RuleCondition, e: DesktopEntry & { target?: string | null }, now: number): boolean {
  const v = c.value.trim();
  switch (c.field) {
    case 'kind': {
      const ok = e.kind === v || (v === 'shortcut' && e.kind === 'app' && e.ext === 'url');
      return c.op === 'isNot' ? !ok : ok;
    }
    case 'ext': {
      const list = v.split(/[\s,;]+/).map((x) => x.replace(/^\./, '').toLowerCase()).filter(Boolean);
      const ok = list.includes(e.ext);
      return c.op === 'isNot' ? !ok : ok;
    }
    case 'name':
      return v !== '' && textTest(c.op, e.name, v);
    case 'target':
      return v !== '' && !!e.target && textTest(c.op, e.target, v);
    case 'age': {
      const days = (now - e.mtime) / DAY;
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n)) return false;
      return c.op === 'gt' ? days > n : days < n;
    }
    case 'size': {
      if (e.isDir) return false;
      const mo = e.size / (1024 * 1024);
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n)) return false;
      return c.op === 'gt' ? mo > n : mo < n;
    }
    default:
      return false;
  }
}

export function matchRule(rule: Rule, e: DesktopEntry & { target?: string | null }, now: number): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.match === 'any'
    ? rule.conditions.some((c) => matchCondition(c, e, now))
    : rule.conditions.every((c) => matchCondition(c, e, now));
}

/** Première règle active (dans l'ordre de priorité) qui range cet élément dans une zone. */
export function firstZoneRule(
  rules: Rule[],
  e: DesktopEntry & { target?: string | null },
  now: number,
  opts: { continuousOnly?: boolean } = {}
): Rule | undefined {
  return rules.find(
    (r) => r.enabled && r.action.type === 'zone' && (!opts.continuousOnly || r.mode === 'continuous') && matchRule(r, e, now)
  );
}

export function normalizeRule(raw: Partial<Rule> & { id: string }): Rule {
  const fields = Object.keys(RULE_OPS) as RuleField[];
  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .filter((c) => c && fields.includes(c.field))
    .map((c) => ({
      field: c.field,
      op: RULE_OPS[c.field].includes(c.op) ? c.op : RULE_OPS[c.field][0],
      value: String(c.value ?? '')
    }));
  const a = raw.action;
  const action: RuleAction =
    a && a.type === 'move'
      ? { type: 'move', source: String(a.source ?? ''), dest: String(a.dest ?? '') }
      : { type: 'zone', zoneId: String((a as { zoneId?: string } | undefined)?.zoneId ?? '') };
  return {
    id: raw.id,
    name: String(raw.name ?? '').slice(0, 80),
    enabled: raw.enabled !== false,
    match: raw.match === 'any' ? 'any' : 'all',
    conditions,
    action,
    mode: raw.mode === 'once' ? 'once' : 'continuous'
  };
}
