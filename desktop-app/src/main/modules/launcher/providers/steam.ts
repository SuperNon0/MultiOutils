/**
 * Plugin « Jeux Steam » : détecte les jeux installés (toutes les
 * bibliothèques) et les lance par le client Steam (steam://rungameid/…).
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { LauncherAction, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import { bestMatch } from '../core/matcher';
import { parseAppManifest, parseLibraryFolders, steamRunUrl, type SteamGame } from '../core/steam';
import type { LauncherEnv } from './env';

/** Dossier d'installation de Steam (registre, sinon emplacements habituels). */
function steamRoot(): Promise<string | null> {
  const candidates = [
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Steam'),
    'C:\\Program Files (x86)\\Steam'
  ].filter((p): p is string => !!p);
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (err, out) => {
      const m = !err && /SteamPath\s+REG_SZ\s+(.+)/i.exec(String(out));
      const fromReg = m ? path.normalize(m[1].trim()) : null;
      resolve([fromReg, ...candidates].find((p) => !!p && fs.existsSync(p)) ?? null);
    });
  });
}

export class SteamLibrary {
  games: SteamGame[] = [];
  private loading: Promise<void> | null = null;

  constructor(private isWin: boolean) {}

  refresh(): Promise<void> {
    if (!this.isWin) return Promise.resolve();
    this.loading = (async () => {
      const root = await steamRoot();
      if (!root) {
        this.games = [];
        return;
      }
      const libs = new Set([root]);
      try {
        const vdf = await fs.promises.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
        for (const p of parseLibraryFolders(vdf)) libs.add(path.normalize(p));
      } catch {
        // pas de fichier : seule la bibliothèque principale
      }
      const found = new Map<string, SteamGame>();
      for (const lib of libs) {
        const dir = path.join(lib, 'steamapps');
        let names: string[] = [];
        try {
          names = await fs.promises.readdir(dir);
        } catch {
          continue;
        }
        for (const n of names.filter((x) => /^appmanifest_\d+\.acf$/i.test(x))) {
          try {
            const g = parseAppManifest(await fs.promises.readFile(path.join(dir, n), 'utf8'));
            if (g) found.set(g.appId, { ...g, dir: g.dir ? path.join(dir, 'common', g.dir) : undefined });
          } catch {
            // manifeste illisible : ignoré
          }
        }
      }
      this.games = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
    })();
    return this.loading;
  }

  /** Charge une première fois à la demande. */
  ensure(): Promise<void> {
    return this.loading ?? this.refresh();
  }
}

export function createSteamProvider(env: LauncherEnv, library: SteamLibrary): Provider {
  const play = (g: SteamGame): LauncherOutcome => {
    void env.openExternal(steamRunUrl(g.appId));
    return { kind: 'hide' };
  };
  return {
    id: 'steam',
    global: true,
    async query({ parsed, byKeyword }: ProviderQuery): Promise<ProviderItem[]> {
      await library.ensure();
      const search = parsed.search;
      // « steam » tapé seul (mot-clé) : tous les jeux
      if (!search) {
        return byKeyword
          ? library.games.map((g) => ({
              title: g.name,
              subtitle: env.t('launcher.steam.sub'),
              icon: { kind: 'sprite', name: 'play' },
              score: 100,
              recordKey: g.appId,
              data: g
            }))
          : [];
      }
      const out: ProviderItem[] = [];
      for (const g of library.games) {
        const m = bestMatch(search, [{ text: g.name, weight: 1 }]);
        if (!m) continue;
        out.push({
          title: g.name,
          subtitle: env.t('launcher.steam.sub'),
          icon: { kind: 'sprite', name: 'play' },
          titleHl: m.indices,
          score: m.score,
          priority: 8,
          recordKey: g.appId,
          secondary: g.dir ? env.t('launcher.action.openFolder') : undefined,
          data: g
        });
      }
      return out;
    },
    execute(item, mode): LauncherOutcome {
      const g = item.data as SteamGame;
      if (mode === 'secondary' && g.dir) {
        void env.openPath(g.dir);
        return { kind: 'hide' };
      }
      return play(g);
    },
    actions(item): LauncherAction[] {
      const g = item.data as SteamGame;
      const list: LauncherAction[] = [{ id: 'play', title: env.t('launcher.steam.play'), icon: 'play', hint: 'Entrée' }];
      if (g.dir) list.push({ id: 'folder', title: env.t('launcher.action.openFolder'), icon: 'folderopen', hint: 'Ctrl Entrée' });
      list.push({ id: 'store', title: env.t('launcher.steam.store'), icon: 'external' });
      return list;
    },
    runAction(item, actionId): LauncherOutcome {
      const g = item.data as SteamGame;
      if (actionId === 'folder' && g.dir) {
        void env.openPath(g.dir);
        return { kind: 'hide' };
      }
      if (actionId === 'store') {
        void env.openExternal(`steam://store/${g.appId}`);
        return { kind: 'hide' };
      }
      return play(g);
    }
  };
}
