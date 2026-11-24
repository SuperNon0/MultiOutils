/**
 * « Mes couleurs » : couleurs de la pipette gardées avec un nom, rangées en
 * dossiers (ex. « Couleur fond », « Lavande »). Partagé par le main, la page
 * Pipette et le plugin Stream Deck (via le service local).
 */
export interface SavedColor {
  id: string;
  /** #rrggbb en minuscules. */
  hex: string;
  name: string;
  /** Dossier, ou null = sans dossier. */
  folder: string | null;
}

export interface ColorFolder {
  id: string;
  name: string;
}

export interface ColorLibrary {
  colors: SavedColor[];
  folders: ColorFolder[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9_-]{3,60}$/i;
export const COLOR_NAME_MAX = 40;

export const newColorId = (prefix = 'col'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function cleanColorFolder(v: unknown): ColorFolder | null {
  const r = (v ?? {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string' || !r.name.trim()) return null;
  return { id: r.id, name: r.name.trim().slice(0, COLOR_NAME_MAX) };
}

export function cleanSavedColor(v: unknown, folderIds?: Set<string>): SavedColor | null {
  const r = (v ?? {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.hex !== 'string' || !HEX.test(r.hex)) return null;
  const hex = r.hex.toLowerCase();
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, COLOR_NAME_MAX) : hex;
  let folder = typeof r.folder === 'string' && r.folder ? r.folder : null;
  if (folder && folderIds && !folderIds.has(folder)) folder = null;
  return { id: r.id, hex, name, folder };
}

/** Bibliothèque lue sur disque ou reçue : tout ce qui est invalide est écarté. */
export function cleanColorLibrary(raw: unknown): ColorLibrary {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const folders: ColorFolder[] = [];
  for (const f of arr(r.folders).map(cleanColorFolder)) if (f && !folders.some((x) => x.id === f.id)) folders.push(f);
  const ids = new Set(folders.map((f) => f.id));
  const colors: SavedColor[] = [];
  for (const c of arr(r.colors).map((x) => cleanSavedColor(x, ids))) if (c && !colors.some((x) => x.id === c.id)) colors.push(c);
  return { colors, folders };
}

/** Ajoute ou remplace un élément (même id). */
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}
