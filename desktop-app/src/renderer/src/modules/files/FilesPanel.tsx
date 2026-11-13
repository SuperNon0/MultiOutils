import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { formatSize, type EntryKind, type ZoneSort } from '../../../../common/desktop';
import { applyFilters, type FileEntry, type FileJob, type FilePlace, type SearchFilters } from '../../../../common/files';
import { ui, type MenuItem } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { FilePane, type PaneHandlers } from './FilePane';
import { BatchRenameSheet, CleanView, DupsView, JobsBar, PreviewSheet, TagsSheet, TrashView, UsageView } from './FilesTools';
import { baseName, crumbs, freeName, joinPath, parentPath } from './paths';
import './files.css';

type Tool = 'dups' | 'usage' | 'clean' | 'trash';

interface Tab {
  id: string;
  path: string;
  back: string[];
  fwd: string[];
  view: 'grid' | 'list';
  sort: ZoneSort;
  desc: boolean;
  tool: Tool | null;
}

interface Search {
  text: string;
  results: FileEntry[] | null;
  filters: SearchFilters;
}

const uid = (): string => Math.random().toString(36).slice(2, 10);
const newTab = (path: string, from?: Tab): Tab => ({
  id: uid(),
  path,
  back: [],
  fwd: [],
  view: from?.view ?? 'list',
  sort: from?.sort ?? 'name',
  desc: from?.desc ?? false,
  tool: null
});

const STORE = 'files.ui';
interface Saved {
  tabs: Tab[];
  active: string;
  split: boolean;
  right: Tab | null;
  hidden: boolean;
}
function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!Array.isArray(s.tabs) || s.tabs.length === 0) return null;
    return s;
  } catch {
    return null;
  }
}
function save(s: Saved): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // stockage indisponible : on garde l'état en mémoire
  }
}

const KIND_GROUPS: Array<{ id: string; kinds: EntryKind[] }> = [
  { id: 'folder', kinds: ['folder'] },
  { id: 'image', kinds: ['image'] },
  { id: 'video', kinds: ['video'] },
  { id: 'audio', kinds: ['audio'] },
  { id: 'doc', kinds: ['doc', 'pdf', 'sheet', 'slides', 'text'] },
  { id: 'archive', kinds: ['archive'] },
  { id: 'app', kinds: ['app', 'shortcut'] },
  { id: 'code', kinds: ['code'] }
];

/** Presse-papiers interne (Ctrl+C / Ctrl+X / Ctrl+V), partagé entre les volets. */
interface Clip {
  paths: string[];
  cut: boolean;
}

