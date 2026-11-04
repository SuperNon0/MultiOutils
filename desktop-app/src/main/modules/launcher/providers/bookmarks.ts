/**
 * Favoris des navigateurs (plugin BrowserBookmark de Flow) : Chrome, Edge,
 * Brave, Vivaldi, Chromium (fichier JSON « Bookmarks » de chaque profil) et
 * Firefox (places.sqlite, lu sur une COPIE — le fichier d'origine est
 * verrouillé quand Firefox est ouvert).
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LauncherAction, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import { bestMatch } from '../core/matcher';
import {
  dedupeBookmarks,
  FIREFOX_BOOKMARKS_SQL,
  mapFirefoxRows,
  parseChromiumBookmarks,
  type Bookmark
} from '../core/parsers';
import type { LauncherEnv } from './env';

function chromiumRoots(): Array<{ name: string; dir: string }> {
  const local = process.env.LOCALAPPDATA;
  const home = os.homedir();
  if (process.platform === 'win32' && local) {
    return [
      { name: 'Chrome', dir: path.join(local, 'Google', 'Chrome', 'User Data') },
      { name: 'Edge', dir: path.join(local, 'Microsoft', 'Edge', 'User Data') },
      { name: 'Brave', dir: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { name: 'Vivaldi', dir: path.join(local, 'Vivaldi', 'User Data') },
      { name: 'Chromium', dir: path.join(local, 'Chromium', 'User Data') }
    ];
  }
  if (process.platform === 'darwin') {
    const sup = path.join(home, 'Library', 'Application Support');
    return [
      { name: 'Chrome', dir: path.join(sup, 'Google', 'Chrome') },
      { name: 'Edge', dir: path.join(sup, 'Microsoft Edge') },
      { name: 'Brave', dir: path.join(sup, 'BraveSoftware', 'Brave-Browser') }
    ];
  }
  const cfg = path.join(home, '.config');
  return [
    { name: 'Chrome', dir: path.join(cfg, 'google-chrome') },
    { name: 'Chromium', dir: path.join(cfg, 'chromium') },
    { name: 'Edge', dir: path.join(cfg, 'microsoft-edge') },
    { name: 'Brave', dir: path.join(cfg, 'BraveSoftware', 'Brave-Browser') }
  ];
}

function firefoxProfilesDir(): string {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? '', 'Mozilla', 'Firefox', 'Profiles');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Firefox', 'Profiles');
  return path.join(os.homedir(), '.mozilla', 'firefox');
}

const listDirs = (dir: string): string[] => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
};

export class BookmarkIndex {
  items: Bookmark[] = [];
  loadedAt = 0;

  constructor(private tmpDir: string) {}

  load(): void {
    const all: Bookmark[] = [];
    for (const { name, dir } of chromiumRoots()) {
      for (const profile of listDirs(dir)) {
        const file = path.join(profile, 'Bookmarks');
        try {
          const json = fs.readFileSync(file, 'utf8');
          const base = path.basename(profile);
          const label = base === 'Default' ? name : `${name} (${base})`;
          all.push(...parseChromiumBookmarks(json, label));
        } catch {
          // pas de favoris dans ce profil
        }
      }
    }
    for (const profile of listDirs(firefoxProfilesDir())) {
      const places = path.join(profile, 'places.sqlite');
      if (!fs.existsSync(places)) continue;
      const copy = path.join(this.tmpDir, `places-${path.basename(profile)}.sqlite`);
      try {
        fs.mkdirSync(this.tmpDir, { recursive: true });
        fs.copyFileSync(places, copy);
        // le journal WAL contient les ajouts récents non encore fusionnés
        if (fs.existsSync(`${places}-wal`)) fs.copyFileSync(`${places}-wal`, `${copy}-wal`);
        // c'est notre copie : ouverture en écriture pour que SQLite puisse rejouer le WAL
        const db = new Database(copy, { fileMustExist: true });
        try {
          const rows = db.prepare(FIREFOX_BOOKMARKS_SQL).all() as Array<{ title: string | null; url: string | null }>;
          all.push(...mapFirefoxRows(rows));
        } finally {
          db.close();
        }
      } catch {
        // base illisible (version, verrou) : on ignore ce profil
      } finally {
        for (const f of [copy, `${copy}-wal`, `${copy}-shm`]) fs.rmSync(f, { force: true });
      }
    }
    this.items = dedupeBookmarks(all);
    this.loadedAt = Date.now();
  }

  /** Recharge si l'index a plus de 10 minutes. */
  ensureFresh(): void {
    if (Date.now() - this.loadedAt > 10 * 60_000) {
      try {
        this.load();
      } catch {
        this.loadedAt = Date.now();
      }
    }
  }
}

export function createBookmarksProvider(env: LauncherEnv, index: BookmarkIndex): Provider {
  return {
    id: 'bookmarks',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      const search = parsed.search;
      if (!search) return [];
      index.ensureFresh();
      const out: ProviderItem[] = [];
      for (const b of index.items) {
        const host = b.url.replace(/^\w+:\/\/(www\.)?/, '');
        const m = bestMatch(search, [
          { text: b.title, weight: 1 },
          { text: host, weight: 0.8 }
        ]);
        if (!m) continue;
        out.push({
          title: b.title,
          subtitle: `${b.source} · ${b.url}`,
          icon: { kind: 'sprite', name: 'bookmark' },
          score: m.score,
          titleHl: m.field === 0 ? m.indices : undefined,
          recordKey: b.url,
          data: b
        });
      }
      return out;
    },
    execute(item): LauncherOutcome {
      void env.openExternal((item.data as Bookmark).url);
      return { kind: 'hide' };
    },
    actions(): LauncherAction[] {
      return [
        { id: 'open', title: env.t('launcher.action.openBrowser'), icon: 'external', hint: 'Entrée' },
        { id: 'copy', title: env.t('launcher.action.copyUrl'), icon: 'copy' }
      ];
    },
    runAction(item, actionId): LauncherOutcome {
      const b = item.data as Bookmark;
      if (actionId === 'copy') env.copyText(b.url);
      else void env.openExternal(b.url);
      return { kind: 'hide' };
    }
  };
}
