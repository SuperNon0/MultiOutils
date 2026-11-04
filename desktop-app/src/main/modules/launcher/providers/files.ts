/**
 * Explorateur (plugin Explorer de Flow) :
 * - chemin tapé directement (`C:\…`, `\\serveur\…`, `~\…`, `/…`) : contenu du
 *   dossier, filtré par la fin du chemin, avec autocomplétion (Tab) ;
 * - recherche par nom (mot-clé, « f » par défaut) : Everything (es.exe) s'il
 *   est installé, sinon l'index Windows Search, sinon un parcours limité des
 *   dossiers de l'utilisateur.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LauncherAction, LauncherExecMode, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import { fuzzyMatch } from '../core/matcher';
import { parsePathLines, windowsSearchScript } from '../core/parsers';
import { compileExcludes } from '../core/query';
import { runAsAdmin, runCapture, runPowerShell, type LauncherEnv } from './env';

interface FileData {
  path: string;
  dir: boolean;
}

const SEP = path.sep;

/** La requête ressemble-t-elle à un chemin ? */
export function looksLikePath(q: string, isWin: boolean): boolean {
  if (isWin) return /^[a-zA-Z]:([\\/]|$)/.test(q) || q.startsWith('\\\\') || /^~[\\/]/.test(q) || q === '~';
  return q.startsWith('/') || /^~(\/|$)/.test(q);
}

function expandHome(q: string): string {
  if (q === '~') return os.homedir();
  if (/^~[\\/]/.test(q)) return path.join(os.homedir(), q.slice(2));
  return q;
}

export class FileSearcher {
  private everythingPath: string | null | undefined;
  private walkIndex: FileData[] | null = null;
  private walkAt = 0;
  private walking: Promise<void> | null = null;

  constructor(private env: LauncherEnv) {}

  /** Chemin de es.exe (ligne de commande d'Everything), ou null. */
  everything(): string | null {
    if (this.everythingPath !== undefined) return this.everythingPath;
    this.everythingPath = null;
    if (!this.env.isWin) return null;
    const candidates = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Everything', 'es.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'] as string, 'Everything', 'es.exe'),
      ...(process.env.PATH ?? '').split(';').map((d) => d && path.join(d, 'es.exe'))
    ].filter((c): c is string => !!c);
    for (const c of candidates) {
      try {
        if (fs.statSync(c).isFile()) {
          this.everythingPath = c;
          break;
        }
      } catch {
        // absent
      }
    }
    return this.everythingPath;
  }

  resetDetection(): void {
    this.everythingPath = undefined;
    this.walkIndex = null;
  }

  async search(text: string, max: number, signal: AbortSignal): Promise<string[]> {
    const backend = this.env.settings().fileBackend;
    if (this.env.isWin) {
      const es = this.everything();
      if ((backend === 'auto' || backend === 'everything') && es) {
        try {
          const out = await runCapture(es, ['-n', String(max), ...text.split(/\s+/)], { signal, timeoutMs: 4000 });
          return parsePathLines(out, max);
        } catch {
          if (backend === 'everything') return [];
        }
      }
      if (backend === 'auto' || backend === 'windows') {
        try {
          const out = await runPowerShell(windowsSearchScript(text, max), { signal, timeoutMs: 5000 });
          const lines = parsePathLines(out, max);
          if (lines.length > 0 || backend === 'windows') return lines;
        } catch {
          if (backend === 'windows') return [];
        }
      }
    }
    return this.walkSearch(text, max);
  }

  private userRoots(): string[] {
    const home = os.homedir();
    const roots = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Bureau', 'Téléchargements', 'Images', 'Musique', 'Vidéos']
      .map((d) => path.join(home, d))
      .filter((d) => {
        try {
          return fs.statSync(d).isDirectory();
        } catch {
          return false;
        }
      });
    return [...new Set([...roots, ...this.env.settings().indexedFolders])];
  }

  /** Parcours limité (profondeur 5, 30 000 entrées), gardé 10 minutes. */
  private async buildWalkIndex(): Promise<void> {
    const excluded = compileExcludes(this.env.settings().excludes);
    const out: FileData[] = [];
    const queue: Array<{ dir: string; depth: number }> = this.userRoots().map((dir) => ({ dir, depth: 0 }));
    while (queue.length > 0 && out.length < 30_000) {
      const { dir, depth } = queue.shift() as { dir: string; depth: number };
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (excluded(full)) continue;
        const isDir = e.isDirectory();
        out.push({ path: full, dir: isDir });
        if (isDir && depth < 5) queue.push({ dir: full, depth: depth + 1 });
      }
    }
    this.walkIndex = out;
    this.walkAt = Date.now();
  }

  private async walkSearch(text: string, max: number): Promise<string[]> {
    if (!this.walkIndex || Date.now() - this.walkAt > 10 * 60_000) {
      if (!this.walking) this.walking = this.buildWalkIndex().finally(() => (this.walking = null));
      await this.walking;
    }
    const scored: Array<{ p: string; s: number }> = [];
    for (const f of this.walkIndex ?? []) {
      const m = fuzzyMatch(text, path.basename(f.path));
      if (m.success) scored.push({ p: f.path, s: m.score });
    }
    return scored
      .sort((a, b) => b.s - a.s)
      .slice(0, max)
      .map((x) => x.p);
  }
}

