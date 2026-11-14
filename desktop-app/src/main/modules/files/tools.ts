/**
 * Outils du module Fichiers : emplacements, recherche, aperçu, doublons,
 * espace disque, corbeille Windows et actions rapides.
 */
import { app, nativeImage, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kindOf } from '../../../common/desktop';
import { sameSizeGroups, type DupGroup, type FileEntry, type FilePlace, type UsageItem } from '../../../common/files';
import { listDir } from '../desktop/files';
import { parsePathLines, windowsSearchScript } from '../launcher/core/parsers';
import { psQuote, runPowerShell } from '../launcher/providers/env';

const isWin = process.platform === 'win32';

export async function entryFor(p: string): Promise<FileEntry | null> {
  try {
    const st = await fs.promises.stat(p);
    const name = path.basename(p) || p;
    const isDir = st.isDirectory();
    return { name, path: p, isDir, kind: kindOf(name, isDir), ext: isDir ? '' : (name.split('.').pop() ?? '').toLowerCase(), size: isDir ? 0 : st.size, mtime: st.mtimeMs };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- emplacements */
export async function places(favs: string[]): Promise<FilePlace[]> {
  const home = os.homedir();
  const q = (id: string, key: Parameters<typeof app.getPath>[0], icon: string): FilePlace | null => {
    try {
      return { id, label: id, path: app.getPath(key), icon, type: 'quick' };
    } catch {
      return null;
    }
  };
  const quick = [
    { id: 'home', label: 'home', path: home, icon: 'home', type: 'quick' as const },
    q('desktop', 'desktop', 'grid'),
    q('downloads', 'downloads', 'download'),
    q('documents', 'documents', 'lib'),
    q('pictures', 'pictures', 'palette'),
    q('music', 'music', 'signal'),
    q('videos', 'videos', 'film')
  ].filter((x): x is FilePlace => !!x);
  // iCloud Drive (application iCloud pour Windows) : dossier « iCloudDrive » du profil.
  const icloud = path.join(home, 'iCloudDrive');
  try {
    if ((await fs.promises.stat(icloud)).isDirectory()) quick.push({ id: 'icloud', label: 'icloud', path: icloud, icon: 'cloud', type: 'quick' });
  } catch {
    // iCloud pour Windows absent
  }
  const drives: FilePlace[] = [];
  if (isWin) {
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const root = `${letter}:\\`;
      try {
        await fs.promises.access(root);
        let free: number | undefined;
        let total: number | undefined;
        try {
          const s = await fs.promises.statfs(root);
          free = s.bavail * s.bsize;
          total = s.blocks * s.bsize;
        } catch {
          // lecteur sans info (CD vide…)
        }
        drives.push({ id: `drive-${letter}`, label: `${letter}:`, path: root, icon: 'layers', type: 'drive', free, total });
      } catch {
        // lecteur absent
      }
    }
  } else {
    drives.push({ id: 'root', label: '/', path: '/', icon: 'layers', type: 'drive' });
  }
  const fav = favs.map((p, i) => ({ id: `fav-${i}`, label: path.basename(p) || p, path: p, icon: 'star', type: 'fav' as const }));
  return [...quick, ...fav, ...drives];
}

/* ------------------------------------------------------------ liste */
export async function list(dir: string): Promise<{ entries: FileEntry[]; error: 'missing' | 'denied' | 'unreachable' | null }> {
  try {
    return { entries: await listDir(dir), error: null };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { entries: [], error: code === 'ENOENT' ? 'missing' : code === 'EPERM' || code === 'EACCES' ? 'denied' : 'unreachable' };
  }
}

/* -------------------------------------------------------- recherche */
/** Index Windows (comme le lanceur), sinon un parcours limité du dossier. */
export async function search(text: string, scope: string | null, max = 200, signal?: AbortSignal): Promise<FileEntry[]> {
  const q = text.trim();
  if (!q) return [];
  let paths: string[] = [];
  if (isWin) {
    try {
      const out = await runPowerShell(windowsSearchScript(q, max, scope ? [scope] : []), { signal, timeoutMs: 6000 });
      paths = parsePathLines(out, max);
    } catch {
      paths = [];
    }
  }
  if (paths.length === 0 && scope) paths = await walkSearch(scope, q, max, signal);
  const out: FileEntry[] = [];
  for (const p of paths) {
    const e = await entryFor(p);
    if (e) out.push(e);
  }
  return out;
}

async function walkSearch(root: string, q: string, max: number, signal?: AbortSignal): Promise<string[]> {
  const needle = q.toLowerCase();
  const out: string[] = [];
  const queue = [root];
  let seen = 0;
  let nextDir = 0;
  while (nextDir < queue.length && out.length < max && seen < 20000 && !signal?.aborted) {
    const dir = queue[nextDir++];
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      seen++;
      const full = path.join(dir, d.name);
      if (d.name.toLowerCase().includes(needle)) out.push(full);
      if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules') queue.push(full);
      if (out.length >= max) break;
    }
  }
  return out;
}

