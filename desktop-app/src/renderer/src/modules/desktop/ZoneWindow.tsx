import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import {
  displayName,
  formatSize,
  type DesktopEntry,
  type Rect,
  type ZoneIconSize,
  type ZoneWindowMsg
} from '../../../../common/desktop';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import './desktop.css';

const ICON_PX: Record<ZoneIconSize, number> = { small: 28, medium: 40, large: 64 };
const CELL_PX: Record<ZoneIconSize, number> = { small: 66, medium: 78, large: 104 };

/* Icônes système, mises en cache pour toute la fenêtre. */
const icons = new Map<string, Promise<string | null>>();
function useFileIcon(path: string, size: 'small' | 'normal' | 'large', mtime: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const key = `${size}|${path}|${mtime}`;
    let p = icons.get(key);
    if (!p) {
      p = window.api.desktop.icon(path, size);
      icons.set(key, p);
    }
    void p.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path, size, mtime]);
  return url;
}

function FileIcon({ entry, size }: { entry: DesktopEntry; size: 'small' | 'normal' | 'large' }): ReactNode {
  const url = useFileIcon(entry.path, size, entry.mtime);
  return url ? <img src={url} alt="" draggable={false} /> : <span className="ph" />;
}

function RenameInput({ value, onDone }: { value: string; onDone(v: string | null): void }): ReactNode {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = value.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, [value]);
  return (
    <input
      ref={ref}
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onDone(e.currentTarget.value);
        if (e.key === 'Escape') onDone(null);
      }}
      onBlur={(e) => onDone(e.currentTarget.value)}
    />
  );
}

