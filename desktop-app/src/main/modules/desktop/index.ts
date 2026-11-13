/**
 * Module « Bureau » (côté main) : zones sur le bureau Windows.
 *
 * Étape 1 du dossier Bureau & Fichiers : zones de raccourcis (vues sur le
 * dossier Bureau, les fichiers ne bougent pas), zones-dossier (contenu d'un
 * vrai dossier, navigation), zone « À trier », dessin d'une zone sur l'écran,
 * déplacement / redimensionnement aimantés, glisser-déposer, menus.
 *
 * Étape 2 : onglets (groupes de zones), repli sur la barre de titre,
 * masquage du bureau (double-clic, automatique, bords d'écran), aperçu
 * au-dessus des fenêtres (raccourci, coin actif) et règles de rangement.
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
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assignItems,
  clampToArea,
  detachTab,
  distribute,
  freeSpot,
  groupOf,
  hostIdOf,
  mergeTab,
  moveTab,
  newZone,
  normalizeSettings,
  normalizeZone,
  renameItem,
  snapRect,
  sortEntries,
  ZONE_COLORS,
  ZONE_TITLE_HEIGHT,
  type DesktopEntry,
  type DesktopSettings,
  type DesktopState,
  type EntryKind,
  type Rect,
  type Rule,
  type Zone,
  type ZoneContent,
  type ZoneIconSize,
  type ZoneKind,
  type ZoneSort,
  type ZoneTab,
  type ZoneView,
  type ZoneWindowMsg
} from '../../../common/desktop';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { desktopDirs, listDesktop, listDir, transfer, watchDirs } from './files';
import { createRulesEngine, type RulesEngine } from './rules';
import { ensureWin32, isKeyDown, setNativeIconsVisible, vkOfAccelerator, watchDesktopClicks, win32Error } from './win32';
import { absoluteBounds, displayFor, DrawOverlays, PeekOverlays, ZoneWindow } from './windows';

const SETTINGS_KEY = 'desktop.settings';
const ZONES_KEY = 'desktop.zones';
const OPENS_KEY = 'desktop.opens';
const PEEK_SHORTCUT_ID = 'desktop.peek';
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
  let rules: RulesEngine;
  /** Zones repliées dépliées pour un moment (survol). */
  const expanded = new Set<string>();
  /** Bureau masqué (double-clic ou masquage automatique). */
  let hidden = false;
  let peek: { mode: 'hold' | 'toggle'; vk: number | null; since: number } | null = null;
  const peekOverlays = new PeekOverlays();
  let lastActivity = Date.now();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Aperçu « tant que je maintiens » : vérifie la touche toutes les 60 ms. */
  let holdTimer: ReturnType<typeof setInterval> | null = null;
  let stopClicks: (() => void) | null = null;
  let cornerArmed = true;
  let mergeTarget: string | null = null;

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
  /** Onglet affiché par une zone hôte (elle-même si pas d'onglet actif valide). */
  const activeOf = (host: Zone): Zone => {
    const a = host.activeTab ? zoneById(host.activeTab) : undefined;
    return a && a.tabOf === host.id ? a : host;
  };
  /** Zone hôte de la fenêtre qui a envoyé le message. */
  const hostOfSender = (e: IpcMainEvent | Electron.IpcMainInvokeEvent): Zone | undefined => {
    const w = windowFor(e.sender.id);
    return w ? zoneById(w.zoneId) : undefined;
  };
  /** Zone affichée (onglet actif) dans la fenêtre qui a envoyé le message. */
  const zoneOfSender = (e: IpcMainEvent | Electron.IpcMainInvokeEvent): Zone | undefined => {
    const host = hostOfSender(e);
    return host ? activeOf(host) : undefined;
  };
  /** Zone du même groupe que la fenêtre émettrice (ou l'onglet actif par défaut). */
  const groupZone = (e: IpcMainEvent | Electron.IpcMainInvokeEvent, id?: unknown): Zone | undefined => {
    const host = hostOfSender(e);
    if (!host) return undefined;
    if (typeof id === 'string') return groupOf(zones, host.id).find((z) => z.id === id);
    return activeOf(host);
  };
  const isHost = (z: Zone): boolean => hostIdOf(zones, z.id) === z.id;
  /** Hauteur de fenêtre : barre de titre seule quand la zone est repliée. */
  const windowBounds = (host: Zone): Rect =>
    absoluteBounds(host, host.rolled && !expanded.has(host.id) && !peek ? ZONE_TITLE_HEIGHT : undefined);

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

  const tabsOf = (host: Zone, dist: Map<string, DesktopEntry[]>): ZoneTab[] =>
    groupOf(zones, host.id).map((z) => ({
      id: z.id,
      title: z.title,
      color: z.color,
      kind: z.kind,
      count: z.kind === 'shortcuts' ? (dist.get(z.id)?.length ?? 0) : (folderCache.get(folderPath(z) ?? '')?.entries.length ?? 0)
    }));

  let lastDist = new Map<string, DesktopEntry[]>();
  const sendAll = (dist = lastDist): void => {
    for (const [id, w] of windows) {
      const host = zoneById(id);
      if (!host) continue;
      const zone = activeOf(host);
      const msg: ZoneWindowMsg = {
        zone,
        host,
        tabs: tabsOf(host, dist),
        content: contentFor(zone, dist),
        settings,
        expanded: expanded.has(host.id),
        peek: !!peek
      };
      w.send(msg);
    }
  };

  const refresh = async (): Promise<void> => {
    desktop = await listDesktop();
    const swept = rules.sweepZones(zones, desktop);
    if (swept) {
      zones = swept;
      saveZones();
      pushState();
    }
    await Promise.all(
      zones
        .filter((z) => z.kind === 'folder' && z.enabled)
        .map((z) => folderPath(z))
        .filter((p): p is string => !!p)
        .map((p) => readFolder(p))
    );
    lastDist = distribute(zones, desktop);
    sendAll(lastDist);
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
    const wanted = new Set(settings.enabled ? zones.filter((z) => z.enabled && isHost(z)).map((z) => z.id) : []);
    for (const [id, w] of windows) {
      if (!wanted.has(id)) {
        w.destroy();
        windows.delete(id);
      }
    }
    for (const z of zones) {
      if (!wanted.has(z.id)) continue;
      const bounds = windowBounds(z);
      let w = windows.get(z.id);
      if (w) w.setBounds(bounds);
      else {
        w = new ZoneWindow(z.id, bounds, () => native);
        windows.set(z.id, w);
      }
      if (peek) w.raise();
      else w.setHidden(hidden && !z.keepOnHide);
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
    zones
      .filter((o) => o.id !== z.id && o.enabled && isHost(o) && o.bounds.displayId === z.bounds.displayId)
      .map((o) => windowBounds(o));

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

  const zoneMenu = (z: Zone, host: Zone, win: BrowserWindow, sendEdit: () => void): MenuItemConstructorOptions[] => {
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
      { label: t('desktop.menu.lock'), type: 'checkbox', checked: z.locked, click: () => patchZone(z.id, { locked: !z.locked }) },
      {
        label: t('desktop.menu.roll'),
        type: 'checkbox',
        checked: host.rolled,
        click: () => setRolled(host.id, !host.rolled)
      },
      {
        label: t('desktop.menu.keepOnHide'),
        type: 'checkbox',
        checked: host.keepOnHide,
        click: () => patchZone(host.id, { keepOnHide: !host.keepOnHide })
      }
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
    const tabs = groupOf(zones, host.id);
    const others = zones.filter((o) => o.enabled && isHost(o) && o.id !== host.id);
    items.push({ type: 'separator' });
    if (tabs.length > 1) items.push({ label: t('desktop.tab.detach'), click: () => detach(z.id) });
    if (others.length > 0) {
      items.push({
        label: t('desktop.menu.mergeInto'),
        submenu: others.map((o) => ({ label: o.title, click: () => setZones(mergeTab(zones, host.id, o.id)) }))
      });
    }
    items.push(
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
      items.push(
        { type: 'separator' },
        {
          label: t('desktop.item.removeFromZone'),
          click: () => {
            rules.forget(path.basename(p));
            setZones(renameItem(zones, path.basename(p), null));
          }
        }
      );
    }
    return items;
  };

  const deleteZone = (id: string): void => {
    const z = zoneById(id);
    if (!z) return;
    nav.delete(id);
    expanded.delete(id);
    // Un hôte d'onglets passe la main à l'onglet suivant avant de disparaître.
    const base = groupOf(zones, id).length > 1 && !z.tabOf ? detachTab(zones, id, z.bounds) : zones;
    // Les icônes d'une zone supprimée retournent dans « À trier » (rien n'est effacé).
    setZones(base.filter((o) => o.id !== id).map((o) => (o.activeTab === id ? { ...o, activeTab: null } : o)));
    ctx.broadcast('desktop:zoneDeleted', zoneById(id) ?? z);
  };

  /* ------------------------------------------------------ onglets */
  const detach = (id: string): void => {
    const z = zoneById(id);
    if (!z) return;
    const host = zoneById(hostIdOf(zones, id));
    const near = host ? windowBounds(host) : null;
    const d = near ? screen.getDisplayNearestPoint({ x: near.x, y: near.y }) : screen.getPrimaryDisplay();
    const others = zones.filter((o) => o.enabled && isHost(o) && o.id !== id).map((o) => windowBounds(o));
    const size = { width: host?.bounds.width ?? 320, height: host?.bounds.height ?? 240 };
    const bounds = toRelative(freeSpot(size, others, d.workArea, Math.max(settings.gap, 12)));
    setZones(detachTab(zones, id, bounds));
  };

  const showTab = (hostId: string, id: string): void => {
    const host = zoneById(hostId);
    if (!host) return;
    patchZone(hostId, { activeTab: id === hostId ? null : id });
  };

  /** Zone hôte dont la barre de titre est sous ce point (hors `except`). */
  const headerAt = (pt: { x: number; y: number }, except: string): string | null => {
    for (const [id, w] of windows) {
      if (id === except) continue;
      const b = w.bounds();
      if (pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + ZONE_TITLE_HEIGHT) return id;
    }
    return null;
  };
  const setMergeTarget = (id: string | null): void => {
    if (id === mergeTarget) return;
    if (mergeTarget) windows.get(mergeTarget)?.emit('desktop:zone:mergeHint', false);
    mergeTarget = id;
    if (id) windows.get(id)?.emit('desktop:zone:mergeHint', true);
  };

  /* ------------------------------------------------------- repli */
  const setRolled = (hostId: string, rolled: boolean): void => {
    expanded.delete(hostId);
    patchZone(hostId, { rolled });
  };
  const setExpanded = (hostId: string, on: boolean): void => {
    const host = zoneById(hostId);
    if (!host || !host.rolled || expanded.has(hostId) === on) return;
    if (on) expanded.add(hostId);
    else expanded.delete(hostId);
    windows.get(hostId)?.setBounds(windowBounds(host));
    sendAll();
  };

  /* --------------------------------------------- masquer / aperçu */
  const touch = (): void => {
    lastActivity = Date.now();
  };
  const applyHidden = (): void => {
    for (const [id, w] of windows) {
      const z = zoneById(id);
      if (peek) continue;
      w.setHidden(hidden && !z?.keepOnHide);
    }
  };
  const setHiddenState = (next: boolean): void => {
    touch();
    if (next === hidden) return;
    hidden = next;
    for (const [id, w] of windows) if (!zoneById(id)?.keepOnHide) w.emit('desktop:zone:fade', next);
    // petit fondu côté page avant de cacher les fenêtres
    setTimeout(applyHidden, next ? 180 : 0);
    if (!next) setTimeout(() => windows.forEach((w) => w.emit('desktop:zone:fade', false)), 30);
    pushState();
  };

  const startPeek = (mode: 'hold' | 'toggle'): void => {
    if (!settings.enabled) return;
    if (peek) {
      // raccourci répété (touche maintenue) : on ignore ; en bascule, on referme
      if (peek.mode === 'toggle' && Date.now() - peek.since > 350) stopPeek();
      return;
    }
    const vk = mode === 'hold' ? vkOfAccelerator(settings.peekShortcut) : null;
    peek = { mode: mode === 'hold' && vk !== null && native ? 'hold' : 'toggle', vk, since: Date.now() };
    peekOverlays.open(peek.mode === 'toggle');
    if (peek.mode === 'hold' && peek.vk !== null) {
      const { vk, since } = peek;
      holdTimer = setInterval(() => {
        if (Date.now() - since > 150 && !isKeyDown(vk)) stopPeek();
      }, 60);
    }
    for (const [id, w] of windows) {
      const host = zoneById(id);
      if (host) w.setBounds(windowBounds(host));
      w.raise();
    }
    sendAll();
    pushState();
  };
  const stopPeek = (): void => {
    if (holdTimer) clearInterval(holdTimer);
    holdTimer = null;
    if (!peek) return;
    peek = null;
    peekOverlays.close();
    for (const [id, w] of windows) {
      w.lower();
      const host = zoneById(id);
      if (host) w.setBounds(windowBounds(host));
    }
    applyHidden();
    sendAll();
    pushState();
  };

  /** Raccourci gardé aussi dans AppSettings.shortcuts (Réglages → Raccourcis). */
  const hostPeekShortcut = (): string | undefined =>
    (ctx.settings.get().shortcuts as Record<string, string | undefined>)[PEEK_SHORTCUT_ID];
  const syncHostShortcut = (): void => {
    if (hostPeekShortcut() === settings.peekShortcut) return;
    const shortcuts = { ...ctx.settings.get().shortcuts, [PEEK_SHORTCUT_ID]: settings.peekShortcut };
    ctx.settings.set({ shortcuts: shortcuts as ReturnType<typeof ctx.settings.get>['shortcuts'] });
  };

  const registerPeekShortcut = (): void => {
    if (settings.enabled && settings.peekShortcut) {
      ctx.shortcuts.register({ id: PEEK_SHORTCUT_ID, accelerator: settings.peekShortcut, run: () => startPeek(settings.peekMode) });
    } else {
      ctx.shortcuts.unregister(PEEK_SHORTCUT_ID);
    }
  };

  const showDesktop = (): void => {
    if (process.platform !== 'win32') return;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(New-Object -ComObject Shell.Application).ToggleDesktop()'], {
      windowsHide: true
    }, () => undefined);
  };

  /** Surveillance légère (250 ms) : touche maintenue, coin actif, bords, inactivité. */
  const poll = (): void => {
    if (!settings.enabled) return;
    const pt = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(pt);
    const b = d.bounds;
    // souris sur une zone = activité
    for (const w of windows.values()) {
      const r = w.bounds();
      if (pt.x >= r.x && pt.x < r.x + r.width && pt.y >= r.y && pt.y < r.y + r.height) {
        touch();
        break;
      }
    }
    if (settings.hotCorner !== 'off') {
      const right = settings.hotCorner.endsWith('right');
      const bottom = settings.hotCorner.startsWith('bottom');
      const cx = right ? b.x + b.width - 1 : b.x;
      const cy = bottom ? b.y + b.height - 1 : b.y;
      const inCorner = Math.abs(pt.x - cx) <= 2 && Math.abs(pt.y - cy) <= 2;
      if (inCorner && cornerArmed) {
        cornerArmed = false;
        if (peek) stopPeek();
        else startPeek('toggle');
      } else if (!inCorner) cornerArmed = true;
    }
    if (hidden && settings.edgeReveal && !peek) {
      const edge = pt.x <= b.x + 1 || pt.y <= b.y + 1 || pt.x >= b.x + b.width - 2 || pt.y >= b.y + b.height - 2;
      if (edge) setHiddenState(false);
    }
    if (!hidden && !peek && settings.autoHideSec > 0 && Date.now() - lastActivity > settings.autoHideSec * 1000) setHiddenState(true);
  };

  /** « Ranger maintenant » : applique toutes les règles actives. */
  const sortNow = async (): Promise<number> => {
    let n = 0;
    for (const r of rules.rules()) if (r.enabled) n += await rules.apply(r.id);
    ctx.broadcast('desktop:rules', { rules: rules.rules(), log: rules.log() });
    return n;
  };

  const startBehaviours = (): void => {
    stopBehaviours();
    if (!settings.enabled) return;
    pollTimer = setInterval(poll, 250);
    // Le crochet souris n'est posé que si une fonction en a besoin.
    if (native && (settings.dblClickHide || settings.autoHideSec > 0 || settings.edgeReveal)) {
      stopClicks = watchDesktopClicks(
        () => {
          touch();
          if (peek) stopPeek();
          else if (hidden && !settings.dblClickHide) setHiddenState(false);
        },
        () => {
          // double-clic sur le bureau vide : seulement si les icônes Windows sont masquées
          // (sinon c'est le double-clic d'ouverture d'une icône Windows).
          if (settings.dblClickHide && iconsHidden && !peek) setHiddenState(!hidden);
        }
      );
    }
  };
  const stopBehaviours = (): void => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    stopClicks?.();
    stopClicks = null;
  };

  /* ---------------------------------------------------- démarrage */
  const start = async (): Promise<void> => {
    native = await ensureWin32();
    // Au cas où une session précédente aurait planté avec les icônes masquées.
    restoreNativeIcons();
    rules.start();
    startBehaviours();
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
      rules = createRulesEngine({
        kvGet,
        kvSet,
        zones: () => zones,
        setZones: (next) => setZones(next),
        desktop: () => desktop,
        onChange: () => scheduleRefresh(0),
        notify: (title, body) => ctx.notify(title, body),
        t
      });
      registerPeekShortcut();
      syncHostShortcut();
      ctx.events.on('settings-changed', () => {
        // raccourci modifié depuis Réglages → Raccourcis : on l'adopte
        const fromHost = hostPeekShortcut();
        if (fromHost === undefined || fromHost === settings.peekShortcut) return;
        settings = normalizeSettings({ ...settings, peekShortcut: fromHost });
        kvSet(SETTINGS_KEY, settings);
        registerPeekShortcut();
        ctx.shortcuts.applyAll();
        pushState();
      });

      ipcMain.handle('desktop:getState', () => state());
      ipcMain.handle('desktop:peek', () => startPeek('toggle'));
      ipcMain.on('desktop:peek:stop', () => stopPeek());
      ipcMain.handle('desktop:toggleHide', () => setHiddenState(!hidden));
      ipcMain.handle('desktop:showDesktop', () => showDesktop());
      ipcMain.handle('desktop:shortcutStatus', () => ctx.shortcuts.status().find((x) => x.id === PEEK_SHORTCUT_ID) ?? null);

      // ---- Règles
      ipcMain.handle('desktop:rules:get', () => ({ rules: rules.rules(), log: rules.log() }));
      ipcMain.handle('desktop:rules:set', (_e, next: Rule[]) => rules.setRules(next));
      ipcMain.handle('desktop:rules:preview', (_e, rule: Rule) => (rule && typeof rule.id === 'string' ? rules.preview(rule) : { count: 0, names: [] }));
      ipcMain.handle('desktop:rules:apply', async (_e, id: string) => {
        const n = await rules.apply(String(id));
        ctx.broadcast('desktop:rules', { rules: rules.rules(), log: rules.log() });
        return n;
      });
      ipcMain.handle('desktop:rules:applyAll', () => sortNow());
      ipcMain.handle('desktop:rules:undo', async (_e, id: string) => {
        const ok = await rules.undo(String(id));
        ctx.broadcast('desktop:rules', { rules: rules.rules(), log: rules.log() });
        return ok;
      });
      ipcMain.handle('desktop:rules:clearLog', () => {
        rules.clearLog();
        ctx.broadcast('desktop:rules', { rules: rules.rules(), log: rules.log() });
      });
      ipcMain.handle('desktop:pickFolder', async () => {
        const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return res.canceled ? null : (res.filePaths[0] ?? null);
      });
      ipcMain.handle('desktop:setSettings', (_e, patch: Partial<DesktopSettings>) => {
        const before = settings;
        settings = normalizeSettings({ ...settings, ...(patch ?? {}) });
        kvSet(SETTINGS_KEY, settings);
        if (!settings.enabled) {
          restoreNativeIcons();
          stopPeek();
          hidden = false;
        }
        if (before.peekShortcut !== settings.peekShortcut || before.enabled !== settings.enabled) {
          registerPeekShortcut();
          syncHostShortcut();
          ctx.shortcuts.applyAll();
        }
        if (
          before.enabled !== settings.enabled ||
          before.dblClickHide !== settings.dblClickHide ||
          before.autoHideSec !== settings.autoHideSec ||
          before.edgeReveal !== settings.edgeReveal
        ) {
          startBehaviours();
        }
        if (hidden && settings.autoHideSec === 0 && !settings.dblClickHide) setHiddenState(false);
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
        touch();
        // Glisser une zone par son titre sur le titre d'une autre : elle devient un onglet.
        const target = mode === 'move' ? headerAt(screen.getCursorScreenPoint(), z.id) : null;
        if (!final) setMergeTarget(target);
        else setMergeTarget(null);
        if (final && target) {
          setZones(mergeTab(zones, z.id, target));
          return;
        }
        const collapsed = z.rolled && !expanded.has(z.id) && !peek;
        const d = screen.getDisplayNearestPoint({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
        let rect = clampToArea(collapsed ? { ...r, height: Math.max(r.height, ZONE_TITLE_HEIGHT) } : r, d.workArea);
        if (settings.snap) rect = clampToArea(snapRect(rect, othersOn(z), d.workArea, { gap: settings.gap, mode }), d.workArea);
        if (collapsed) rect = { ...rect, height: ZONE_TITLE_HEIGHT };
        w.setBounds(rect);
        if (final) {
          const keep = collapsed ? { ...rect, height: z.bounds.height } : rect;
          const rolled = settings.autoRollEdge && mode === 'move' && rect.y <= d.workArea.y + 2 ? true : z.rolled;
          setZones(zones.map((o) => (o.id === z.id ? { ...o, rolled, bounds: toRelative(keep) } : o)));
        }
      });
      ipcMain.on('desktop:zone:expand', (e, on: boolean) => {
        const host = hostOfSender(e);
        if (host) setExpanded(host.id, Boolean(on));
      });
      ipcMain.on('desktop:zone:roll', (e) => {
        const host = hostOfSender(e);
        if (host) setRolled(host.id, !host.rolled);
      });
      ipcMain.on('desktop:zone:activity', () => touch());
      ipcMain.on('desktop:zone:tab', (e, id: string) => {
        const host = hostOfSender(e);
        if (host && groupOf(zones, host.id).some((z) => z.id === id)) showTab(host.id, id);
      });
      ipcMain.on('desktop:zone:tabMenu', (e, id: string) => {
        const w = windowFor(e.sender.id);
        const host = hostOfSender(e);
        const group = host ? groupOf(zones, host.id) : [];
        const z = group.find((o) => o.id === id);
        if (!w || !host || !z) return;
        const i = group.indexOf(z);
        const tpl: MenuItemConstructorOptions[] = [
          { label: t('desktop.tab.show'), click: () => showTab(host.id, z.id) },
          {
            label: t('desktop.menu.rename'),
            click: () => {
              showTab(host.id, z.id);
              e.sender.send('desktop:zone:edit', { type: 'tab', id: z.id });
            }
          },
          { type: 'separator' },
          { label: t('desktop.tab.left'), enabled: i > 1, click: () => setZones(moveTab(zones, z.id, -1)) },
          { label: t('desktop.tab.right'), enabled: i > 0 && i < group.length - 1, click: () => setZones(moveTab(zones, z.id, 1)) },
          { label: t('desktop.tab.detach'), click: () => detach(z.id) },
          { type: 'separator' },
          { label: t('desktop.menu.delete'), click: () => deleteZone(z.id) }
        ];
        Menu.buildFromTemplate(tpl).popup({ window: w.win });
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
      ipcMain.handle('desktop:zone:drop', async (e, paths: string[], copy: boolean, before?: string, tabId?: string) => {
        touch();
        const z = groupZone(e, tabId);
        if (!z || !Array.isArray(paths)) return;
        try {
          await dropInto(z, paths, Boolean(copy), typeof before === 'string' ? before : undefined);
        } catch (err) {
          ctx.notify(t('desktop.dropFailed'), err instanceof Error ? err.message : String(err));
        }
      });
      ipcMain.handle('desktop:zone:rename', (e, title: string, tabId?: string) => {
        const z = groupZone(e, tabId);
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
        const host = hostOfSender(e);
        if (!w || !host) return;
        const z = activeOf(host);
        const tpl =
          target && typeof target.path === 'string'
            ? itemMenu(z, target.path, () => e.sender.send('desktop:zone:edit', { type: 'item', path: target.path }))
            : zoneMenu(z, host, w.win, () => e.sender.send('desktop:zone:edit', { type: 'title' }));
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
      hostCtx.registerLocalCommand('desktop.peek', () => startPeek('toggle'));
      hostCtx.registerLocalCommand('desktop.toggleHide', () => setHiddenState(!hidden));
      hostCtx.registerLocalCommand('desktop.sortNow', async () => {
        await sortNow();
      });
      hostCtx.registerLocalCommand('desktop.showDesktop', () => showDesktop());
      app.on('before-quit', restoreNativeIcons);

      await start();
    },

    trayMenuItems(hostCtx: MainHostContext): MenuItemConstructorOptions[] {
      return [
        {
          label: hostCtx.i18n.t('desktop.tray.title'),
          submenu: [
            { label: hostCtx.i18n.t('desktop.tray.newZone'), click: () => draw.open() },
            { label: hostCtx.i18n.t('desktop.tray.peek'), click: () => startPeek('toggle') },
            { label: hostCtx.i18n.t('desktop.tray.toggleHide'), click: () => setHiddenState(!hidden) },
            { label: hostCtx.i18n.t('desktop.tray.sortNow'), click: () => void sortNow() }
          ]
        }
      ];
    },

    deactivate(): void {
      stopBehaviours();
      stopPeek();
      rules?.stop();
      stopWatch?.();
      for (const w of windows.values()) w.destroy();
      windows.clear();
      draw.close();
      restoreNativeIcons();
    }
  };
}
