/**
 * Module « Bureau » (côté main) : zones sur le bureau Windows.
 *
 * Étape 1 du dossier Bureau & Fichiers : zones de raccourcis (vues sur le
 * dossier Bureau, les fichiers ne bougent pas), zones-dossier (contenu d'un
 * vrai dossier, navigation), zone « À trier », dessin d'une zone sur l'écran,
 * déplacement / redimensionnement aimantés, glisser-déposer, menus.
 */
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  type IpcMainEvent,
  type MenuItemConstructorOptions
} from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assignItems,
  clampToArea,
  distribute,
  freeSpot,
  newZone,
  normalizeSettings,
  normalizeZone,
  renameItem,
  snapRect,
  sortEntries,
  ZONE_COLORS,
  type DesktopEntry,
  type DesktopSettings,
  type DesktopState,
  type EntryKind,
  type Rect,
  type Zone,
  type ZoneContent,
  type ZoneIconSize,
  type ZoneKind,
  type ZoneSort,
  type ZoneView
} from '../../../common/desktop';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { desktopDirs, listDesktop, listDir, transfer, watchDirs } from './files';
import { ensureWin32, setNativeIconsVisible, win32Error } from './win32';
import { absoluteBounds, displayFor, DrawOverlays, ZoneWindow } from './windows';

