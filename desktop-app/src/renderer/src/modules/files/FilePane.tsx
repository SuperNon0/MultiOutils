import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { displayName, formatSize, sortEntries, type ZoneSort } from '../../../../common/desktop';
import type { FileEntry } from '../../../../common/files';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

/* Icônes système, mises en cache pour la page. */
const icons = new Map<string, Promise<string | null>>();
export function FileIcon({ entry, large }: { entry: Pick<FileEntry, 'path' | 'mtime' | 'isDir'>; large?: boolean }): ReactNode {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const size = large ? 'large' : 'small';
    const key = `${size}|${entry.path}|${entry.mtime}`;
    let p = icons.get(key);
    if (!p) {
      p = window.api.desktop.icon(entry.path, size);
      if (icons.size > 4000) icons.clear();
      icons.set(key, p);
    }
    setUrl(null);
    void p.then((u) => {
      if (!u) icons.delete(key);
      if (alive) setUrl(u);
    }).catch(() => {
      icons.delete(key);
      if (alive) setUrl(null);
    });
    return () => {
      alive = false;
    };
  }, [entry.path, entry.mtime, large]);
  return url ? <img src={url} alt="" draggable={false} /> : <Icon name={entry.isDir ? 'folder' : 'file'} size={large ? 40 : 18} />;
}

export interface PaneHandlers {
  open(e: FileEntry): void;
  menu(e: FileEntry | null, x: number, y: number, sel: string[]): void;
  drop(paths: string[], dest: string, copy: boolean): void;
  rename(e: FileEntry, name: string): void;
  key(e: ReactKeyboardEvent, sel: string[], entries: FileEntry[]): boolean;
  selection(paths: string[]): void;
}

