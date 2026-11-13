/**
 * Module « Fichiers » (étape 4 du dossier Bureau & Fichiers) : types partagés
 * et logique pure (renommage en lot, filtres de recherche, nettoyage).
 */
import type { DesktopEntry, EntryKind } from './desktop';

export type FileEntry = DesktopEntry & { hidden?: boolean };

export interface FilePlace {
  id: string;
  label: string;
  path: string;
  icon: string;
  /** 'quick' : accès rapide ; 'drive' : disque ; 'fav' : favori ; 'zone' : zone du bureau. */
  type: 'quick' | 'drive' | 'fav' | 'zone';
  /** Zone du bureau : dépôt dans la zone (et non dans le dossier). */
  zoneId?: string;
  free?: number;
  total?: number;
}

export interface FolderListing {
  path: string;
  entries: FileEntry[];
  error: 'missing' | 'denied' | 'unreachable' | null;
}

export const TAG_COLORS = ['#e46a52', '#e0a33a', '#d9c23a', '#2f9e5a', '#2fae95', '#5b7be0', '#b25fd6', '#8a8f98'] as const;

/* ---------------------------------------------------------- recherche */
export interface SearchFilters {
  kinds: EntryKind[];
  /** Modifié depuis N jours (0 = peu importe). */
  days: number;
  /** Taille minimale en Mo (0 = peu importe). */
  minMb: number;
}

export function applyFilters<T extends Pick<DesktopEntry, 'kind' | 'mtime' | 'size' | 'isDir'>>(list: T[], f: SearchFilters, now = Date.now()): T[] {
  return list.filter(
    (e) =>
      (f.kinds.length === 0 || f.kinds.includes(e.kind)) &&
      (f.days <= 0 || now - e.mtime <= f.days * 86_400_000) &&
      (f.minMb <= 0 || (!e.isDir && e.size >= f.minMb * 1024 * 1024))
  );
}

/* --------------------------------------------------- renommage en lot */
export interface BatchRename {
  /** Modèle : {nom}, {n}, {date}, {ext} ; vide = garder le nom (pour rechercher-remplacer seul). */
  pattern: string;
  find: string;
  replace: string;
  /** Rechercher-remplacer en expression régulière. */
  regex: boolean;
  start: number;
  pad: number;
  /** 'keep' | 'lower' | 'upper' : casse du résultat. */
  case: 'keep' | 'lower' | 'upper';
}

export const defaultBatch = (): BatchRename => ({ pattern: '', find: '', replace: '', regex: false, start: 1, pad: 2, case: 'keep' });

const splitExt = (name: string, isDir: boolean): [string, string] => {
  if (isDir) return [name, ''];
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, ''];
};

const ymd = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Nouveaux noms (dans l'ordre donné) ; l'extension est toujours gardée. */
export function batchNames(items: Array<Pick<DesktopEntry, 'name' | 'isDir' | 'mtime'>>, o: BatchRename): string[] {
  return items.map((it, i) => {
    const [base, ext] = splitExt(it.name, it.isDir);
    let out = base;
    if (o.pattern.trim()) {
      const n = String(o.start + i).padStart(Math.max(0, o.pad), '0');
      out = o.pattern
        .replace(/\{(nom|name)\}/gi, base)
        .replace(/\{n\}/gi, n)
        .replace(/\{date\}/gi, ymd(it.mtime))
        .replace(/\{ext\}/gi, ext);
    }
    if (o.find) {
      if (o.regex) {
        try {
          out = out.replace(new RegExp(o.find, 'g'), o.replace);
        } catch {
          // expression invalide : on ne touche à rien
        }
      } else {
        out = out.split(o.find).join(o.replace);
      }
    }
    if (o.case === 'lower') out = out.toLowerCase();
    if (o.case === 'upper') out = out.toUpperCase();
    out = out.replace(/[\\/:*?"<>|]/g, '_').trim() || base;
    return ext ? `${out}.${ext}` : out;
  });
}

/** Problèmes d'un renommage : noms en double (entre eux ou avec un fichier non renommé). */
export function batchConflicts(newNames: string[], others: string[]): Set<number> {
  const bad = new Set<number>();
  const seen = new Map<string, number>();
  const taken = new Set(others.map((n) => n.toLowerCase()));
  newNames.forEach((n, i) => {
    const k = n.toLowerCase();
    if (taken.has(k)) bad.add(i);
    const j = seen.get(k);
    if (j !== undefined) {
      bad.add(i);
      bad.add(j);
    } else seen.set(k, i);
  });
  return bad;
}

/* ------------------------------------------------------- nettoyage */
export interface CleanRule {
  id: string;
  enabled: boolean;
  folder: string;
  /** Envoyé à la corbeille au-delà de N jours sans modification. */
  days: number;
  /** Extensions visées ('' = tout). */
  exts: string;
  /** Inclure les sous-dossiers entiers. */
  folders: boolean;
}

export function cleanMatches<T extends Pick<DesktopEntry, 'ext' | 'mtime' | 'isDir'>>(list: T[], r: CleanRule, now = Date.now()): T[] {
  const exts = r.exts
    .split(/[\s,;]+/)
    .map((x) => x.replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  return list.filter(
    (e) =>
      (r.folders || !e.isDir) &&
      now - e.mtime > Math.max(1, r.days) * 86_400_000 &&
      (exts.length === 0 || (!e.isDir && exts.includes(e.ext)))
  );
}

/* ------------------------------------------------------- copies */
export interface FileJob {
  id: string;
  kind: 'copy' | 'move';
  sources: string[];
  dest: string;
  total: number;
  done: number;
  files: number;
  filesDone: number;
  current: string;
  state: 'running' | 'paused' | 'done' | 'error' | 'cancelled';
  error: string | null;
  startedAt: number;
}

/* ------------------------------------------------------- doublons */
export interface DupGroup {
  size: number;
  hash: string;
  paths: string[];
}

/** Pré-tri des doublons : seuls les fichiers de même taille peuvent être identiques. */
export function sameSizeGroups(files: Array<{ path: string; size: number }>, minSize = 1): Array<{ size: number; paths: string[] }> {
  const by = new Map<number, string[]>();
  for (const f of files) {
    if (f.size < minSize) continue;
    by.set(f.size, [...(by.get(f.size) ?? []), f.path]);
  }
  return [...by.entries()].filter(([, p]) => p.length > 1).map(([size, paths]) => ({ size, paths }));
}

/* ------------------------------------------------------- espace disque */
export interface UsageItem {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  files: number;
}
