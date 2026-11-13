/**
 * Module « Fichiers » (côté main) : étape 4 du dossier Bureau & Fichiers.
 * Un gestionnaire de fichiers dans la fenêtre de MultiOutils : navigation,
 * recherche (index Windows), aperçu, renommage en lot, étiquettes, doublons,
 * espace disque, nettoyage automatique, actions rapides, copies suivies,
 * corbeille. Rien n'est supprimé définitivement : tout passe par la corbeille.
 */
import { clipboard, ipcMain, nativeImage, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeZone, type Zone } from '../../../common/desktop';
import { cleanMatches, type CleanRule, type FilePlace } from '../../../common/files';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { listDir } from '../desktop/files';
import { JobQueue } from './jobs';
import * as tools from './tools';

const FAVS_KEY = 'files.favorites';
const TAGS_KEY = 'files.tags';
const CLEAN_KEY = 'files.clean';
const CLEAN_LAST_KEY = 'files.cleanLast';
const DOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function createFilesMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let jobs: JobQueue;
  let scan: AbortController | null = null;
  let searchAbort: AbortController | null = null;
  let cleanTimer: ReturnType<typeof setInterval> | null = null;

  const kvGet = <T>(key: string, fallback: T): T => {
    try {
      const row = ctx.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const kvSet = (key: string, value: unknown): void => {
    ctx.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  };
  const t = (key: string, vars?: Record<string, string | number>): string => ctx.i18n.t(key, vars);
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  /* ------------------------------------------------------ étiquettes */
  const tags = (): Record<string, string[]> => kvGet<Record<string, string[]>>(TAGS_KEY, {});
  const setTag = (paths: string[], color: string, on: boolean): Record<string, string[]> => {
    const all = tags();
    for (const p of paths) {
      const cur = new Set(all[p] ?? []);
      if (on) cur.add(color);
      else cur.delete(color);
      if (cur.size) all[p] = [...cur];
      else delete all[p];
    }
    kvSet(TAGS_KEY, all);
    return all;
  };
  /** Les étiquettes suivent un fichier renommé ou déplacé par MultiOutils. */
  const moveTags = (from: string, to: string): void => {
    const all = tags();
    if (!all[from]) return;
    all[to] = all[from];
    delete all[from];
    kvSet(TAGS_KEY, all);
  };

  /* ---------------------------------------------------- emplacements */
  const zonePlaces = (): FilePlace[] => {
    const zones = kvGet<Array<Partial<Zone> & { id: string }>>('desktop.zones', [])
      .filter((z) => z && typeof z.id === 'string')
      .map(normalizeZone);
    return zones
      .filter((z) => z.enabled)
      .map((z) => ({
        id: `zone-${z.id}`,
        label: z.title,
        path: z.kind === 'folder' ? (z.folder ?? '') : '',
        icon: z.kind === 'folder' ? 'folderopen' : 'grid',
        type: 'zone' as const,
        zoneId: z.kind === 'shortcuts' ? z.id : undefined
      }));
  };

  /* --------------------------------------------------------- nettoyage */
  const cleanRules = (): CleanRule[] => kvGet<CleanRule[]>(CLEAN_KEY, []).filter((r) => r && typeof r.id === 'string');
  const cleanPreview = async (r: CleanRule): Promise<string[]> => {
    if (!r.folder) return [];
    try {
      return cleanMatches(await listDir(r.folder), r).map((e) => e.path);
    } catch {
      return [];
    }
  };
  const runClean = async (onlyId?: string): Promise<number> => {
    let n = 0;
    for (const r of cleanRules()) {
      if (onlyId ? r.id !== onlyId : !r.enabled) continue;
      n += await tools.trash(await cleanPreview(r));
    }
    kvSet(CLEAN_LAST_KEY, Date.now());
    return n;
  };
  const dailyClean = (): void => {
    const last = kvGet<number>(CLEAN_LAST_KEY, 0);
    if (Date.now() - last < 20 * 3_600_000) return;
    if (!cleanRules().some((r) => r.enabled)) return;
    void runClean().then((n) => {
      if (n > 0) ctx.notify(t('files.clean.doneTitle'), t('files.clean.done', { n }));
    });
  };

  return {
    id: 'files',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;
      jobs = new JobQueue((list) => ctx.broadcast('files:jobs', list));

      ipcMain.handle('files:places', async () => ({
        places: await tools.places(kvGet<string[]>(FAVS_KEY, [])),
        zones: zonePlaces()
      }));
      ipcMain.handle('files:setFavorites', (_e, favs: unknown) => {
        kvSet(FAVS_KEY, strs(favs).slice(0, 40));
      });
      ipcMain.handle('files:list', async (_e, dir: unknown) => {
        const p = str(dir);
        const r = await tools.list(p);
        return { path: p, ...r };
      });
      ipcMain.handle('files:children', async (_e, dir: unknown) => {
        const r = await tools.list(str(dir));
        return r.entries.filter((e) => e.isDir).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      });
      ipcMain.handle('files:open', async (_e, p: unknown) => {
        const err = await shell.openPath(str(p));
        return err || null;
      });
      ipcMain.handle('files:reveal', (_e, p: unknown) => shell.showItemInFolder(str(p)));
      ipcMain.handle('files:copyPaths', (_e, paths: unknown) => clipboard.writeText(strs(paths).join('\r\n')));
      ipcMain.handle('files:rename', async (_e, p: unknown, name: unknown) => {
        const from = str(p);
        const clean = str(name).trim();
        if (!from || !clean || /[\\/:*?"<>|]/.test(clean)) return false;
        const to = path.join(path.dirname(from), clean);
        if (to === from) return true;
        if (fs.existsSync(to) && to.toLowerCase() !== from.toLowerCase()) return false;
        try {
          await fs.promises.rename(from, to);
          moveTags(from, to);
          return true;
        } catch {
          return false;
        }
      });
      ipcMain.handle('files:batchRename', async (_e, paths: unknown, names: unknown) => {
        const ps = strs(paths);
        const ns = strs(names);
        const results: boolean[] = [];
        // passage par des noms temporaires : évite les collisions en chaîne (a→b, b→c)
        const temp: Array<{ tmp: string; from: string; to: string }> = [];
        for (let i = 0; i < ps.length; i++) {
          const from = ps[i];
          const to = path.join(path.dirname(from), ns[i] ?? '');
          if (!ns[i] || /[\\/:*?"<>|]/.test(ns[i]) || to === from) {
            results[i] = to === from;
            continue;
          }
          const tmp = path.join(path.dirname(from), `.mo-rename-${randomUUID().slice(0, 8)}`);
          try {
            await fs.promises.rename(from, tmp);
            temp.push({ tmp, from, to });
            results[i] = true;
          } catch {
            results[i] = false;
          }
        }
        for (const x of temp) {
          try {
            if (fs.existsSync(x.to)) throw new Error('exists');
            await fs.promises.rename(x.tmp, x.to);
            moveTags(x.from, x.to);
          } catch {
            await fs.promises.rename(x.tmp, x.from).catch(() => undefined);
            results[ps.indexOf(x.from)] = false;
          }
        }
        return results;
      });
      ipcMain.handle('files:mkdir', async (_e, dir: unknown, name: unknown) => {
        const clean = str(name).trim();
        if (!clean || /[\\/:*?"<>|]/.test(clean)) return null;
        const target = path.join(str(dir), clean);
        try {
          await fs.promises.mkdir(target);
          return target;
        } catch {
          return null;
        }
      });
      ipcMain.handle('files:trash', (_e, paths: unknown) => tools.trash(strs(paths)));
      ipcMain.handle('files:transfer', (_e, paths: unknown, dest: unknown, copy: unknown) =>
        jobs.start(strs(paths), str(dest), Boolean(copy), (job) => {
          if (job.kind === 'move' && job.state === 'done') for (const s of job.sources) moveTags(s, path.join(job.dest, path.basename(s)));
        })
      );
      ipcMain.handle('files:jobs', () => jobs.list());
      ipcMain.handle('files:job', (_e, id: unknown, what: unknown) => {
        const w = str(what);
        if (w === 'pause' || w === 'resume' || w === 'cancel' || w === 'clear') jobs.action(str(id), w);
      });
      ipcMain.handle('files:search', async (_e, text: unknown, scope: unknown) => {
        searchAbort?.abort();
        searchAbort = new AbortController();
        return tools.search(str(text), str(scope) || null, 200, searchAbort.signal);
      });
      ipcMain.handle('files:preview', (_e, p: unknown) => tools.preview(str(p)));
      ipcMain.handle('files:ocr', async (_e, p: unknown) => {
        const src = await tools.ocrSource(str(p));
        if (!src) return { ok: false, error: t('files.ocr.unsupported') };
        try {
          const { app } = await import('electron');
          const { createWorker } = await import('tesseract.js');
          const worker = await createWorker(ctx.settings.get().ocrLang, 1, { cachePath: path.join(app.getPath('userData'), 'ocr-cache') });
          try {
            const { data } = await worker.recognize(src);
            return { ok: true, text: data.text.trim() };
          } finally {
            await worker.terminate();
          }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      });
      ipcMain.handle('files:tags', () => tags());
      ipcMain.handle('files:setTag', (_e, paths: unknown, color: unknown, on: unknown) => setTag(strs(paths), str(color), Boolean(on)));
      ipcMain.handle('files:duplicates', async (_e, root: unknown) => {
        scan?.abort();
        scan = new AbortController();
        const signal = scan.signal;
        return tools.duplicates(str(root), (done, total, phase) => ctx.broadcast('files:progress', { task: 'dups', done, total, phase }), signal);
      });
      ipcMain.handle('files:usage', async (_e, root: unknown) => {
        scan?.abort();
        scan = new AbortController();
        return tools.usage(str(root), (done, total) => ctx.broadcast('files:progress', { task: 'usage', done, total }), scan.signal);
      });
      ipcMain.handle('files:stopScan', () => scan?.abort());
      ipcMain.handle('files:trashList', () => tools.trashList());
      ipcMain.handle('files:trashRestore', (_e, ids: unknown) => tools.trashRestore(strs(ids)));
      ipcMain.handle('files:emptyTrash', () => tools.emptyTrash());
      ipcMain.handle('files:action', async (_e, kind: unknown, paths: unknown, extra: unknown) => {
        const ps = strs(paths);
        try {
          switch (str(kind)) {
            case 'zip':
              return { ok: true, path: await tools.zip(ps, path.dirname(ps[0]), str(extra) || path.basename(ps[0]).replace(/\.[^.]+$/, '')) };
            case 'unzip':
              return { ok: true, path: await tools.unzip(ps[0]) };
            case 'terminal':
              tools.terminalHere(ps[0]);
              return { ok: true };
            case 'png':
            case 'jpg': {
              const out: string[] = [];
              for (const p of ps) {
                const r = await tools.convertImage(p, str(kind) as 'png' | 'jpg');
                if (r) out.push(r);
              }
              return { ok: out.length > 0, path: out[0] };
            }
            default:
              return { ok: false };
          }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      });
      ipcMain.on('files:startDrag', (e, paths: unknown) => {
        const files = strs(paths).filter((p) => fs.existsSync(p));
        if (files.length === 0) return;
        e.sender.startDrag({ files, icon: nativeImage.createFromDataURL(DOT_PNG) } as Electron.Item);
      });

      // ---- Nettoyage automatique
      ipcMain.handle('files:clean:get', () => ({ rules: cleanRules(), last: kvGet<number>(CLEAN_LAST_KEY, 0) }));
      ipcMain.handle('files:clean:set', (_e, rules: unknown) => {
        const list = (Array.isArray(rules) ? rules : [])
          .filter((r) => r && typeof r.id === 'string')
          .map(
            (r): CleanRule => ({
              id: r.id,
              enabled: r.enabled !== false,
              folder: str(r.folder),
              days: Math.max(1, Math.min(3650, Math.round(Number(r.days) || 30))),
              exts: str(r.exts),
              folders: Boolean(r.folders)
            })
          );
        kvSet(CLEAN_KEY, list);
        return list;
      });
      ipcMain.handle('files:clean:preview', async (_e, rule: CleanRule) => (rule && typeof rule.folder === 'string' ? (await cleanPreview(rule)).slice(0, 500) : []));
      ipcMain.handle('files:clean:run', (_e, id: unknown) => runClean(str(id) || undefined));

      hostCtx.registerLocalCommand('files.cleanNow', async () => {
        await runClean();
      });
      setTimeout(dailyClean, 60_000);
      cleanTimer = setInterval(dailyClean, 3_600_000);
    },

    deactivate(): void {
      scan?.abort();
      searchAbort?.abort();
      if (cleanTimer) clearInterval(cleanTimer);
    }
  };
}