/** Liste d'un dossier (ou de résultats de recherche) : grille, liste ou détails. */
export function FilePane({
  entries,
  view,
  sort,
  desc,
  onSort,
  tags,
  dropDir,
  editing,
  setEditing,
  h,
  empty,
  focusKey
}: {
  entries: FileEntry[];
  view: 'grid' | 'list';
  sort: ZoneSort;
  desc: boolean;
  onSort(sort: ZoneSort): void;
  tags: Record<string, string[]>;
  /** Dossier où vont les éléments déposés dans le vide (null = pas de dépôt). */
  dropDir: string | null;
  editing: string | null;
  setEditing(p: string | null): void;
  h: PaneHandlers;
  empty: ReactNode;
  focusKey: string;
}): ReactNode {
  const { t, lang } = useI18n();
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sorted = sortEntries(entries, sort, desc) as FileEntry[];
  const order = sorted.map((e) => e.path);

  useEffect(() => {
    setSel([]);
    setAnchor(null);
    ref.current?.focus({ preventScroll: true });
  }, [focusKey]);
  useEffect(() => {
    const keep = new Set(order);
    setSel((s) => (s.every((p) => keep.has(p)) ? s : s.filter((p) => keep.has(p))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);
  useEffect(() => h.selection(sel), [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const click = (ev: React.MouseEvent, p: string): void => {
    if (ev.ctrlKey) {
      setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
      setAnchor(p);
    } else if (ev.shiftKey && anchor) {
      const a = order.indexOf(anchor);
      const b = order.indexOf(p);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSel(order.slice(lo, hi + 1));
    } else {
      setSel([p]);
      setAnchor(p);
    }
  };

  const onKey = (e: ReactKeyboardEvent): void => {
    if (editing) return;
    if (h.key(e, sel, sorted)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault();
      setSel(order);
    } else if (e.key === 'Escape') setSel([]);
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') && sorted.length) {
      e.preventDefault();
      const cols = view === 'grid' ? Math.max(1, Math.floor((ref.current?.clientWidth ?? 600) / 112)) : 1;
      const step = e.key === 'ArrowDown' ? cols : e.key === 'ArrowUp' ? -cols : e.key === 'ArrowRight' ? (view === 'grid' ? 1 : 0) : view === 'grid' ? -1 : 0;
      if (!step) return;
      const cur = anchor ? order.indexOf(anchor) : -1;
      const next = Math.min(order.length - 1, Math.max(0, cur + step));
      setSel([order[next]]);
      setAnchor(order[next]);
      ref.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  const dragStart = (e: ReactDragEvent, p: string): void => {
    e.preventDefault();
    window.api.fm.startDrag(sel.includes(p) ? sel : [p]);
  };
  const dragOver = (e: ReactDragEvent, target: FileEntry | null): void => {
    if (!e.dataTransfer.types.includes('Files')) return;
    const dest = target?.isDir ? target.path : dropDir;
    if (!dest) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    setOver(target?.isDir ? target.path : '');
  };
  const drop = (e: ReactDragEvent, target: FileEntry | null): void => {
    const dest = target?.isDir ? target.path : dropDir;
    setOver(null);
    if (!dest) return;
    e.preventDefault();
    e.stopPropagation();
    const paths = window.api.files.pathsFor([...e.dataTransfer.files]).filter((p) => p !== dest);
    if (paths.length) h.drop(paths, dest, e.ctrlKey);
  };

  const date = (ms: number): string =>
    new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const name = (e: FileEntry): ReactNode =>
    editing === e.path ? (
      <input
        className="fm-ren"
        autoFocus
        defaultValue={e.name}
        onFocus={(ev) => {
          const dot = e.isDir ? -1 : e.name.lastIndexOf('.');
          ev.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.name.length);
        }}
        onClick={(ev) => ev.stopPropagation()}
        onDoubleClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => {
          ev.stopPropagation();
          if (ev.key === 'Enter') {
            setEditing(null);
            h.rename(e, ev.currentTarget.value);
          }
          if (ev.key === 'Escape') setEditing(null);
        }}
        onBlur={(ev) => {
          setEditing(null);
          h.rename(e, ev.currentTarget.value);
        }}
      />
    ) : (
      displayName(e)
    );

  const dots = (p: string): ReactNode =>
    tags[p]?.length ? (
      <span className="fm-tags">
        {tags[p].map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </span>
    ) : null;

  const itemProps = (e: FileEntry, i: number) => ({
    key: e.path,
    'data-i': i,
    draggable: editing !== e.path,
    onDragStart: (ev: ReactDragEvent) => dragStart(ev, e.path),
    onDragOver: (ev: ReactDragEvent) => dragOver(ev, e),
    onDragLeave: () => setOver(null),
    onDrop: (ev: ReactDragEvent) => drop(ev, e),
    onClick: (ev: React.MouseEvent) => click(ev, e.path),
    onDoubleClick: () => h.open(e),
    onContextMenu: (ev: React.MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const s = sel.includes(e.path) ? sel : [e.path];
      if (!sel.includes(e.path)) {
        setSel([e.path]);
        setAnchor(e.path);
      }
      h.menu(e, ev.clientX, ev.clientY, s);
    },
    title: e.name
  });

  const head = (k: ZoneSort, label: string, cls = ''): ReactNode => (
    <button className={`fm-hd ${cls}${sort === k ? ' on' : ''}`} onClick={() => onSort(k)}>
      {label}
      {sort === k && <Icon name={desc ? 'chevd' : 'chevu'} size={12} />}
    </button>
  );

  return (
    <div
      ref={ref}
      className={`fm-pane ${view}${over === '' ? ' drop' : ''}`}
      tabIndex={0}
      onKeyDown={onKey}
      onDragOver={(e) => dragOver(e, null)}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(null);
      }}
      onDrop={(e) => drop(e, null)}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSel([]);
      }}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('[data-i]')) return;
        e.preventDefault();
        h.menu(null, e.clientX, e.clientY, sel);
      }}
    >
      {sorted.length === 0 ? (
        <div className="fm-empty">{empty}</div>
      ) : view === 'grid' ? (
        sorted.map((e, i) => (
          <div {...itemProps(e, i)} className={`fm-cell${sel.includes(e.path) ? ' sel' : ''}${over === e.path ? ' over' : ''}`}>
            <FileIcon entry={e} large />
            <span className="fm-cn">
              {name(e)}
              {dots(e.path)}
            </span>
          </div>
        ))
      ) : (
        <>
          <div className="fm-row fm-head">
            <span />
            {head('name', t('desktop.col.name'))}
            {head('date', t('desktop.col.date'), 'm')}
            {head('type', t('files.col.type'), 'm hide-s')}
            {head('size', t('desktop.col.size'), 'm r')}
          </div>
          {sorted.map((e, i) => (
            <div {...itemProps(e, i)} className={`fm-row${sel.includes(e.path) ? ' sel' : ''}${over === e.path ? ' over' : ''}`}>
              <FileIcon entry={e} />
              <span className="fm-nm">
                {name(e)}
                {dots(e.path)}
              </span>
              <span className="m">{date(e.mtime)}</span>
              <span className="m hide-s">{e.isDir ? t('files.kind.folder') : e.ext.toUpperCase() || '—'}</span>
              <span className="m r">{e.isDir ? '' : formatSize(e.size, lang)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
