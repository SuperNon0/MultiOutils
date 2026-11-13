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
}

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

/** Message envoyé à la fenêtre d'une zone. */
export interface ZoneWindowMsg {
  zone: Zone;
  content: ZoneContent;
  settings: DesktopSettings;
}

export const ZONE_MIN_WIDTH = 160;
export const ZONE_MIN_HEIGHT = 36;
/** Hauteur de la barre de titre (zone repliée = cette hauteur). */
export const ZONE_TITLE_HEIGHT = 36;
export const ZONE_COLORS = ['#a99bff', '#e0a33a', '#2fae95', '#e46a52', '#5b7be0', '#b25fd6', '#2f9e5a', '#d9534f'];

export function defaultDesktopSettings(): DesktopSettings {
  return { enabled: true, hideNativeIcons: true, opacity: 90, snap: true, gap: 12 };
}

export function normalizeSettings(raw: Partial<DesktopSettings> | null | undefined): DesktopSettings {
  const d = defaultDesktopSettings();
  const s = { ...d, ...(raw ?? {}) };
  return {
    enabled: Boolean(s.enabled),
    hideNativeIcons: Boolean(s.hideNativeIcons),
    opacity: clamp(Math.round(Number(s.opacity) || d.opacity), 40, 100),
    snap: Boolean(s.snap),
    gap: clamp(Math.round(Number(s.gap) || 0), 0, 64)
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
    createdAt: Number(raw.createdAt) || Date.now()
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