/* ----------------------------------------------------------- aperçu */
const TEXT_EXT = new Set(['txt', 'md', 'log', 'csv', 'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'html', 'sh', 'ps1', 'bat', 'c', 'cpp', 'h', 'cs', 'java', 'go', 'rs', 'php', 'sql']);
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico']);

export interface Preview {
  kind: 'image' | 'text' | 'thumb' | 'none';
  data: string | null;
  text: string | null;
  truncated: boolean;
}

export async function preview(p: string): Promise<Preview> {
  const ext = (p.split('.').pop() ?? '').toLowerCase();
  try {
    const st = await fs.promises.stat(p);
    if (st.isFile() && TEXT_EXT.has(ext)) {
      const fh = await fs.promises.open(p, 'r');
      try {
        const buf = Buffer.alloc(Math.min(st.size, 64 * 1024));
        await fh.read(buf, 0, buf.length, 0);
        return { kind: 'text', data: null, text: buf.toString('utf8'), truncated: st.size > buf.length };
      } finally {
        await fh.close();
      }
    }
    if (st.isFile() && IMG_EXT.has(ext) && st.size < 40 * 1024 * 1024) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        const s = img.getSize();
        const scaled = s.width > 1600 ? img.resize({ width: 1600 }) : img;
        return { kind: 'image', data: scaled.toDataURL(), text: null, truncated: false };
      }
    }
    // PDF, vidéo, documents… : vignette Windows
    const thumb = await nativeImage.createThumbnailFromPath(p, { width: 1024, height: 1024 }).catch(() => null);
    if (thumb && !thumb.isEmpty()) return { kind: 'thumb', data: thumb.toDataURL(), text: null, truncated: false };
  } catch {
    // illisible
  }
  return { kind: 'none', data: null, text: null, truncated: false };
}

/** Image à donner à l'OCR : le fichier lui-même, ou sa vignette (PDF…). */
export async function ocrSource(p: string): Promise<string | Buffer | null> {
  const ext = (p.split('.').pop() ?? '').toLowerCase();
  if (IMG_EXT.has(ext)) return p;
  const thumb = await nativeImage.createThumbnailFromPath(p, { width: 2000, height: 2000 }).catch(() => null);
  return thumb && !thumb.isEmpty() ? thumb.toPNG() : null;
}

/* ---------------------------------------------------------- doublons */
async function hashFile(p: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha1');
    const rs = fs.createReadStream(p, { highWaterMark: 1 << 20 });
    rs.on('data', (c) => {
      if (signal?.aborted) rs.destroy(new Error('aborted'));
      h.update(c);
    });
    rs.on('error', reject);
    rs.on('end', () => resolve(h.digest('hex')));
  });
}

export async function duplicates(root: string, onProgress: (done: number, total: number, phase: 'scan' | 'hash') => void, signal?: AbortSignal): Promise<DupGroup[]> {
  const files: Array<{ path: string; size: number }> = [];
  const queue = [root];
  let nextDir = 0;
  while (nextDir < queue.length && !signal?.aborted && files.length < 200_000) {
    const dir = queue[nextDir++];
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) queue.push(full);
      else if (d.isFile()) {
        try {
          files.push({ path: full, size: (await fs.promises.stat(full)).size });
        } catch {
          // ignoré
        }
      }
    }
    onProgress(files.length, 0, 'scan');
  }
  const groups = sameSizeGroups(files, 1);
  const total = groups.reduce((s, g) => s + g.paths.length, 0);
  let done = 0;
  const out: DupGroup[] = [];
  for (const g of groups) {
    if (signal?.aborted) break;
    const byHash = new Map<string, string[]>();
    for (const p of g.paths) {
      try {
        const h = await hashFile(p, signal);
        const matches = byHash.get(h);
        if (matches) matches.push(p);
        else byHash.set(h, [p]);
      } catch {
        // illisible
      }
      onProgress(++done, total, 'hash');
    }
    for (const [hash, paths] of byHash) if (paths.length > 1) out.push({ size: g.size, hash, paths });
  }
  return out.sort((a, b) => b.size * (b.paths.length - 1) - a.size * (a.paths.length - 1));
}

/* ----------------------------------------------------- espace disque */
async function dirSize(dir: string, signal?: AbortSignal): Promise<{ size: number; files: number }> {
  let size = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length && !signal?.aborted) {
    const d = stack.pop()!;
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of dirents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        try {
          size += (await fs.promises.stat(full)).size;
          files++;
        } catch {
          // ignoré
        }
      }
    }
  }
  return { size, files };
}

