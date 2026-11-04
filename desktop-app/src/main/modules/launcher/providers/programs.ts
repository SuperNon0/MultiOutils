/**
 * Programmes (plugin Program de Flow) : raccourcis du menu Démarrer
 * (utilisateur + commun), du bureau, des dossiers indexés, et applis du Store
 * via Get-StartApps. Index en cache disque, rafraîchi en arrière-plan.
 */
import { shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { LauncherAction, LauncherExecMode, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import { bestMatch } from '../core/matcher';
import { parseStartApps, parseUrlShortcut } from '../core/parsers';
import { compileExcludes } from '../core/query';
import { pick, runAsAdmin, runPowerShell, spawnDetached, type LauncherEnv } from './env';

export interface ProgramEntry {
  name: string;
  /** Fichier à lancer (.lnk / .exe / .url / .appref-ms) — absent pour une appli Store. */
  path?: string;
  /** Cible résolue du raccourci (pour « ouvrir le dossier »). */
  target?: string;
  description?: string;
  /** AUMID d'une appli empaquetée (shell:AppsFolder\…). */
  appId?: string;
  kind: 'lnk' | 'exe' | 'url' | 'uwp';
}

const EXTS = new Set(['.lnk', '.exe', '.url', '.appref-ms']);
const SKIP_NAMES = /(uninstall|désinstaller|desinstaller|uninst\b|remove |readme|lisez-moi|help$|aide$|documentation|license|licence|release notes)/i;
const MAX_DEPTH = 6;
const MAX_FILES = 8000;

function startMenuDirs(): string[] {
  const env = process.env;
  const dirs: string[] = [];
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  if (env.ProgramData) dirs.push(path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  if (env.USERPROFILE) dirs.push(path.join(env.USERPROFILE, 'Desktop'));
  if (env.PUBLIC) dirs.push(path.join(env.PUBLIC, 'Desktop'));
  return dirs;
}

async function walk(
  dir: string,
  depth: number,
  out: string[],
  allowExe: boolean,
  excluded: (p: string) => boolean
): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (excluded(full)) continue;
    if (e.isDirectory()) await walk(full, depth + 1, out, allowExe, excluded);
    else {
      const ext = path.extname(e.name).toLowerCase();
      if (EXTS.has(ext) && (ext !== '.exe' || allowExe)) out.push(full);
    }
    if (out.length >= MAX_FILES) return;
  }
}

export class ProgramIndex {
  entries: ProgramEntry[] = [];
  indexedAt: string | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(
    private env: LauncherEnv,
    private cacheFile: string
  ) {}

  loadCache(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')) as { at: string; entries: ProgramEntry[] };
      if (Array.isArray(raw.entries)) {
        this.entries = raw.entries;
        this.indexedAt = raw.at;
      }
    } catch {
      // pas encore de cache
    }
  }

  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.scan()
      .catch(() => undefined)
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async scan(): Promise<void> {
    if (!this.env.isWin) {
      this.entries = [];
      return;
    }
    const settings = this.env.settings();
    const excluded = compileExcludes(settings.excludes);
    const files: string[] = [];
    for (const dir of startMenuDirs()) await walk(dir, 0, files, false, excluded);
    for (const dir of settings.indexedFolders) await walk(dir, 0, files, true, excluded);

    const seen = new Set<string>();
    const entries: ProgramEntry[] = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const name = path.basename(file, path.extname(file));
      if (SKIP_NAMES.test(name)) continue;
      const entry: ProgramEntry = { name, path: file, kind: ext === '.exe' ? 'exe' : ext === '.url' ? 'url' : 'lnk' };
      if (ext === '.lnk') {
        try {
          const link = shell.readShortcutLink(file);
          entry.target = link.target || undefined;
          entry.description = link.description || undefined;
          // raccourci vers un désinstalleur
          if (link.target && /unins\d*\.exe$|uninstall/i.test(link.target)) continue;
        } catch {
          // raccourci illisible (cible MSI « advertised ») : on le garde tel quel
        }
      } else if (ext === '.url') {
        try {
          const url = parseUrlShortcut(await fs.promises.readFile(file, 'utf8'));
          if (url && /^https?:/i.test(url)) continue; // simple lien web, pas un programme
          entry.description = url ?? undefined;
        } catch {
          continue;
        }
      } else if (ext === '.exe') {
        entry.target = file;
      }
      const key = `${name.toLowerCase()}|${(entry.target ?? file).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }

    // Applis du Store / empaquetées
    try {
      const json = await runPowerShell(
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress',
        { timeoutMs: 20_000 }
      );
      const names = new Set(entries.map((e) => e.name.toLowerCase()));
      for (const app of parseStartApps(json)) {
        if (names.has(app.name.toLowerCase())) continue;
        if (SKIP_NAMES.test(app.name)) continue;
        entries.push({ name: app.name, appId: app.appId, kind: 'uwp' });
      }
    } catch {
      // PowerShell indisponible : programmes classiques seulement
    }

    this.entries = entries;
    this.indexedAt = new Date().toISOString();
    try {
      await fs.promises.writeFile(this.cacheFile, JSON.stringify({ at: this.indexedAt, entries }), 'utf8');
    } catch {
      // cache facultatif
    }
  }
}

export function createProgramsProvider(env: LauncherEnv, index: ProgramIndex): Provider {
  const storeLabel = (): string => pick(env, 'Application Windows (Store)', 'Windows app (Store)');

  const launch = (e: ProgramEntry, mode: LauncherExecMode): LauncherOutcome => {
    if (e.kind === 'uwp' && e.appId) {
      spawnDetached('explorer.exe', [`shell:AppsFolder\\${e.appId}`]);
      return { kind: 'hide' };
    }
    if (!e.path) return { kind: 'error', message: 'chemin manquant' };
    if (mode === 'admin' && env.isWin) {
      runAsAdmin(e.target && e.target.toLowerCase().endsWith('.exe') ? e.target : e.path);
      return { kind: 'hide' };
    }
    if (mode === 'secondary') {
      env.reveal(e.target && fs.existsSync(e.target) ? e.target : e.path);
      return { kind: 'hide' };
    }
    void env.openPath(e.path).then((err) => {
      if (err) env.notify(env.t('launcher.error.open'), err);
    });
    return { kind: 'hide' };
  };

  return {
    id: 'programs',
    global: true,

    query({ parsed }: ProviderQuery): ProviderItem[] {
      const search = parsed.search;
      if (!search) return [];
      const out: ProviderItem[] = [];
      for (const e of index.entries) {
        const exe = e.target ? path.basename(e.target, path.extname(e.target)) : undefined;
        const m = bestMatch(search, [
          { text: e.name, weight: 1 },
          { text: exe, weight: 0.75 },
          { text: e.description, weight: 0.5 }
        ]);
        if (!m) continue;
        out.push({
          title: e.name,
          subtitle: e.kind === 'uwp' ? storeLabel() : (e.target ?? e.path),
          icon: e.path ? { kind: 'file', path: e.path } : { kind: 'sprite', name: 'grid' },
          titleHl: m.field === 0 ? m.indices : undefined,
          score: m.score,
          // un programme prime légèrement sur un fichier homonyme, comme Flow
          priority: 10,
          recordKey: e.appId ?? e.path ?? e.name,
          secondary: e.kind === 'uwp' ? undefined : env.t('launcher.action.openFolder'),
          canAdmin: env.isWin && e.kind !== 'uwp' && e.kind !== 'url',
          data: e
        });
      }
      return out;
    },

    execute(item, mode): LauncherOutcome {
      return launch(item.data as ProgramEntry, mode);
    },

    actions(item): LauncherAction[] {
      const e = item.data as ProgramEntry;
      const list: LauncherAction[] = [{ id: 'open', title: env.t('launcher.action.open'), icon: 'play', hint: 'Entrée' }];
      if (e.kind !== 'uwp') {
        list.push({ id: 'folder', title: env.t('launcher.action.openFolder'), icon: 'layers', hint: 'Ctrl Entrée' });
        if (env.isWin) list.push({ id: 'admin', title: env.t('launcher.action.admin'), icon: 'shield', hint: 'Ctrl Maj Entrée' });
        list.push({ id: 'copy', title: env.t('launcher.action.copyPath'), icon: 'copy' });
      }
      return list;
    },

    runAction(item, actionId): LauncherOutcome {
      const e = item.data as ProgramEntry;
      if (actionId === 'folder') return launch(e, 'secondary');
      if (actionId === 'admin') return launch(e, 'admin');
      if (actionId === 'copy') {
        env.copyText(e.target ?? e.path ?? e.name);
        return { kind: 'hide' };
      }
      return launch(e, 'primary');
    }
  };
}