/** Fenêtre d'une zone posée sur le bureau (route #/zone/<id>). */
export function ZoneWindow(): ReactNode {
  const { t, lang } = useI18n();
  const [msg, setMsg] = useState<ZoneWindowMsg | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState(false);
  const [editItem, setEditItem] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [lasso, setLasso] = useState<Rect | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    void window.api.desktop.zone.hello().then((m) => m && setMsg(m));
    const off1 = window.api.desktop.zone.onUpdate(setMsg);
    const off2 = window.api.desktop.zone.onEdit((e) => {
      if (e.type === 'title') setEditTitle(true);
      else if (e.path) setEditItem(e.path);
    });
    return () => {
      off1();
      off2();
    };
  }, []);

  // La sélection ne garde que ce qui existe encore.
  useEffect(() => {
    if (!msg) return;
    const paths = new Set(msg.content.entries.map((e) => e.path));
    setSel((s) => {
      const next = new Set([...s].filter((p) => paths.has(p)));
      return next.size === s.size ? s : next;
    });
  }, [msg]);

  /* ----------------------------------------- déplacer / redimensionner */
  const startGeom = useCallback(
    (mode: 'move' | 'resize', edges: { e?: boolean; s?: boolean }) => (ev: ReactPointerEvent<HTMLElement>) => {
      if (ev.button !== 0 || !msg || msg.zone.locked) return;
      if ((ev.target as HTMLElement).closest('button,input')) return;
      ev.preventDefault();
      const el = ev.currentTarget;
      el.setPointerCapture(ev.pointerId);
      const start = { x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight };
      const sx = ev.screenX;
      const sy = ev.screenY;
      let frame = 0;
      let last: Rect = start;
      const compute = (e: PointerEvent): Rect => {
        const dx = e.screenX - sx;
        const dy = e.screenY - sy;
        if (mode === 'move') return { ...start, x: start.x + dx, y: start.y + dy };
        return {
          ...start,
          width: edges.e ? start.width + dx : start.width,
          height: edges.s ? start.height + dy : start.height
        };
      };
      const move = (e: PointerEvent): void => {
        last = compute(e);
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          window.api.desktop.zone.bounds(last, false, mode);
        });
      };
      const up = (e: PointerEvent): void => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        if (frame) cancelAnimationFrame(frame);
        last = compute(e);
        if (last.x !== start.x || last.y !== start.y || last.width !== start.width || last.height !== start.height) {
          window.api.desktop.zone.bounds(last, true, mode);
        }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    },
    [msg]
  );

  if (!msg) return null;
  const { zone, content, settings } = msg;
  const entries = content.entries;
  const order = entries.map((e) => e.path);

  /* --------------------------------------------------------- sélection */
  const clickEntry = (e: ReactPointerEvent | React.MouseEvent, p: string): void => {
    if (e.ctrlKey) {
      setSel((s) => {
        const n = new Set(s);
        if (n.has(p)) n.delete(p);
        else n.add(p);
        return n;
      });
      setAnchor(p);
    } else if (e.shiftKey && anchor) {
      const a = order.indexOf(anchor);
      const b = order.indexOf(p);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSel(new Set(order.slice(lo, hi + 1)));
    } else {
      setSel(new Set([p]));
      setAnchor(p);
    }
  };
  const open = (p: string): void => {
    void window.api.desktop.zone.open(p);
  };

  const onKey = (e: ReactKeyboardEvent): void => {
    if (editItem || editTitle) return;
    if (e.key === 'Enter' && sel.size > 0) [...sel].forEach(open);
    else if (e.key === 'F2' && sel.size === 1) setEditItem([...sel][0]);
    else if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault();
      setSel(new Set(order));
    } else if (e.key === 'Escape') setSel(new Set());
    else if (e.key === 'Backspace' && content.canGoUp) void window.api.desktop.zone.up();
  };

  /* -------------------------------------------------------- lasso */
  const startLasso = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest('.zw-fi,.zw-row')) return;
    const body = bodyRef.current;
    if (!body) return;
    const box = body.getBoundingClientRect();
    const ox = ev.clientX - box.left + body.scrollLeft;
    const oy = ev.clientY - box.top + body.scrollTop;
    const base = ev.ctrlKey ? new Set(sel) : new Set<string>();
    if (!ev.ctrlKey) setSel(new Set());
    body.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent): void => {
      const x = e.clientX - box.left + body.scrollLeft;
      const y = e.clientY - box.top + body.scrollTop;
      const r = { x: Math.min(ox, x), y: Math.min(oy, y), width: Math.abs(x - ox), height: Math.abs(y - oy) };
      setLasso(r);
      const hit = new Set(base);
      body.querySelectorAll<HTMLElement>('[data-path]').forEach((el) => {
        const b = el.getBoundingClientRect();
        const ex = b.left - box.left + body.scrollLeft;
        const ey = b.top - box.top + body.scrollTop;
        if (ex < r.x + r.width && ex + b.width > r.x && ey < r.y + r.height && ey + b.height > r.y) hit.add(el.dataset.path ?? '');
      });
      setSel(hit);
    };
    const up = (): void => {
      body.removeEventListener('pointermove', move);
      body.removeEventListener('pointerup', up);
      setLasso(null);
    };
    body.addEventListener('pointermove', move);
    body.addEventListener('pointerup', up);
  };

  /* -------------------------------------------------- glisser-déposer */
  const dragStart = (e: ReactDragEvent, p: string): void => {
    e.preventDefault();
    const paths = sel.has(p) ? [...sel] : [p];
    window.api.desktop.zone.startDrag(paths);
  };
  const dragOver = (e: ReactDragEvent): void => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-name]');
    setBefore(zone.kind === 'shortcuts' && zone.sort === 'manual' ? (target?.dataset.name ?? null) : null);
  };
  const dragEnter = (e: ReactDragEvent): void => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth.current++;
    setDropOn(true);
  };
  const dragLeave = (): void => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDropOn(false);
      setBefore(null);
    }
  };
  const drop = (e: ReactDragEvent): void => {
    e.preventDefault();
    dragDepth.current = 0;
    setDropOn(false);
    const paths = window.api.files.pathsFor([...e.dataTransfer.files]);
    const b = before;
    setBefore(null);
    if (paths.length) void window.api.desktop.zone.drop(paths, e.ctrlKey, b ?? undefined);
  };

  const finishRename = (p: string, v: string | null): void => {
    setEditItem(null);
    const old = p.split(/[\\/]/).pop() ?? '';
    if (v && v.trim() && v.trim() !== old) {
      void window.api.desktop.zone.renameItem(p, v.trim());
    }
  };

  const menuAt = (e: React.MouseEvent, p?: string): void => {
    e.preventDefault();
    e.stopPropagation();
    if (p && !sel.has(p)) {
      setSel(new Set([p]));
      setAnchor(p);
    }
    window.api.desktop.zone.menu(p ? { path: p } : null);
  };

  const style = {
    '--zc': zone.color ?? 'var(--accent)',
    '--zo': `${settings.opacity}%`,
    '--ico': `${ICON_PX[zone.iconSize]}px`,
    '--cell': `${CELL_PX[zone.iconSize]}px`
  } as CSSProperties;
  const iconRes: 'small' | 'normal' | 'large' = zone.iconSize === 'large' ? 'large' : 'normal';
  const date = (ms: number): string =>
    new Date(ms).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' });
  const crumb = content.path ? content.path.split(/[\\/]/).filter(Boolean) : [];

  const itemProps = (e: DesktopEntry) => ({
    'data-path': e.path,
    'data-name': e.name,
    draggable: editItem !== e.path,
    title: displayName(e),
    onDragStart: (ev: ReactDragEvent) => dragStart(ev, e.path),
    onClick: (ev: React.MouseEvent) => clickEntry(ev, e.path),
    onDoubleClick: () => open(e.path),
    onContextMenu: (ev: React.MouseEvent) => menuAt(ev, e.path)
  });

  let body: ReactNode;
  if (content.error) {
    body = (
      <div className="zw-vide">
        <span>{t(content.error === 'missing' ? 'desktop.zone.missing' : 'desktop.zone.unreachable')}</span>
        <button className="btn xs" onClick={() => void window.api.desktop.zone.home()}>
          <Icon name="refresh" size={14} />
          {t('desktop.zone.retry')}
        </button>
      </div>
    );
  } else if (entries.length === 0) {
    body = <div className="zw-vide">{t(zone.kind === 'folder' ? 'desktop.zone.emptyFolder' : 'desktop.zone.empty')}</div>;
  } else if (zone.view === 'icons') {
    body = (
      <div className="zw-grid">
        {entries.map((e) => (
          <div
            key={e.path}
            {...itemProps(e)}
            className={`zw-fi${sel.has(e.path) ? ' sel' : ''}${before === e.name ? ' before' : ''}`}
          >
            <FileIcon entry={e} size={iconRes} />
            <span className="lb">
              {editItem === e.path ? <RenameInput value={e.name} onDone={(v) => finishRename(e.path, v)} /> : displayName(e)}
            </span>
          </div>
        ))}
      </div>
    );
  } else {
    const details = zone.view === 'details';
    body = (
      <div className={`zw-rows${details ? ' details' : ''}`}>
        {details && (
          <div className="zw-row hd">
            <span />
            <span>{t('desktop.col.name')}</span>
            <span className="m">{t('desktop.col.size')}</span>
            <span className="m">{t('desktop.col.date')}</span>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.path} {...itemProps(e)} className={`zw-row${sel.has(e.path) ? ' sel' : ''}${before === e.name ? ' before' : ''}`}>
            <FileIcon entry={e} size="small" />
            <span className="nm">
              {editItem === e.path ? <RenameInput value={e.name} onDone={(v) => finishRename(e.path, v)} /> : displayName(e)}
            </span>
            {details && <span className="m">{e.isDir ? '—' : formatSize(e.size, lang)}</span>}
            {details && <span className="m">{date(e.mtime)}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`zw${zone.locked ? '' : ' unlocked'}${dropOn ? ' drop' : ''}`}
      style={style}
      tabIndex={-1}
      onKeyDown={onKey}
      onDragEnter={dragEnter}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
    >
      <div className="zw-h" onPointerDown={startGeom('move', {})} onContextMenu={(e) => menuAt(e)}>
        {zone.kind === 'folder' ? <Icon name="folderopen" size={16} /> : <span className="zw-dot" />}
        <span className="zw-t" onDoubleClick={() => setEditTitle(true)}>
          {editTitle ? (
            <RenameInput
              value={zone.title}
              onDone={(v) => {
                setEditTitle(false);
                if (v && v.trim()) void window.api.desktop.zone.rename(v);
              }}
            />
          ) : (
            zone.title
          )}
        </span>
        <span className="zw-n">{entries.length}</span>
        {zone.locked && <Icon name="lock" size={14} />}
        <button className="zw-ib" title={t('desktop.zone.menu')} onClick={(e) => menuAt(e)}>
          <Icon name="dots" size={16} />
        </button>
      </div>
      {zone.kind === 'folder' && content.path && (
        <div className="zw-crumb">
          {content.canGoUp && (
            <button className="zw-ib" style={{ width: 22, height: 22 }} title={t('desktop.zone.up')} onClick={() => void window.api.desktop.zone.up()}>
              <Icon name="chevl" size={14} />
            </button>
          )}
          {crumb.length > 2 && <span>…</span>}
          {crumb.slice(-2, -1).map((c) => (
            <span key={c}>{c} ›</span>
          ))}
          <b>{crumb[crumb.length - 1] ?? content.path}</b>
        </div>
      )}
      <div ref={bodyRef} className="zw-body" onPointerDown={startLasso} onContextMenu={(e) => menuAt(e)}>
        {body}
        {lasso && <div className="zw-lasso" style={{ left: lasso.x, top: lasso.y, width: lasso.width, height: lasso.height }} />}
      </div>
      {!zone.locked && (
        <>
          <div className="zw-grip e" onPointerDown={startGeom('resize', { e: true })} />
          <div className="zw-grip s" onPointerDown={startGeom('resize', { s: true })} />
          <div className="zw-grip se" onPointerDown={startGeom('resize', { e: true, s: true })} />
        </>
      )}
    </div>
  );
}
