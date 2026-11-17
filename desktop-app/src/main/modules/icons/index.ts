/**
 * Module « Icônes » (atelier) côté main : bibliothèque de l'utilisateur
 * (userData/icons/library.json), catalogues de symboles, export des fichiers.
 * Le dessin se fait avec common/icons.ts (renderIconSvg), la conversion en
 * PNG dans le renderer (canvas).
 */
import { app, clipboard, dialog, ipcMain, nativeImage } from 'electron';
import { existsSync, mkdirSync, promises as fs, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_THEMES,
  sanitizeDesign,
  sanitizeSymbol,
  type IconDesign,
  type IconFolder,
  type IconLibraryState,
  type IconStyle,
  type IconTheme,
  type SymbolArt,
  type SymbolLib
} from '../../../common/icons';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { getArt, getCatalog, listPacks } from './libraries';

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9_-]{3,60}$/i;
const RECENT_MAX = 40;

const emptyState = (): IconLibraryState => ({ designs: [], folders: [], themes: [], styles: [], recent: [] });

function cleanFolder(v: unknown): IconFolder | null {
  const r = (v ?? {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string' || !r.name.trim()) return null;
  return { id: r.id, name: r.name.trim().slice(0, 60), color: typeof r.color === 'string' && HEX.test(r.color) ? r.color : '#a99bff' };
}

function cleanTheme(v: unknown): IconTheme | null {
  const r = (v ?? {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string') return null;
  if (typeof r.fg !== 'string' || !HEX.test(r.fg) || typeof r.bg !== 'string' || !HEX.test(r.bg)) return null;
  return {
    id: r.id,
    name: r.name.trim().slice(0, 40) || 'Thème',
    group: 'perso',
    fg: r.fg.toLowerCase(),
    bg: r.bg.toLowerCase(),
    ...(typeof r.bg2 === 'string' && HEX.test(r.bg2) ? { bg2: r.bg2.toLowerCase() } : {})
  };
}

function cleanStyle(v: unknown): IconStyle | null {
  const r = (v ?? {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.name !== 'string') return null;
  // on passe par sanitizeDesign pour valider les champs du rendu
  const d = sanitizeDesign({ id: 'style_tmp', ...(r.look as object) });
  if (!d) return null;
  return {
    id: r.id,
    name: r.name.trim().slice(0, 40) || 'Style',
    look: { fg: d.fg, bg: d.bg, bg2: d.bg2, shape: d.shape, gradientAngle: d.gradientAngle, shadow: d.shadow, scale: d.scale, strokeWidth: d.strokeWidth }
  };
}

export function cleanState(raw: unknown): IconLibraryState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const folders = arr(r.folders).map(cleanFolder).filter((f): f is IconFolder => !!f);
  const folderIds = new Set(folders.map((f) => f.id));
  const designs = arr(r.designs)
    .map(sanitizeDesign)
    .filter((d): d is IconDesign => !!d)
    .map((d) => (d.folder && !folderIds.has(d.folder) ? { ...d, folder: null } : d));
  return {
    designs,
    folders,
    themes: arr(r.themes).map(cleanTheme).filter((t): t is IconTheme => !!t),
    styles: arr(r.styles).map(cleanStyle).filter((s): s is IconStyle => !!s),
    recent: arr(r.recent).filter((k): k is string => typeof k === 'string').slice(0, RECENT_MAX)
  };
}

export function createIconsMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let file = '';
  let state: IconLibraryState = emptyState();
  let saveTimer: NodeJS.Timeout | null = null;

  const load = (): void => {
    try {
      state = existsSync(file) ? cleanState(JSON.parse(readFileSync(file, 'utf8'))) : emptyState();
    } catch (err) {
      console.error('[icons] bibliothèque illisible, on repart de zéro', err);
      state = emptyState();
    }
  };

  const writeNow = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, file);
    } catch (err) {
      console.error('[icons] enregistrement impossible', err);
    }
  };

  /** Enregistre (groupé) et prévient toutes les fenêtres. */
  const changed = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 400);
    ctx.broadcast('icons:changed', publicState());
    ctx.events.emit('icons:changed');
  };

  const publicState = (): IconLibraryState & { builtinThemes: IconTheme[] } => ({ ...state, builtinThemes: BUILTIN_THEMES });

  const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i < 0) return [...list, item];
    const copy = list.slice();
    copy[i] = item;
    return copy;
  };

  return {
    id: 'icons',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;
      file = path.join(app.getPath('userData'), 'icons', 'library.json');
      load();

      ipcMain.handle('icons:state', () => publicState());

      ipcMain.handle('icons:saveDesigns', (_e, list: unknown[]) => {
        const clean = (Array.isArray(list) ? list : []).map(sanitizeDesign).filter((d): d is IconDesign => !!d);
        for (const d of clean) state.designs = upsert(state.designs, { ...d, updatedAt: Date.now() });
        changed();
        return clean.map((d) => state.designs.find((x) => x.id === d.id));
      });
      ipcMain.handle('icons:removeDesigns', (_e, ids: string[]) => {
        const set = new Set(Array.isArray(ids) ? ids : []);
        const removed = state.designs.filter((d) => set.has(d.id));
        state.designs = state.designs.filter((d) => !set.has(d.id));
        changed();
        return removed;
      });

      ipcMain.handle('icons:saveFolder', (_e, f: unknown) => {
        const clean = cleanFolder(f);
        if (!clean) return null;
        state.folders = upsert(state.folders, clean);
        changed();
        return clean;
      });
      ipcMain.handle('icons:removeFolder', (_e, id: string) => {
        state.folders = state.folders.filter((f) => f.id !== id);
        state.designs = state.designs.map((d) => (d.folder === id ? { ...d, folder: null } : d));
        changed();
      });

      ipcMain.handle('icons:saveTheme', (_e, t: unknown) => {
        const clean = cleanTheme(t);
        if (!clean) return null;
        state.themes = upsert(state.themes, clean);
        changed();
        return clean;
      });
      ipcMain.handle('icons:removeTheme', (_e, id: string) => {
        state.themes = state.themes.filter((t) => t.id !== id);
        changed();
      });

      ipcMain.handle('icons:saveStyle', (_e, s: unknown) => {
        const clean = cleanStyle(s);
        if (!clean) return null;
        state.styles = upsert(state.styles, clean);
        changed();
        return clean;
      });
      ipcMain.handle('icons:removeStyle', (_e, id: string) => {
        state.styles = state.styles.filter((s) => s.id !== id);
        changed();
      });

      ipcMain.handle('icons:pushRecent', (_e, key: string) => {
        if (typeof key !== 'string' || key.length > 300) return;
        state.recent = [key, ...state.recent.filter((k) => k !== key)].slice(0, RECENT_MAX);
        changed();
      });

      ipcMain.handle('icons:catalog', (_e, lib: SymbolLib, pack?: string) => getCatalog(lib, pack));
      ipcMain.handle('icons:packs', () => listPacks());
      ipcMain.handle('icons:arts', async (_e, refs: unknown[]) => {
        const out: Record<string, SymbolArt | null> = {};
        for (const raw of (Array.isArray(refs) ? refs : []).slice(0, 600)) {
          const ref = sanitizeSymbol(raw);
          if (!ref) continue;
          const key = `${ref.lib}:${ref.pack ? ref.pack + '/' : ''}${ref.name}${ref.weight ? '@' + ref.weight : ''}`;
          out[key] = await getArt(ref);
        }
        return out;
      });

      /** Enregistre des fichiers déjà prêts (PNG en base64, SVG en texte) dans un dossier choisi. */
      ipcMain.handle('icons:exportFiles', async (_e, files: Array<{ name: string; data: string; base64?: boolean }>) => {
        const list = (Array.isArray(files) ? files : []).filter((f) => f && typeof f.name === 'string' && typeof f.data === 'string');
        if (!list.length) return { ok: false, canceled: true };
        const res = await dialog.showOpenDialog({
          title: ctx.i18n.t('icons.exportTitle'),
          properties: ['openDirectory', 'createDirectory']
        });
        if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
        const dir = res.filePaths[0];
        for (const f of list) {
          const name = path.basename(f.name).replace(/[<>:"/\\|?*]/g, '_') || 'icone.png';
          await fs.writeFile(path.join(dir, name), f.base64 ? Buffer.from(f.data, 'base64') : f.data);
        }
        return { ok: true, dir, count: list.length };
      });

      ipcMain.handle('icons:copyImage', (_e, dataUrl: string) => {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return false;
        clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
        return true;
      });

      // Pour le plugin Stream Deck (étape suivante) : la bibliothèque en lecture.
      ctx.registerLocalRoute('GET', /^\/icons\/library$/, () => ({
        designs: state.designs.map((d) => ({ id: d.id, name: d.name, folder: d.folder })),
        folders: state.folders
      }));
    },

    deactivate(): void {
      if (saveTimer) writeNow();
    }
  };
}