export function createFilesProvider(env: LauncherEnv, searcher: FileSearcher): Provider {
  const item = (p: string, dir: boolean, score: number, search: string, titleHl?: number[]): ProviderItem => {
    const name = path.basename(p) || p;
    return {
      title: name,
      subtitle: p,
      icon: dir ? { kind: 'sprite', name: 'folder' } : { kind: 'file', path: p },
      titleHl: titleHl ?? (search ? fuzzyMatch(search, name).indices : undefined),
      score,
      recordKey: p.toLowerCase(),
      autoComplete: dir ? p.replace(/[\\/]?$/, SEP) : p,
      secondary: env.t('launcher.action.openFolder'),
      canAdmin: env.isWin && /\.(exe|bat|cmd|msi)$/i.test(p),
      data: { path: p, dir } satisfies FileData
    };
  };

  /** Chemin tapé : liste du dossier parent filtrée par le dernier segment. */
  const browse = async (raw: string): Promise<ProviderItem[]> => {
    const full = expandHome(raw.replace(/\//g, env.isWin ? '\\' : '/'));
    const endsWithSep = /[\\/]$/.test(full);
    let dir = full;
    let filter = '';
    try {
      if (!endsWithSep || !fs.statSync(full).isDirectory()) {
        dir = path.dirname(full);
        filter = path.basename(full);
      }
    } catch {
      dir = path.dirname(full);
      filter = path.basename(full);
    }
    if (env.isWin && /^[a-zA-Z]:$/.test(dir)) dir += '\\';
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const excluded = compileExcludes(env.settings().excludes);
    const out: ProviderItem[] = [];
    // le dossier lui-même en tête (Entrée = l'ouvrir)
    if (!filter) out.push({ ...item(dir, true, 1000, ''), title: path.basename(dir) || dir, autoComplete: undefined });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (excluded(p)) continue;
      const isDir = e.isDirectory();
      if (!filter) {
        out.push(item(p, isDir, isDir ? 120 : 100, ''));
        continue;
      }
      const m = fuzzyMatch(filter, e.name, 0);
      if (!m.success) continue;
      const prefix = e.name.toLowerCase().startsWith(filter.toLowerCase()) ? 200 : 0;
      out.push(item(p, isDir, m.score + prefix + (isDir ? 5 : 0), filter, m.indices));
    }
    return out.slice(0, 200);
  };

  const open = (d: FileData, mode: LauncherExecMode): LauncherOutcome => {
    if (mode === 'secondary') {
      env.reveal(d.path);
      return { kind: 'hide' };
    }
    if (mode === 'admin' && env.isWin) {
      runAsAdmin(d.path, undefined, path.dirname(d.path));
      return { kind: 'hide' };
    }
    void env.openPath(d.path).then((err) => {
      if (err) env.notify(env.t('launcher.error.open'), err);
    });
    return { kind: 'hide' };
  };

  return {
    id: 'files',
    global: true,
    globalWithKeyword: true,

    async query({ parsed, byKeyword, signal }: ProviderQuery): Promise<ProviderItem[]> {
      const search = parsed.search;
      if (!search) return [];
      if (looksLikePath(search, env.isWin)) return browse(search);
      // hors mot-clé, seuls les chemins tapés sont traités (recherche par nom = mot-clé)
      if (!byKeyword) return [];
      const max = Math.max(10, env.settings().maxResults * 2);
      const paths = await searcher.search(search, max, signal);
      const excluded = compileExcludes(env.settings().excludes);
      return paths
        .filter((p) => !excluded(p))
        .map((p, i) => {
          let dir = false;
          try {
            dir = fs.statSync(p).isDirectory();
          } catch {
            // fichier disparu depuis l'indexation
          }
          const m = fuzzyMatch(search, path.basename(p), 0);
          return item(p, dir, Math.max(m.score, 60) + Math.max(0, 20 - i), search, m.indices);
        });
    },

    execute(it, mode): LauncherOutcome {
      return open(it.data as FileData, mode);
    },

    actions(it): LauncherAction[] {
      const d = it.data as FileData;
      const list: LauncherAction[] = [
        { id: 'open', title: env.t('launcher.action.open'), icon: d.dir ? 'folderopen' : 'play', hint: 'Entrée' },
        { id: 'folder', title: env.t('launcher.action.openFolder'), icon: 'folderopen', hint: 'Ctrl Entrée' },
        { id: 'copy', title: env.t('launcher.action.copyPath'), icon: 'copy' },
        { id: 'copyName', title: env.t('launcher.action.copyName'), icon: 'copy' }
      ];
      if (d.dir) list.splice(1, 0, { id: 'browse', title: env.t('launcher.action.browse'), icon: 'chev', hint: 'Tab' });
      if (env.isWin && it.canAdmin) list.push({ id: 'admin', title: env.t('launcher.action.admin'), icon: 'shield' });
      return list;
    },

    runAction(it, actionId): LauncherOutcome {
      const d = it.data as FileData;
      switch (actionId) {
        case 'folder':
          return open(d, 'secondary');
        case 'admin':
          return open(d, 'admin');
        case 'copy':
          env.copyText(d.path);
          return { kind: 'hide' };
        case 'copyName':
          env.copyText(path.basename(d.path));
          return { kind: 'hide' };
        case 'browse':
          return { kind: 'query', text: d.path.replace(/[\\/]?$/, SEP) };
        default:
          return open(d, 'primary');
      }
    }
  };
}