/* ===================================================================== */
export function FilesPanel(): ReactNode {
  const { t } = useI18n();
  const saved = useMemo(loadSaved, []);
  const [tabs, setTabs] = useState<Tab[]>(saved?.tabs ?? []);
  const [active, setActive] = useState<string>(saved?.active ?? '');
  const [split, setSplit] = useState<boolean>(saved?.split ?? false);
  const [right, setRight] = useState<Tab | null>(saved?.right ?? null);
  const [hidden, setHidden] = useState<boolean>(saved?.hidden ?? false);
  const [focus, setFocus] = useState<'left' | 'right'>('left');
  const [places, setPlaces] = useState<{ places: FilePlace[]; zones: FilePlace[] } | null>(null);
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [tick, setTick] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const doneJobs = useRef(new Set<string>());

  const loadPlaces = useCallback(() => void window.api.fm.places().then(setPlaces), []);
  useEffect(() => {
    loadPlaces();
    void window.api.fm.tags().then(setTags);
    void window.api.fm.jobs().then(setJobs);
    return window.api.fm.onJobs((list) => {
      setJobs(list);
      // un transfert terminé : les dossiers affichés ont changé
      let changed = false;
      for (const j of list)
        if (j.state !== 'running' && j.state !== 'paused' && !doneJobs.current.has(j.id)) {
          doneJobs.current.add(j.id);
          changed = true;
        }
      if (changed) setTick((n) => n + 1);
    });
  }, [loadPlaces]);

  const home = places?.places.find((p) => p.id === 'home')?.path ?? '';
  // premier lancement : un onglet sur le dossier personnel
  useEffect(() => {
    if (!home) return;
    if (tabs.length === 0) {
      const tb = newTab(home);
      setTabs([tb]);
      setActive(tb.id);
    }
    if (!right) setRight(newTab(home));
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tabs.length) save({ tabs, active, split, right, hidden });
  }, [tabs, active, split, right, hidden]);

  const cur = tabs.find((x) => x.id === active) ?? tabs[0];
  const setCur = (tb: Tab): void => setTabs((all) => all.map((x) => (x.id === tb.id ? tb : x)));

  const openTab = (path: string): void => {
    const tb = newTab(path, cur);
    setTabs((all) => [...all, tb]);
    setActive(tb.id);
    setFocus('left');
  };
  const closeTab = (id: string): void => {
    if (tabs.length === 1) return;
    const i = tabs.findIndex((x) => x.id === id);
    const rest = tabs.filter((x) => x.id !== id);
    setTabs(rest);
    if (id === active) setActive(rest[Math.max(0, i - 1)].id);
  };

  const addFavorite = async (path: string): Promise<void> => {
    const favs = (places?.places ?? []).filter((p) => p.type === 'fav').map((p) => p.path);
    if (favs.includes(path)) return;
    await window.api.fm.setFavorites([...favs, path]);
    loadPlaces();
    ui.toast(t('files.fav.added'));
  };
  const removeFavorite = async (path: string): Promise<void> => {
    const favs = (places?.places ?? []).filter((p) => p.type === 'fav').map((p) => p.path);
    await window.api.fm.setFavorites(favs.filter((f) => f !== path));
    loadPlaces();
  };

  const navigateFocused = (path: string): void => {
    if (focus === 'right' && split && right) setRight(go(right, path));
    else if (cur) setCur(go(cur, path));
  };

  if (!cur || !places) return <p className="muted">…</p>;

  const shared = {
    places,
    tags,
    setTags,
    tick,
    refresh: () => setTick((n) => n + 1),
    clip,
    setClip,
    hidden,
    openTab,
    addFavorite
  };

  return (
    <div className="fm">
      <div className="page-h">
        <h1 className="page-t">{t('files.title')}</h1>
        <button className={`btn sm${hidden ? ' on' : ''}`} aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
          <Icon name="eye" size={16} />
          {t('files.hidden')}
        </button>
        <button className={`btn sm${split ? ' on' : ''}`} aria-pressed={split} onClick={() => setSplit(!split)}>
          <Icon name="layers" size={16} />
          {t('files.split')}
        </button>
      </div>
      <div className="fm-body">
        <Sidebar places={places} current={focus === 'right' && split && right ? right.path : cur.path} onGo={navigateFocused} onFavRemove={(p) => void removeFavorite(p)} onDropped={shared.refresh} />
        <div className={`fm-main${split ? ' duo' : ''}`}>
          <div className={`fm-col${focus === 'left' ? ' focus' : ''}`} onMouseDownCapture={() => setFocus('left')} onFocusCapture={() => setFocus('left')}>
            <div className="fm-tabs" role="tablist">
              {tabs.map((tb) => (
                <div key={tb.id} role="tab" aria-selected={tb.id === cur.id} className={`fm-tab${tb.id === cur.id ? ' on' : ''}`} onClick={() => setActive(tb.id)} onAuxClick={(e) => e.button === 1 && closeTab(tb.id)} title={tb.path}>
                  <Icon name={tb.tool ? 'wrench' : 'folder'} size={14} />
                  <span>{tb.tool ? t(`files.tool.${tb.tool}`) : baseName(tb.path) || tb.path}</span>
                  {tabs.length > 1 && (
                    <button
                      className="fm-tabx"
                      aria-label={t('files.tab.close')}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tb.id);
                      }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button className="fm-tabn" aria-label={t('files.tab.new')} title={t('files.tab.new')} onClick={() => openTab(cur.path)}>
                <Icon name="plus" size={14} />
              </button>
            </div>
            <Browser key={cur.id} tab={cur} onTab={setCur} other={split ? right?.path ?? null : null} closeTab={() => closeTab(cur.id)} {...shared} />
          </div>
          {split && right && (
            <div className={`fm-col${focus === 'right' ? ' focus' : ''}`} onMouseDownCapture={() => setFocus('right')} onFocusCapture={() => setFocus('right')}>
              <Browser key={right.id} tab={right} onTab={setRight} other={cur.path} {...shared} />
            </div>
          )}
        </div>
      </div>
      <JobsBar jobs={jobs} />
    </div>
  );
}

function go(tb: Tab, path: string): Tab {
  if (path === tb.path && !tb.tool) return tb;
  return { ...tb, path, back: [...tb.back, tb.path].slice(-50), fwd: [], tool: null };
}

/* ================================================================ barre */
function Sidebar({
  places,
  current,
  onGo,
  onFavRemove,
  onDropped
}: {
  places: { places: FilePlace[]; zones: FilePlace[] };
  current: string;
  onGo(p: string): void;
  onFavRemove(p: string): void;
  onDropped(): void;
}): ReactNode {
  const { t, lang } = useI18n();
  const [over, setOver] = useState<string | null>(null);
  const label = (p: FilePlace): string => (p.type === 'quick' ? t(`files.place.${p.id}`) : p.label);

  const dropProps = (p: FilePlace) => ({
    onDragOver: (e: ReactDragEvent) => {
      if (!e.dataTransfer.types.includes('Files') || (!p.path && !p.zoneId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      setOver(p.id);
    },
    onDragLeave: () => setOver(null),
    onDrop: async (e: ReactDragEvent) => {
      setOver(null);
      e.preventDefault();
      const paths = window.api.files.pathsFor([...e.dataTransfer.files]);
      if (!paths.length) return;
      if (p.zoneId) {
        if (await window.api.desktop.dropToZone(p.zoneId, paths, e.ctrlKey)) ui.toast(t('files.zone.dropped', { name: p.label }));
      } else if (p.path) {
        await window.api.fm.transfer(paths, p.path, e.ctrlKey);
      }
      onDropped();
    }
  });

  const item = (p: FilePlace, tree: boolean): ReactNode => (
    <div key={p.id}>
      <div
        className={`fm-pl${current === p.path ? ' on' : ''}${over === p.id ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        title={p.path || p.label}
        onClick={() => p.path && onGo(p.path)}
        onKeyDown={(e) => e.key === 'Enter' && p.path && onGo(p.path)}
        onContextMenu={(e) => {
          if (p.type !== 'fav') return;
          e.preventDefault();
          ui.menu({ x: e.clientX, y: e.clientY }, [{ icone: 'x', texte: t('files.fav.remove'), action: () => onFavRemove(p.path) }]);
        }}
        {...dropProps(p)}
      >
        {tree && p.path ? <TreeToggle path={p.path} current={current} onGo={onGo} /> : <span className="fm-tw" />}
        <Icon name={p.icon} size={16} />
        <span className="fm-pl-n">{label(p)}</span>
        {p.type === 'drive' && p.total ? <span className="fm-pl-s">{formatSize(p.free ?? 0, lang)}</span> : null}
      </div>
      {p.type === 'drive' && p.total ? (
        <span className="fm-pl-bar">
          <i style={{ width: `${Math.round((1 - (p.free ?? 0) / p.total) * 100)}%` }} />
        </span>
      ) : null}
    </div>
  );

  const group = (title: string, list: FilePlace[], tree = false): ReactNode =>
    list.length ? (
      <div className="fm-grp">
        <div className="lbl-mono">{title}</div>
        {list.map((p) => item(p, tree))}
      </div>
    ) : null;

  return (
    <nav className="fm-side" aria-label={t('files.places')}>
      {group(t('files.side.quick'), places.places.filter((p) => p.type === 'quick'))}
      {group(t('files.side.favs'), places.places.filter((p) => p.type === 'fav'), true)}
      {group(t('files.side.drives'), places.places.filter((p) => p.type === 'drive'), true)}
      {group(t('files.side.zones'), places.zones)}
    </nav>
  );
}

/** Arborescence paresseuse : les sous-dossiers ne sont lus qu'à l'ouverture. */
function TreeToggle({ path, current, onGo }: { path: string; current: string; onGo(p: string): void }): ReactNode {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    if (open && !kids) void window.api.fm.children(path).then(setKids);
  }, [open, kids, path]);
  return (
    <>
      <button
        className="fm-tw"
        aria-expanded={open}
        aria-label={path}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <Icon name={open ? 'chevd' : 'chev'} size={12} />
      </button>
      {open && kids && (
        <div className="fm-tree" onClick={(e) => e.stopPropagation()}>
          {kids.slice(0, 200).map((k) => (
            <div key={k.path}>
              <div className={`fm-pl sub${current === k.path ? ' on' : ''}`} role="button" tabIndex={0} title={k.path} onClick={() => onGo(k.path)} onKeyDown={(e) => e.key === 'Enter' && onGo(k.path)}>
                <TreeToggle path={k.path} current={current} onGo={onGo} />
                <Icon name="folder" size={14} />
                <span className="fm-pl-n">{k.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ============================================================ explorateur */
function Browser({
  tab,
  onTab,
  other,
  closeTab,
  tags,
  setTags,
  tick,
  refresh,
  clip,
  setClip,
  hidden,
  openTab,
  addFavorite
}: {
  tab: Tab;
  onTab(tb: Tab): void;
  /** Dossier de l'autre volet (F6 : copier vers l'autre volet). */
  other: string | null;
  closeTab?(): void;
  places: { places: FilePlace[]; zones: FilePlace[] };
  tags: Record<string, string[]>;
  setTags(t: Record<string, string[]>): void;
  tick: number;
  refresh(): void;
  clip: Clip | null;
  setClip(c: Clip | null): void;
  hidden: boolean;
  openTab(p: string): void;
  addFavorite(p: string): Promise<void>;
}): ReactNode {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [search, setSearch] = useState<Search | null>(null);
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [batch, setBatch] = useState<FileEntry[] | null>(null);
  const [tagFor, setTagFor] = useState<string[] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingEdit = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void window.api.fm.list(tab.path).then((r) => {
      if (!alive) return;
      setEntries(r.entries);
      setError(r.error);
      setLoading(false);
      if (pendingEdit.current && r.entries.some((e) => e.path === pendingEdit.current)) {
        setEditing(pendingEdit.current);
        pendingEdit.current = null;
      }
    });
    return () => {
      alive = false;
    };
  }, [tab.path, tick]);
  useEffect(() => {
    setSearch(null);
    setQuery('');
  }, [tab.path]);

  const visible = (list: FileEntry[]): FileEntry[] => (hidden ? list : list.filter((e) => !e.hidden && !e.name.startsWith('.')));
  const shown = search?.results ? visible(applyFilters(search.results, search.filters)) : visible(entries);
  const selected = shown.filter((e) => sel.includes(e.path));

  const nav = (path: string): void => onTab(go(tab, path));
  const back = (): void => {
    if (tab.tool) return onTab({ ...tab, tool: null });
    const prev = tab.back[tab.back.length - 1];
    if (prev) onTab({ ...tab, path: prev, back: tab.back.slice(0, -1), fwd: [tab.path, ...tab.fwd] });
  };
  const fwd = (): void => {
    const next = tab.fwd[0];
    if (next) onTab({ ...tab, path: next, back: [...tab.back, tab.path], fwd: tab.fwd.slice(1) });
  };
  const up = (): void => {
    const p = parentPath(tab.path);
    if (p) nav(p);
  };

  const open = async (e: FileEntry): Promise<void> => {
    if (e.isDir) return nav(e.path);
    const err = await window.api.fm.open(e.path);
    if (err) ui.toast(err, { erreur: true });
  };

  const runSearch = async (text: string): Promise<void> => {
    if (!text.trim()) return setSearch(null);
    const filters = search?.filters ?? { kinds: [], days: 0, minMb: 0 };
    setSearch({ text, results: null, filters });
    const results = await window.api.fm.search(text.trim(), tab.path);
    setSearch((s) => (s && s.text === text ? { ...s, results } : s));
  };

  const trash = async (paths: string[]): Promise<void> => {
    if (!paths.length) return;
    const n = await window.api.fm.trash(paths);
    ui.toast(t('files.trashed', { n }));
    refresh();
  };
  const copy = (paths: string[], cut: boolean): void => {
    if (!paths.length) return;
    setClip({ paths, cut });
    ui.toast(t(cut ? 'files.clip.cut' : 'files.clip.copied', { n: paths.length }));
  };
  const paste = async (dest: string): Promise<void> => {
    if (!clip) return;
    await window.api.fm.transfer(clip.paths, dest, !clip.cut);
    if (clip.cut) setClip(null);
  };
  const newFolder = async (): Promise<void> => {
    const name = freeName(t('files.newFolder'), entries.map((e) => e.name));
    const made = await window.api.fm.mkdir(tab.path, name);
    if (!made) return ui.toast(t('files.mkdirFail'), { erreur: true });
    pendingEdit.current = made;
    refresh();
  };
  const action = async (kind: 'zip' | 'unzip' | 'terminal' | 'png' | 'jpg', paths: string[], extra?: string): Promise<void> => {
    const r = await window.api.fm.action(kind, paths, extra);
    if (!r.ok) return ui.toast(r.error || t('files.actionFail'), { erreur: true });
    if (kind !== 'terminal') {
      ui.toast(t(`files.done.${kind}`));
      refresh();
    }
  };

  const menu: PaneHandlers['menu'] = (e, x, y, s) => {
    const items: Array<MenuItem | null> = [];
    const picked = s.length ? s : e ? [e.path] : [];
    const pickedEntries = shown.filter((it) => picked.includes(it.path));
    if (e) {
      items.push({ icone: e.isDir ? 'folderopen' : 'external', texte: t('files.open'), touche: '↵', action: () => void open(e) });
      if (e.isDir) items.push({ icone: 'plus', texte: t('files.openTab'), action: () => openTab(e.path) });
      if (!e.isDir) items.push({ icone: 'eye', texte: t('files.preview'), touche: t('files.key.space'), action: () => setPreview(e) });
      if (search) items.push({ icone: 'folderopen', texte: t('files.showIn'), action: () => nav(parentPath(e.path) ?? tab.path) });
      items.push(null);
      items.push({ icone: 'copy', texte: t('files.copy'), touche: 'Ctrl C', action: () => copy(picked, false) });
      items.push({ icone: 'arrow', texte: t('files.cut'), touche: 'Ctrl X', action: () => copy(picked, true) });
      if (e.isDir && clip) items.push({ icone: 'clipboard', texte: t('files.pasteInto'), action: () => void paste(e.path) });
      if (other) items.push({ icone: 'layers', texte: t('files.copyOther'), touche: 'F6', action: () => void window.api.fm.transfer(picked, other, true) });
      items.push({ icone: 'hash', texte: t('files.copyPath'), touche: 'Ctrl ⇧ C', action: () => void window.api.fm.copyPaths(picked) });
      items.push(null);
      items.push({ icone: 'edit', texte: t('files.rename'), touche: 'F2', action: () => setEditing(e.path) });
      if (pickedEntries.length > 1) items.push({ icone: 'list', texte: t('files.batchRename'), action: () => setBatch(pickedEntries) });
      items.push({ icone: 'tag', texte: t('files.tags'), action: () => setTagFor(picked) });
      if (e.isDir) items.push({ icone: 'star', texte: t('files.fav.add'), action: () => void addFavorite(e.path) });
      items.push(null);
      items.push({ icone: 'download', texte: t('files.zip'), action: () => void action('zip', picked, picked.length > 1 ? baseName(tab.path) : undefined) });
      if (!e.isDir && e.ext === 'zip') items.push({ icone: 'upload', texte: t('files.unzip'), action: () => void action('unzip', [e.path]) });
      if (pickedEntries.length && pickedEntries.every((it) => it.kind === 'image')) {
        if (e.ext !== 'png') items.push({ icone: 'image', texte: t('files.toPng'), action: () => void action('png', picked) });
        if (e.ext !== 'jpg' && e.ext !== 'jpeg') items.push({ icone: 'image', texte: t('files.toJpg'), action: () => void action('jpg', picked) });
      }
      items.push({ icone: 'external', texte: t('files.reveal'), action: () => void window.api.fm.reveal(e.path) });
      items.push(null);
      items.push({ icone: 'trash', texte: t('files.trash'), touche: 'Suppr', danger: true, action: () => void trash(picked) });
    } else {
      items.push({ icone: 'folder', texte: t('files.newFolder'), touche: 'Ctrl ⇧ N', action: () => void newFolder() });
      if (clip) items.push({ icone: 'clipboard', texte: t('files.paste', { n: clip.paths.length }), touche: 'Ctrl V', action: () => void paste(tab.path) });
      items.push({ icone: 'refresh', texte: t('files.refresh'), touche: 'F5', action: refresh });
      items.push(null);
      items.push({ icone: 'star', texte: t('files.fav.add'), action: () => void addFavorite(tab.path) });
      items.push({ icone: 'type', texte: t('files.terminal'), action: () => void action('terminal', [tab.path]) });
      items.push({ icone: 'external', texte: t('files.revealHere'), action: () => void window.api.fm.open(tab.path) });
    }
    ui.menu({ x, y }, items, { titre: e ? (picked.length > 1 ? t('files.nSel', { n: picked.length }) : e.name) : undefined });
  };

  const key: PaneHandlers['key'] = (e, s, list) => {
    const first = list.find((x) => x.path === s[0]);
    const ctrl = e.ctrlKey || e.metaKey;
    const run = (fn: () => unknown): true => {
      void fn();
      return true;
    };
    if (e.key === 'Enter' && first) return run(() => open(first));
    if (e.key === ' ' && first && !first.isDir) return run(() => setPreview(first));
    if (e.key === 'F2' && first) return run(() => setEditing(first.path));
    if (e.key === 'Delete' && s.length) return run(() => trash(s));
    if (e.key === 'F5') return run(() => refresh());
    if (e.key === 'F6' && other && s.length) return run(() => window.api.fm.transfer(s, other, true));
    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) return run(() => back());
    if (e.altKey && e.key === 'ArrowRight') return run(() => fwd());
    if (e.altKey && e.key === 'ArrowUp') return run(() => up());
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c') return run(() => window.api.fm.copyPaths(s));
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'n') return run(() => newFolder());
    if (ctrl && e.key.toLowerCase() === 'c') return run(() => copy(s, false));
    if (ctrl && e.key.toLowerCase() === 'x') return run(() => copy(s, true));
    if (ctrl && e.key.toLowerCase() === 'v') return run(() => paste(tab.path));
    if (ctrl && e.key.toLowerCase() === 'f') return run(() => searchRef.current?.focus());
    if (ctrl && e.key.toLowerCase() === 'l') return run(() => setAddress(tab.path));
    if (ctrl && e.key.toLowerCase() === 't') return run(() => openTab(tab.path));
    if (ctrl && e.key.toLowerCase() === 'w' && closeTab) return run(() => closeTab());
    return false;
  };

  const h: PaneHandlers = {
    open: (e) => void open(e),
    menu,
    drop: (paths, dest, cp) => void window.api.fm.transfer(paths, dest, cp),
    rename: async (e, name) => {
      const n = name.trim();
      if (!n || n === e.name) return;
      if (!(await window.api.fm.rename(e.path, n))) ui.toast(t('files.renameFail'), { erreur: true });
      else {
        const dest = joinPath(parentPath(e.path) ?? tab.path, n);
        setSel([dest]);
      }
      refresh();
    },
    key,
    selection: setSel
  };

  const tools: Array<{ id: Tool; icon: string }> = [
    { id: 'usage', icon: 'chart' },
    { id: 'dups', icon: 'copy' },
    { id: 'clean', icon: 'sparkle' },
    { id: 'trash', icon: 'trash' }
  ];
  const selSize = selected.reduce((s, e) => s + (e.isDir ? 0 : e.size), 0);
  const filtersOn = !!search && (search.filters.kinds.length > 0 || search.filters.days > 0 || search.filters.minMb > 0);
  const setFilters = (patch: Partial<SearchFilters>): void => setSearch((s) => (s ? { ...s, filters: { ...s.filters, ...patch } } : s));

  return (
    <div className="fm-br">
      <div className="fm-bar-t">
        <button className="ib" aria-label={t('files.back')} title={t('files.back')} disabled={!tab.back.length && !tab.tool} onClick={back}>
          <Icon name="chevl" size={16} />
        </button>
        <button className="ib" aria-label={t('files.forward')} title={t('files.forward')} disabled={!tab.fwd.length} onClick={fwd}>
          <Icon name="chev" size={16} />
        </button>
        <button className="ib" aria-label={t('files.up')} title={t('files.up')} disabled={!parentPath(tab.path)} onClick={up}>
          <Icon name="chevu" size={16} />
        </button>
        {address !== null ? (
          <input
            className="fm-addr"
            autoFocus
            value={address}
            aria-label={t('files.address')}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={() => setAddress(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && address.trim()) {
                nav(address.trim());
                setAddress(null);
              }
              if (e.key === 'Escape') setAddress(null);
            }}
          />
        ) : (
          <div className="fm-crumbs" onDoubleClick={(e) => e.target === e.currentTarget && setAddress(tab.path)} title={t('files.addressHint')}>
            {crumbs(tab.path).map((c, i, all) => (
              <span key={c.path} className="fm-crumb">
                <button className={i === all.length - 1 && !tab.tool ? 'on' : ''} onClick={() => nav(c.path)}>
                  {c.label}
                </button>
                {i < all.length - 1 && <Icon name="chev" size={12} />}
              </span>
            ))}
            {tab.tool && (
              <span className="fm-crumb">
                <Icon name="chev" size={12} />
                <button className="on">{t(`files.tool.${tab.tool}`)}</button>
              </span>
            )}
          </div>
        )}
        <label className="champ fm-search">
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            value={query}
            placeholder={t('files.searchPh', { dir: baseName(tab.path) || tab.path })}
            aria-label={t('files.search')}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setSearch(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch(query);
              if (e.key === 'Escape') {
                setQuery('');
                setSearch(null);
              }
            }}
          />
          {search && (
            <button className={`ib${filtersOn || showFilters ? ' on' : ''}`} aria-label={t('files.filters')} aria-pressed={showFilters} onClick={() => setShowFilters(!showFilters)}>
              <Icon name="filter" size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="fm-bar-a">
        <button className="btn xs" onClick={() => void newFolder()} disabled={!!search || !!tab.tool}>
          <Icon name="plus" size={14} />
          {t('files.newFolder')}
        </button>
        {clip && (
          <button className="btn xs" onClick={() => void paste(tab.path)} disabled={!!search || !!tab.tool}>
            <Icon name="clipboard" size={14} />
            {t('files.paste', { n: clip.paths.length })}
          </button>
        )}
        {selected.length > 1 && (
          <button className="btn xs" onClick={() => setBatch(selected)}>
            <Icon name="list" size={14} />
            {t('files.batchRename')}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button
          className="btn xs gh"
          onClick={(e) =>
            ui.menu(
              e.currentTarget,
              tools.map((x) => ({ icone: x.icon, texte: t(`files.tool.${x.id}`), action: () => onTab({ ...tab, tool: x.id }) })),
              { titre: t('files.tools') }
            )
          }
        >
          <Icon name="wrench" size={14} />
          {t('files.tools')}
        </button>
        <div className="seg">
          <button className={tab.view === 'list' ? 'on' : ''} aria-label={t('files.view.list')} title={t('files.view.list')} onClick={() => onTab({ ...tab, view: 'list' })}>
            <Icon name="rows" size={14} />
          </button>
          <button className={tab.view === 'grid' ? 'on' : ''} aria-label={t('files.view.grid')} title={t('files.view.grid')} onClick={() => onTab({ ...tab, view: 'grid' })}>
            <Icon name="grid" size={14} />
          </button>
        </div>
      </div>
      {search && showFilters && (
        <div className="fm-filters">
          <div className="chips">
            {KIND_GROUPS.map((g) => {
              const on = g.kinds.every((k) => search.filters.kinds.includes(k));
              return (
                <button
                  key={g.id}
                  className={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setFilters({ kinds: on ? search.filters.kinds.filter((k) => !g.kinds.includes(k)) : [...search.filters.kinds, ...g.kinds] })}
                >
                  {t(`files.kindGroup.${g.id}`)}
                </button>
              );
            })}
          </div>
          <div className="seg">
            {[0, 1, 7, 30, 365].map((d) => (
              <button key={d} className={search.filters.days === d ? 'on' : ''} onClick={() => setFilters({ days: d })}>
                {t(`files.days.${d}`)}
              </button>
            ))}
          </div>
          <div className="seg">
            {[0, 10, 100, 1000].map((m) => (
              <button key={m} className={search.filters.minMb === m ? 'on' : ''} onClick={() => setFilters({ minMb: m })}>
                {m === 0 ? t('files.size.any') : `≥ ${m >= 1000 ? `${m / 1000} Go` : `${m} Mo`}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab.tool === 'dups' ? (
        <DupsView root={tab.path} onOpen={(p) => nav(p)} />
      ) : tab.tool === 'usage' ? (
        <UsageView root={tab.path} onOpen={(p) => nav(p)} />
      ) : tab.tool === 'clean' ? (
        <CleanView />
      ) : tab.tool === 'trash' ? (
        <TrashView />
      ) : (
        <FilePane
          entries={shown}
          view={tab.view}
          sort={tab.sort}
          desc={tab.desc}
          onSort={(s) => onTab({ ...tab, sort: s, desc: tab.sort === s ? !tab.desc : false })}
          tags={tags}
          dropDir={search ? null : tab.path}
          editing={editing}
          setEditing={setEditing}
          h={h}
          focusKey={`${tab.path}|${search?.text ?? ''}`}
          empty={
            search ? (
              search.results === null ? (
                <span className="muted">{t('files.searching')}</span>
              ) : (
                <span className="muted">{t('files.noResults', { q: search.text })}</span>
              )
            ) : loading ? (
              <span className="muted">…</span>
            ) : error ? (
              <span className="dan">{t(`files.err.${error}`)}</span>
            ) : (
              <span className="muted">{t('files.emptyDir')}</span>
            )
          }
        />
      )}

      <div className="fm-status mono petit">
        {search ? t('files.status.results', { n: shown.length }) : t('files.status.items', { n: shown.length })}
        {selected.length > 0 && ` · ${t('files.status.sel', { n: selected.length })}${selSize ? ` · ${formatSize(selSize, lang)}` : ''}`}
        {clip && ` · ${t(clip.cut ? 'files.status.cut' : 'files.status.clip', { n: clip.paths.length })}`}
      </div>

      {preview && (
        <PreviewSheet
          entry={preview}
          onClose={() => setPreview(null)}
          onNext={() => {
            const files = shown.filter((e) => !e.isDir);
            const i = files.findIndex((e) => e.path === preview.path);
            if (i >= 0 && i < files.length - 1) setPreview(files[i + 1]);
          }}
          onPrev={() => {
            const files = shown.filter((e) => !e.isDir);
            const i = files.findIndex((e) => e.path === preview.path);
            if (i > 0) setPreview(files[i - 1]);
          }}
        />
      )}
      {batch && (
        <BatchRenameSheet
          items={batch}
          siblings={entries.map((e) => e.name)}
          onClose={() => setBatch(null)}
          onDone={() => {
            setBatch(null);
            refresh();
          }}
        />
      )}
      {tagFor && <TagsSheet paths={tagFor} tags={tags} onClose={() => setTagFor(null)} onChange={setTags} />}
    </div>
  );
}