export async function usage(root: string, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<UsageItem[]> {
  const dirents = await fs.promises.readdir(root, { withFileTypes: true });
  const out: UsageItem[] = [];
  let done = 0;
  for (const d of dirents) {
    if (signal?.aborted) break;
    const full = path.join(root, d.name);
    try {
      if (d.isDirectory()) {
        const s = await dirSize(full, signal);
        out.push({ name: d.name, path: full, size: s.size, isDir: true, files: s.files });
      } else if (d.isFile()) {
        out.push({ name: d.name, path: full, size: (await fs.promises.stat(full)).size, isDir: false, files: 1 });
      }
    } catch {
      // ignoré
    }
    onProgress(++done, dirents.length);
  }
  return out.sort((a, b) => b.size - a.size);
}

/* ------------------------------------------------------- corbeille */
export interface TrashItem {
  id: string;
  name: string;
  from: string;
  size: number;
  deletedAt: string;
}

export async function trashList(): Promise<TrashItem[]> {
  if (!isWin) return [];
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$sh = New-Object -ComObject Shell.Application',
    '$rb = $sh.Namespace(10)',
    '$out = foreach ($i in $rb.Items()) { [pscustomobject]@{ id = $i.Path; name = $i.Name; from = $rb.GetDetailsOf($i, 1); size = $i.Size; at = $rb.GetDetailsOf($i, 2) } }',
    '@($out) | ConvertTo-Json -Compress'
  ].join('; ');
  try {
    const raw = (await runPowerShell(script, { timeoutMs: 20000 })).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string; from: string; size: number; at: string }> | { id: string };
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return (arr as Array<{ id: string; name: string; from: string; size: number; at: string }>).map((i) => ({
      id: String(i.id),
      name: String(i.name),
      from: String(i.from ?? ''),
      size: Number(i.size) || 0,
      // GetDetailsOf glisse des marques de direction invisibles dans les dates
      deletedAt: String(i.at ?? '').replace(/[‎‏]/g, '')
    }));
  } catch {
    return [];
  }
}

/** Restaure des éléments de la corbeille (par leur chemin interne $R…). */
export async function trashRestore(ids: string[]): Promise<boolean> {
  if (!isWin || ids.length === 0) return false;
  const list = ids.map(psQuote).join(',');
  const script = [
    '$sh = New-Object -ComObject Shell.Application',
    '$rb = $sh.Namespace(10)',
    `$want = @(${list})`,
    "foreach ($i in $rb.Items()) { if ($want -contains $i.Path) { $i.InvokeVerb('undelete') } }"
  ].join('; ');
  try {
    await runPowerShell(script, { timeoutMs: 30000 });
    return true;
  } catch {
    return false;
  }
}

export async function emptyTrash(): Promise<boolean> {
  if (!isWin) return false;
  try {
    await runPowerShell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', { timeoutMs: 60000 });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------- actions rapides */
export async function zip(paths: string[], destDir: string, name: string): Promise<string> {
  const target = path.join(destDir, name.endsWith('.zip') ? name : `${name}.zip`);
  await runPowerShell(`Compress-Archive -LiteralPath ${paths.map(psQuote).join(',')} -DestinationPath ${psQuote(target)} -Force`, { timeoutMs: 600_000 });
  return target;
}

export async function unzip(p: string): Promise<string> {
  const base = path.basename(p).replace(/\.zip$/i, '');
  let dest = path.join(path.dirname(p), base);
  let i = 2;
  while (fs.existsSync(dest)) dest = path.join(path.dirname(p), `${base} (${i++})`);
  await runPowerShell(`Expand-Archive -LiteralPath ${psQuote(p)} -DestinationPath ${psQuote(dest)}`, { timeoutMs: 600_000 });
  return dest;
}

export function terminalHere(dir: string): void {
  if (!isWin) return;
  // Windows Terminal s'il est là, sinon PowerShell
  const child = spawn('wt.exe', ['-d', dir], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {
    spawn('powershell.exe', ['-NoExit', '-Command', `Set-Location -LiteralPath ${psQuote(dir)}`], { cwd: dir, detached: true, stdio: 'ignore' }).unref();
  });
  child.unref();
}

export async function convertImage(p: string, to: 'png' | 'jpg'): Promise<string | null> {
  const img = nativeImage.createFromPath(p);
  if (img.isEmpty()) return null;
  const base = p.replace(/\.[^.\\/]+$/, '');
  let target = `${base}.${to}`;
  let i = 2;
  while (fs.existsSync(target)) target = `${base} (${i++}).${to}`;
  await fs.promises.writeFile(target, to === 'png' ? img.toPNG() : img.toJPEG(90));
  return target;
}

export async function trash(paths: string[]): Promise<number> {
  let n = 0;
  for (const p of paths) {
    try {
      await shell.trashItem(p);
      n++;
    } catch {
      // verrouillé ou déjà supprimé
    }
  }
  return n;
}
