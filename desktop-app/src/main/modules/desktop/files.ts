/**
 * Lecture et surveillance des dossiers affichés par les zones (Bureau de
 * l'utilisateur + Bureau public, dossiers des zones-dossier).
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { kindOf, extOf, type DesktopEntry } from '../../../common/desktop';

/** Dossiers qui composent le Bureau Windows (celui de l'utilisateur d'abord). */
export function desktopDirs(): string[] {
  const dirs: string[] = [];
  try {
    dirs.push(app.getPath('desktop'));
  } catch {
    if (process.env.USERPROFILE) dirs.push(path.join(process.env.USERPROFILE, 'Desktop'));
  }
  if (process.platform === 'win32' && process.env.PUBLIC) dirs.push(path.join(process.env.PUBLIC, 'Desktop'));
  return dirs.filter((d, i) => dirs.indexOf(d) === i);
}

/** Fichiers système à ne jamais montrer. */
const HIDDEN = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

export async function listDir(dir: string): Promise<DesktopEntry[]> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  const out: DesktopEntry[] = [];
  await Promise.all(
    dirents.map(async (d) => {
      if (HIDDEN.has(d.name.toLowerCase()) || d.name.startsWith('~$')) return;
      const full = path.join(dir, d.name);
      try {
        const st = await fs.promises.stat(full);
        const isDir = st.isDirectory();
        out.push({
          name: d.name,
          path: full,
          isDir,
          kind: kindOf(d.name, isDir),
          ext: isDir ? '' : extOf(d.name),
          size: isDir ? 0 : st.size,
          mtime: st.mtimeMs
        });
      } catch {
        // lien cassé, fichier verrouillé ou supprimé entre-temps : on l'ignore
      }
    })
  );
  return out;
}

/** Contenu du Bureau : un nom présent dans les deux dossiers garde la version de l'utilisateur. */
export async function listDesktop(): Promise<DesktopEntry[]> {
  const seen = new Set<string>();
  const all: DesktopEntry[] = [];
  for (const dir of desktopDirs()) {
    let list: DesktopEntry[] = [];
    try {
      list = await listDir(dir);
    } catch {
      continue;
    }
    for (const e of list) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      all.push(e);
    }
  }
  return all;
}

/**
 * Surveille des dossiers (fs.watch natif, non récursif) et appelle `onChange`
 * une fois les changements calmés. Retourne la fonction d'arrêt.
 */
export function watchDirs(dirs: string[], onChange: (dir: string) => void, delay = 350): () => void {
  const watchers: fs.FSWatcher[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  for (const dir of dirs) {
    try {
      const w = fs.watch(dir, { persistent: false }, () => {
        const old = timers.get(dir);
        if (old) clearTimeout(old);
        timers.set(
          dir,
          setTimeout(() => {
            timers.delete(dir);
            onChange(dir);
          }, delay)
        );
      });
      w.on('error', () => w.close());
      watchers.push(w);
    } catch {
      // dossier absent ou réseau indisponible : la zone l'affichera
    }
  }
  return () => {
    for (const w of watchers) w.close();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}

/** Nom libre dans `dir` (« fichier (2).txt »). */
export function freeName(dir: string, name: string): string {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

/**
 * Déplace (ou copie) des fichiers dans `dir`, comme l'Explorateur :
 * un fichier déjà dans `dir` n'est pas touché, un nom pris est suffixé.
 * Retourne les noms obtenus dans `dir`.
 */
export async function transfer(paths: string[], dir: string, copy: boolean): Promise<string[]> {
  const names: string[] = [];
  for (const src of paths) {
    if (path.resolve(path.dirname(src)).toLowerCase() === path.resolve(dir).toLowerCase()) {
      names.push(path.basename(src));
      continue;
    }
    // ne jamais déposer un dossier dans lui-même
    const rel = path.relative(src, dir);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) continue;
    const name = freeName(dir, path.basename(src));
    const dest = path.join(dir, name);
    if (copy) {
      await fs.promises.cp(src, dest, { recursive: true, errorOnExist: true });
    } else {
      try {
        await fs.promises.rename(src, dest);
      } catch (err) {
        // autre disque : copie puis suppression
        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
        await fs.promises.cp(src, dest, { recursive: true, errorOnExist: true });
        await fs.promises.rm(src, { recursive: true, force: true });
      }
    }
    names.push(name);
  }
  return names;
}