const SETTINGS_KEY = 'desktop.settings';
const ZONES_KEY = 'desktop.zones';
const OPENS_KEY = 'desktop.opens';
/** Petite image de secours pour un glisser natif (Windows exige une icône). */
const DOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function createDesktopMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let settings: DesktopSettings = normalizeSettings(null);
  let zones: Zone[] = [];
  let opens: Record<string, number> = {};
  let native = false;
  let desktop: DesktopEntry[] = [];
  /** Zone-dossier : dossier affiché après navigation (sinon sa racine). */
  const nav = new Map<string, string>();
  const folderCache = new Map<string, { entries: DesktopEntry[]; error: ZoneContent['error'] }>();
  const windows = new Map<string, ZoneWindow>();
  const draw = new DrawOverlays();
  const iconCache = new Map<string, string | null>();
  let stopWatch: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let iconsHidden = false;

  /* ---------------------------------------------------------- stockage */
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
  const saveZones = (): void => kvSet(ZONES_KEY, zones);
  const t = (key: string, vars?: Record<string, string | number>): string => ctx.i18n.t(key, vars);

  /* ------------------------------------------------------------ état */
  const displaysInfo = (): DesktopState['displays'] => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      label: `${i + 1}`,
      workArea: d.workArea,
      primary: d.id === primary
    }));
  };
  const state = (): DesktopState => ({
    settings,
    zones,
    native,
    nativeError: native ? null : win32Error(),
    displays: displaysInfo()
  });
  const pushState = (): void => ctx.broadcast('desktop:state', state());

  const zoneById = (id: string): Zone | undefined => zones.find((z) => z.id === id);
  const windowFor = (senderId: number): ZoneWindow | undefined => {
    for (const w of windows.values()) if (w.isSender(senderId)) return w;
    return undefined;
  };
  const zoneOfSender = (e: IpcMainEvent | Electron.IpcMainInvokeEvent): Zone | undefined => {
    const w = windowFor(e.sender.id);
    return w ? zoneById(w.zoneId) : undefined;
  };

  const setZones = (next: Zone[], opts: { persist?: boolean } = {}): void => {
    zones = next;
    if (opts.persist !== false) saveZones();
    syncWindows();
    rewatch();
    scheduleRefresh(0);
    pushState();
  };
  const patchZone = (id: string, patch: Partial<Zone>): void => {
    setZones(zones.map((z) => (z.id === id ? normalizeZone({ ...z, ...patch, id }) : z)));
  };

  /* ---------------------------------------------------------- contenu */
  const folderPath = (z: Zone): string | null => (z.kind === 'folder' ? (nav.get(z.id) ?? z.folder) : null);

  const contentFor = (z: Zone, dist: Map<string, DesktopEntry[]>): ZoneContent => {
    if (z.kind === 'shortcuts') {
      const entries = sortEntries(dist.get(z.id) ?? [], z.sort, z.sortDesc, { manual: z.items, opens });
      return { zoneId: z.id, path: null, canGoUp: false, entries, error: null };
    }
    const p = folderPath(z);
    const cached = p ? folderCache.get(p) : undefined;
    const entries = sortEntries(cached?.entries ?? [], z.sort === 'manual' ? 'name' : z.sort, z.sortDesc, { opens });
    const canGoUp = !!p && !!z.folder && path.resolve(p).toLowerCase() !== path.resolve(z.folder).toLowerCase();
    return { zoneId: z.id, path: p, canGoUp, entries, error: p ? (cached?.error ?? null) : 'missing' };
  };

  const readFolder = async (p: string): Promise<void> => {
    try {
      const entries = await listDir(p);
      folderCache.set(p, { entries, error: null });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      folderCache.set(p, { entries: [], error: code === 'ENOENT' ? 'missing' : 'unreachable' });
    }
  };

  const refresh = async (): Promise<void> => {
    desktop = await listDesktop();
    await Promise.all(
      zones
        .filter((z) => z.kind === 'folder' && z.enabled)
        .map((z) => folderPath(z))
        .filter((p): p is string => !!p)
        .map((p) => readFolder(p))
    );
    const dist = distribute(zones, desktop);
    for (const [id, w] of windows) {
      const z = zoneById(id);
      if (z) w.send({ zone: z, content: contentFor(z, dist), settings });
    }
    applyNativeIcons();
  };
  const scheduleRefresh = (delay = 120): void => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, delay);
  };

  const rewatch = (): void => {
    stopWatch?.();
    const dirs = new Set(desktopDirs());
    for (const z of zones) {
      const p = z.enabled ? folderPath(z) : null;
      if (p) dirs.add(p);
    }
    stopWatch = settings.enabled ? watchDirs([...dirs], () => scheduleRefresh(0)) : null;
  };

  /* ------------------------------------------------------- fenêtres */
  const syncWindows = (): void => {
    const wanted = new Set(settings.enabled ? zones.filter((z) => z.enabled).map((z) => z.id) : []);
    for (const [id, w] of windows) {
      if (!wanted.has(id)) {
        w.destroy();
        windows.delete(id);
      }
    }
    for (const z of zones) {
      if (!wanted.has(z.id)) continue;
      const bounds = absoluteBounds(z);
      const w = windows.get(z.id);
      if (w) w.setBounds(bounds);
      else windows.set(z.id, new ZoneWindow(z.id, bounds, () => native));
    }
  };

  /** Icônes Windows masquées seulement si une zone « À trier » active recueille le reste. */
  const applyNativeIcons = (): void => {
    if (!native) return;
    const hide =
      settings.enabled && settings.hideNativeIcons && zones.some((z) => z.enabled && z.kind === 'shortcuts' && z.inbox);
    if (hide !== iconsHidden) {
      if (setNativeIconsVisible(!hide)) iconsHidden = hide;
    }
  };
  const restoreNativeIcons = (): void => {
    if (native) setNativeIconsVisible(true);
    iconsHidden = false;
  };

  /* ---------------------------------------------------- géométrie */
  const othersOn = (z: Zone): Rect[] =>
    zones.filter((o) => o.id !== z.id && o.enabled && o.bounds.displayId === z.bounds.displayId).map((o) => absoluteBounds(o));

  /** Rectangle absolu → bornes relatives à l'écran le plus proche de son centre. */
  const toRelative = (r: Rect): Zone['bounds'] => {
    const d = screen.getDisplayNearestPoint({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    const c = clampToArea(r, d.workArea);
    return { displayId: String(d.id), x: c.x - d.workArea.x, y: c.y - d.workArea.y, width: c.width, height: c.height };
  };

  const placeNew = (displayId: string | null, size = { width: 320, height: 240 }): Zone['bounds'] => {
    const d = displayId ? displayFor(displayId) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const others = zones.filter((o) => o.enabled && o.bounds.displayId === String(d.id)).map((o) => absoluteBounds(o));
    return toRelative(freeSpot(size, others, d.workArea, Math.max(settings.gap, 12)));
  };

  /* ------------------------------------------------------ création */
  const ensureInbox = (list: Zone[], displayId: string): Zone[] => {
    if (list.some((z) => z.kind === 'shortcuts' && z.inbox)) return list;
    const d = displayFor(displayId);
    const others = list.filter((o) => o.bounds.displayId === String(d.id)).map((o) => absoluteBounds(o));
    const r = freeSpot({ width: 320, height: 220 }, others, d.workArea, Math.max(settings.gap, 12));
    const inbox = newZone(randomUUID(), 'shortcuts', t('desktop.zone.inbox'), toRelative(r), { inbox: true });
    return [...list, inbox];
  };

  const createZone = async (
    kind: ZoneKind,
    bounds: Zone['bounds'] | null,
    opts: { title?: string; folder?: string | null } = {}
  ): Promise<Zone | null> => {
    let folder = opts.folder ?? null;
    if (kind === 'folder' && !folder) {
      const res = await dialog.showOpenDialog({ title: t('desktop.pickFolder'), properties: ['openDirectory'] });
      if (res.canceled || !res.filePaths[0]) return null;
      folder = res.filePaths[0];
    }
    const b = bounds ?? placeNew(null);
    const title =
      opts.title ?? (kind === 'folder' && folder ? path.basename(folder) || folder : t('desktop.zone.newTitle', { n: zones.length + 1 }));
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
    const zone = newZone(randomUUID(), kind, title, b, { folder, color });
    let next = [...zones, zone];
    if (kind === 'shortcuts') next = ensureInbox(next, b.displayId);
    setZones(next);
    return zone;
  };

  /** Rangement de départ : Programmes, Dossiers, Documents, Images + « À trier ». */
  const starterLayout = async (): Promise<void> => {
    desktop = await listDesktop();
    const groups: Array<[string, (k: EntryKind) => boolean]> = [
      ['desktop.starter.apps', (k) => k === 'shortcut' || k === 'app'],
      ['desktop.starter.folders', (k) => k === 'folder'],
      ['desktop.starter.docs', (k) => ['pdf', 'doc', 'sheet', 'slides', 'text'].includes(k)],
      ['desktop.starter.images', (k) => ['image', 'video', 'audio'].includes(k)]
    ];
    const d = screen.getPrimaryDisplay();
    const next: Zone[] = [...zones];
    const placed = (): Rect[] => next.filter((o) => o.bounds.displayId === String(d.id)).map((o) => absoluteBounds(o));
    const taken = new Set(zones.flatMap((z) => z.items));
    for (const [key, test] of groups) {
      const items = desktop.filter((e) => test(e.kind) && !taken.has(e.name)).map((e) => e.name);
      if (items.length === 0) continue;
      items.forEach((n) => taken.add(n));
      const r = freeSpot({ width: 320, height: 230 }, placed(), d.workArea, Math.max(settings.gap, 12));
      next.push(
        newZone(randomUUID(), 'shortcuts', t(key), toRelative(r), {
          items,
          color: ZONE_COLORS[next.length % ZONE_COLORS.length]
        })
      );
    }
    setZones(ensureInbox(next, String(d.id)));
  };

  /* ----------------------------------------------------- dépôts */
  const userDesktop = (): string => desktopDirs()[0];
  const inDesktop = (p: string): boolean =>
    desktopDirs().some((d) => path.resolve(path.dirname(p)).toLowerCase() === path.resolve(d).toLowerCase());

  const dropInto = async (z: Zone, paths: string[], copy: boolean, before?: string): Promise<void> => {
    const valid = paths.filter((p) => typeof p === 'string' && fs.existsSync(p));
    if (valid.length === 0) return;
    if (z.kind === 'folder') {
      const dir = folderPath(z);
      if (!dir) return;
      await transfer(valid, dir, copy);
    } else {
      const local = valid.filter((p) => inDesktop(p) && !copy).map((p) => path.basename(p));
      const outside = valid.filter((p) => !inDesktop(p) || copy);
      const moved = outside.length ? await transfer(outside, userDesktop(), copy) : [];
      setZones(assignItems(zones, z.id, [...local, ...moved], before));
    }
    scheduleRefresh(0);
  };

  /* ----------------------------------------------------- icônes */
  const iconFor = async (p: string, size: 'small' | 'normal' | 'large'): Promise<string | null> => {
    const key = `${size}|${p}`;
    if (iconCache.has(key)) return iconCache.get(key) ?? null;
    let url: string | null = null;
    try {
      if (size === 'large') {
        // Vignette Windows (images, vidéos, PDF…) plus nette que l'icône 32 px.
        const thumb = await nativeImage.createThumbnailFromPath(p, { width: 96, height: 96 }).catch(() => null);
        if (thumb && !thumb.isEmpty()) url = thumb.toDataURL();
      }
      if (!url) {
        const img = await app.getFileIcon(p, { size: size === 'small' ? 'small' : 'large' });
        url = img.isEmpty() ? null : img.toDataURL();
      }
    } catch {
      url = null;
    }
    if (iconCache.size > 3000) iconCache.clear();
    iconCache.set(key, url);
    return url;
  };

  /* ------------------------------------------------------ menus */
  const openEntry = async (z: Zone | undefined, p: string): Promise<void> => {
    opens[p] = (opens[p] ?? 0) + 1;
    kvSet(OPENS_KEY, opens);
    const isDir = fs.existsSync(p) && fs.statSync(p).isDirectory();
    if (z && z.kind === 'folder' && z.navigate && isDir) {
      nav.set(z.id, p);
      rewatch();
      scheduleRefresh(0);
      return;
    }
    const err = await shell.openPath(p);
    if (err) ctx.notify(t('desktop.openFailed'), err);
  };

  const zoneMenu = (z: Zone, win: BrowserWindow, sendEdit: () => void): MenuItemConstructorOptions[] => {
    const radio = <T extends string>(labelKey: string, current: T, values: T[], field: keyof Zone): MenuItemConstructorOptions => ({
      label: t(labelKey),
      submenu: values.map((v) => ({
        label: t(`${labelKey}.${v}`),
        type: 'radio',
        checked: current === v,
        click: () => patchZone(z.id, { [field]: v } as Partial<Zone>)
      }))
    });
    const sorts: ZoneSort[] = z.kind === 'folder' ? ['name', 'type', 'size', 'date', 'opens'] : ['manual', 'name', 'type', 'size', 'date', 'opens'];
    const items: MenuItemConstructorOptions[] = [
      radio<ZoneView>('desktop.menu.view', z.view, ['icons', 'list', 'details'], 'view'),
      {
        label: t('desktop.menu.sort'),
        submenu: [
          ...sorts.map((v) => ({
            label: t(`desktop.menu.sort.${v}`),
            type: 'radio' as const,
            checked: z.sort === v,
            click: () => patchZone(z.id, { sort: v })
          })),
          { type: 'separator' as const },
          { label: t('desktop.menu.sortDesc'), type: 'checkbox' as const, checked: z.sortDesc, click: () => patchZone(z.id, { sortDesc: !z.sortDesc }) }
        ]
      },
      radio<ZoneIconSize>('desktop.menu.iconSize', z.iconSize, ['small', 'medium', 'large'], 'iconSize'),
      {
        label: t('desktop.menu.color'),
        submenu: [
          { label: t('desktop.menu.color.accent'), type: 'radio', checked: z.color === null, click: () => patchZone(z.id, { color: null }) },
          ...ZONE_COLORS.map((c, i) => ({
            label: t(`desktop.color.${i}`),
            type: 'radio' as const,
            checked: z.color === c,
            click: () => patchZone(z.id, { color: c })
          }))
        ]
      },
      { type: 'separator' },
      { label: t('desktop.menu.rename'), click: sendEdit },
      { label: t('desktop.menu.lock'), type: 'checkbox', checked: z.locked, click: () => patchZone(z.id, { locked: !z.locked }) }
    ];
    if (z.kind === 'shortcuts') {
      items.push({
        label: t('desktop.menu.inbox'),
        type: 'checkbox',
        checked: z.inbox,
        click: () => setZones(zones.map((o) => (o.kind === 'shortcuts' ? { ...o, inbox: o.id === z.id ? !z.inbox : false } : o)))
      });
    } else {
      items.push(
        { label: t('desktop.menu.navigate'), type: 'checkbox', checked: z.navigate, click: () => patchZone(z.id, { navigate: !z.navigate }) },
        { label: t('desktop.menu.openFolder'), click: () => void shell.openPath(folderPath(z) ?? z.folder ?? '') },
        {
          label: t('desktop.menu.changeFolder'),
          click: async () => {
            const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: z.folder ?? undefined });
            if (res.canceled || !res.filePaths[0]) return;
            nav.delete(z.id);
            patchZone(z.id, { folder: res.filePaths[0] });
          }
        }
      );
    }
    items.push(
      { type: 'separator' },
      { label: t('desktop.menu.newZone'), click: () => draw.open() },
      { label: t('desktop.menu.settings'), click: () => ctx.showMainWindow({ view: 'tool', toolId: 'desktop' }) },
      { type: 'separator' },
      { label: t('desktop.menu.delete'), click: () => deleteZone(z.id) }
    );
    return items;
  };

  const itemMenu = (z: Zone, p: string, sendRename: () => void): MenuItemConstructorOptions[] => {
    const items: MenuItemConstructorOptions[] = [
      { label: t('desktop.item.open'), click: () => void openEntry(z, p) },
      { label: t('desktop.item.reveal'), click: () => shell.showItemInFolder(p) },
      { label: t('desktop.item.copyPath'), click: () => clipboard.writeText(p) },
      { type: 'separator' },
      { label: t('desktop.item.rename'), click: sendRename },
      {
        label: t('desktop.item.trash'),
        click: async () => {
          try {
            await shell.trashItem(p);
            setZones(renameItem(zones, path.basename(p), null));
          } catch (err) {
            ctx.notify(t('desktop.trashFailed'), err instanceof Error ? err.message : String(err));
          }
        }
      }
    ];
    if (z.kind === 'shortcuts' && !z.inbox && z.items.includes(path.basename(p))) {
      items.push({ type: 'separator' }, { label: t('desktop.item.removeFromZone'), click: () => setZones(renameItem(zones, path.basename(p), null)) });
    }
    return items;
  };

  const deleteZone = (id: string): void => {
    const z = zoneById(id);
    if (!z) return;
    nav.delete(id);
    // Les icônes d'une zone supprimée retournent dans « À trier » (rien n'est effacé).
    setZones(zones.filter((o) => o.id !== id));
    ctx.broadcast('desktop:zoneDeleted', z);
  };

  /* ---------------------------------------------------- démarrage */
  const start = async (): Promise<void> => {
    native = await ensureWin32();
    // Au cas où une session précédente aurait planté avec les icônes masquées.
    restoreNativeIcons();
    rewatch();
    syncWindows();
    await refresh();
  };

  return {
    id: 'desktop',

    async activate(hostCtx: MainHostContext): Promise<void> {
      ctx = hostCtx;
      settings = normalizeSettings(kvGet<Partial<DesktopSettings> | null>(SETTINGS_KEY, null));
      zones = kvGet<Array<Partial<Zone> & { id: string }>>(ZONES_KEY, [])
        .filter((z) => z && typeof z.id === 'string')
        .map(normalizeZone);
      opens = kvGet<Record<string, number>>(OPENS_KEY, {});

      ipcMain.handle('desktop:getState', () => state());
      ipcMain.handle('desktop:setSettings', (_e, patch: Partial<DesktopSettings>) => {
        settings = normalizeSettings({ ...settings, ...(patch ?? {}) });
        kvSet(SETTINGS_KEY, settings);
        if (!settings.enabled) restoreNativeIcons();
        syncWindows();
        rewatch();
        scheduleRefresh(0);
        pushState();
        return state();
      });
      ipcMain.handle('desktop:createZone', (_e, kind: ZoneKind) => createZone(kind === 'folder' ? 'folder' : 'shortcuts', null));
      ipcMain.handle('desktop:draw', () => draw.open());
      ipcMain.handle('desktop:starter', () => starterLayout());
      ipcMain.handle('desktop:updateZone', (_e, id: string, patch: Partial<Zone>) => {
        if (typeof id === 'string' && zoneById(id) && patch && typeof patch === 'object') {
          const { id: _ignored, ...rest } = patch;
          patchZone(id, rest);
        }
        return state();
      });
      ipcMain.handle('desktop:deleteZone', (_e, id: string) => deleteZone(id));
      ipcMain.handle('desktop:restoreZone', (_e, zone: Zone) => {
        if (zone && typeof zone.id === 'string' && !zoneById(zone.id)) setZones([...zones, normalizeZone(zone)]);
        return state();
      });
      ipcMain.handle('desktop:icon', (_e, p: string, size: 'small' | 'normal' | 'large') =>
        typeof p === 'string' ? iconFor(p, size === 'large' || size === 'small' ? size : 'normal') : null
      );

      // ---- Fenêtre d'une zone
      ipcMain.handle('desktop:zone:hello', (e) => windowFor(e.sender.id)?.current() ?? null);
      ipcMain.on('desktop:zone:bounds', (e, r: Rect, final: boolean, mode: 'move' | 'resize') => {
        const w = windowFor(e.sender.id);
        const z = w ? zoneById(w.zoneId) : undefined;
        if (!w || !z || z.locked || !r || ![r.x, r.y, r.width, r.height].every(Number.isFinite)) return;
        const d = screen.getDisplayNearestPoint({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
        let rect = clampToArea(r, d.workArea);
        if (settings.snap) rect = clampToArea(snapRect(rect, othersOn(z), d.workArea, { gap: settings.gap, mode }), d.workArea);
        w.setBounds(rect);
        if (final) setZones(zones.map((o) => (o.id === z.id ? { ...o, bounds: toRelative(rect) } : o)));
      });
      ipcMain.handle('desktop:zone:open', async (e, p: string) => {
        if (typeof p === 'string') await openEntry(zoneOfSender(e), p);
      });
      ipcMain.handle('desktop:zone:up', (e) => {
        const z = zoneOfSender(e);
        const p = z ? folderPath(z) : null;
        if (!z || !p || !z.folder) return;
        const parent = path.dirname(p);
        if (path.resolve(p).toLowerCase() === path.resolve(z.folder).toLowerCase()) return;
        nav.set(z.id, parent);
        rewatch();
        scheduleRefresh(0);
      });
      ipcMain.handle('desktop:zone:home', (e) => {
        const z = zoneOfSender(e);
        if (!z) return;
        nav.delete(z.id);
        rewatch();
        scheduleRefresh(0);
      });
      ipcMain.handle('desktop:zone:drop', async (e, paths: string[], copy: boolean, before?: string) => {
        const z = zoneOfSender(e);
        if (!z || !Array.isArray(paths)) return;
        try {
          await dropInto(z, paths, Boolean(copy), typeof before === 'string' ? before : undefined);
        } catch (err) {
          ctx.notify(t('desktop.dropFailed'), err instanceof Error ? err.message : String(err));
        }
      });
      ipcMain.handle('desktop:zone:rename', (e, title: string) => {
        const z = zoneOfSender(e);
        if (z && typeof title === 'string' && title.trim()) patchZone(z.id, { title: title.trim().slice(0, 80) });
      });
      ipcMain.handle('desktop:zone:renameItem', async (e, p: string, name: string) => {
        const z = zoneOfSender(e);
        if (!z || typeof p !== 'string' || typeof name !== 'string') return false;
        const clean = name.trim();
        if (!clean || /[\\/:*?"<>|]/.test(clean)) return false;
        const dest = path.join(path.dirname(p), clean);
        if (dest === p) return true;
        if (fs.existsSync(dest)) return false;
        try {
          await fs.promises.rename(p, dest);
          if (inDesktop(p)) setZones(renameItem(zones, path.basename(p), clean));
          scheduleRefresh(0);
          return true;
        } catch {
          return false;
        }
      });
      ipcMain.on('desktop:zone:startDrag', (e, paths: string[]) => {
        const files = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && fs.existsSync(p));
        if (files.length === 0) return;
        const cached = iconCache.get(`large|${files[0]}`) ?? iconCache.get(`normal|${files[0]}`) ?? iconCache.get(`small|${files[0]}`);
        let icon = nativeImage.createFromDataURL(cached ?? DOT_PNG);
        if (icon.isEmpty()) icon = nativeImage.createFromDataURL(DOT_PNG);
        if (icon.getSize().width > 64) icon = icon.resize({ width: 64 });
        e.sender.startDrag({ files, icon } as Electron.Item);
      });
      ipcMain.on('desktop:zone:menu', (e, target: { path?: string } | null) => {
        const w = windowFor(e.sender.id);
        const z = w ? zoneById(w.zoneId) : undefined;
        if (!w || !z) return;
        const tpl =
          target && typeof target.path === 'string'
            ? itemMenu(z, target.path, () => e.sender.send('desktop:zone:edit', { type: 'item', path: target.path }))
            : zoneMenu(z, w.win, () => e.sender.send('desktop:zone:edit', { type: 'title' }));
        Menu.buildFromTemplate(tpl).popup({ window: w.win });
      });

      // ---- Calque de dessin
      ipcMain.on('desktop:draw:done', (_e, payload: { displayId: string; rect: Rect; kind: ZoneKind } | null) => {
        draw.close();
        if (!payload || !payload.rect) return;
        const d = displayFor(String(payload.displayId));
        const r = payload.rect;
        const abs = { x: d.bounds.x + r.x, y: d.bounds.y + r.y, width: r.width, height: r.height };
        void createZone(payload.kind === 'folder' ? 'folder' : 'shortcuts', toRelative(clampToArea(abs, d.workArea)));
      });
      ipcMain.on('desktop:draw:cancel', () => draw.close());

      const onDisplays = (): void => {
        syncWindows();
        pushState();
      };
      screen.on('display-added', onDisplays);
      screen.on('display-removed', onDisplays);
      screen.on('display-metrics-changed', onDisplays);

      hostCtx.registerLocalCommand('desktop.newZone', () => draw.open());
      app.on('before-quit', restoreNativeIcons);

      await start();
    },

    trayMenuItems(hostCtx: MainHostContext): MenuItemConstructorOptions[] {
      return [{ label: hostCtx.i18n.t('desktop.tray.newZone'), click: () => draw.open() }];
    },

    deactivate(): void {
      stopWatch?.();
      for (const w of windows.values()) w.destroy();
      windows.clear();
      draw.close();
      restoreNativeIcons();
    }
  };
}
