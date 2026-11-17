import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatSize, type HaEntity, type WidgetType, type Zone, type ZoneContent } from '../../../../common/desktop';
import type { LauncherResult } from '../../../../common/launcher';
import type { ClipItem } from '../../../../common/types';
import { HaCards } from './HaCards';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import './widgets.css';

export const WIDGET_ICONS: Record<WidgetType, string> = {
  notes: 'edit',
  clips: 'clipboard',
  ha: 'home',
  'ha-sensor': 'signal',
  'ha-chart': 'chart',
  search: 'search',
  cloud: 'cloud'
};

/** Les clics dans un widget ne doivent ni déplacer la zone ni lancer le lasso. */
const keepInside = (e: React.PointerEvent): void => e.stopPropagation();

/** Contenu d'une zone spéciale : notes, presse-papiers épinglé, Home Assistant,
 *  courbe, barre de recherche, mini cloud. Styles : widgets.css. */
export function WidgetBody({ zone, content }: { zone: Zone; content: ZoneContent }): ReactNode {
  switch (zone.widget) {
    case 'notes':
      return <NotesWidget zone={zone} />;
    case 'clips':
      return <ClipsWidget />;
    case 'ha':
    case 'ha-sensor':
      return <HaWidget zone={zone} />;
    case 'ha-chart':
      return <HaChartWidget zone={zone} />;
    case 'search':
      return <SearchWidget />;
    case 'cloud':
      return <CloudWidget content={content} />;
    default:
      return null;
  }
}

/** Petite tuile d'icône colorée, comme les icônes de fichiers des zones. */
function Tile({ icon, color }: { icon: string; color?: string }): ReactNode {
  return (
    <span className="wg-tile" style={color ? ({ '--tc': color } as CSSProperties) : undefined}>
      <Icon name={icon} size={15} />
    </span>
  );
}

/* --------------------------------------------------------------- notes */
function NotesWidget({ zone }: { zone: Zone }): ReactNode {
  const { t } = useI18n();
  const [text, setText] = useState(zone.note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const archivedId = useRef<string | null>(zone.savedNoteId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(zone.note);
    latest.current = zone.note;
    archivedId.current = zone.savedNoteId;
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.id]);

  // Brouillon : enregistré 500 ms après la dernière frappe, et à la fermeture.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        window.api.desktop.zone.note(latest.current);
      }
    },
    []
  );

  const edit = (v: string): void => {
    setText(v);
    setSaved(false);
    latest.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      window.api.desktop.zone.note(v);
    }, 500);
  };

  const archive = async (): Promise<void> => {
    if (saving || !latest.current.trim()) return;
    setSaving(true);
    try {
      const firstLine = latest.current.trim().split('\n')[0].slice(0, 80);
      // Réarchiver une note déjà archivée la met à jour au lieu de créer un doublon.
      const existing = archivedId.current
        ? (await window.api.desktop.notes.list()).some((note) => note.id === archivedId.current)
        : false;
      const note = await window.api.desktop.notes.save({
        ...(existing ? { id: archivedId.current! } : {}),
        title: firstLine || t('desktop.notes.quick'),
        body: latest.current
      });
      archivedId.current = note.id;
      await window.api.desktop.updateZone(zone.id, { savedNoteId: note.id });
      setSaved(true);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wg-notes">
      <textarea
        className="wg-note"
        value={text}
        spellCheck
        onContextMenu={(e) => e.stopPropagation()}
        placeholder={t('desktop.notes.ph')}
        onPointerDown={keepInside}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => edit(e.target.value)}
      />
      <footer className="wg-foot">
        <span className={saved ? 'ok' : ''}>
          {saved ? t('desktop.notes.archived') : t('desktop.notes.autosave')}
        </span>
        <button
          type="button"
          className="wg-action"
          disabled={saving || !text.trim()}
          onPointerDown={keepInside}
          onClick={() => void archive()}
        >
          <Icon name={saved ? 'check' : 'bookmark'} size={14} />
          {t('desktop.notes.archive')}
        </button>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------ courbe (HA) */
type Point = { at: number; value: number };

function HaChartWidget({ zone }: { zone: Zone }): ReactNode {
  const { t, lang } = useI18n();
  const entityId = zone.entities[0] ?? '';
  const [points, setPoints] = useState<Point[]>([]);
  const [entity, setEntity] = useState<HaEntity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      if (!entityId) {
        setPoints([]);
        return;
      }
      try {
        const [series, list] = await Promise.all([window.api.ha.series(entityId, zone.chartHours), window.api.ha.entities()]);
        if (!alive) return;
        if (list.ok) setEntity(list.list.find((e) => e.id === entityId) ?? null);
        if (series.ok) {
          setPoints(series.points);
          setError(null);
        } else setError(series.error);
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 300_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [entityId, zone.chartHours]);

  if (!entityId) return <div className="zw-vide">{t('desktop.chart.pick')}</div>;

  const fmt = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 });
  const name = entity?.name ?? entityId.split('.')[1]?.replace(/_/g, ' ') ?? entityId;
  const unit = entity?.unit ?? '';
  const valid = points.length >= 2;
  const values = points.map((p) => p.value);
  const min = valid ? Math.min(...values) : 0;
  const max = valid ? Math.max(...values) : 1;
  const last = values[values.length - 1];

  // Courbe dans un repère 300 × 100, avec une marge pour l'épaisseur du trait.
  const W = 300;
  const H = 100;
  const t0 = points[0]?.at ?? 0;
  const t1 = points[points.length - 1]?.at ?? 1;
  const xy = points.map((p) => [
    (W * (p.at - t0)) / Math.max(1, t1 - t0),
    8 + (H - 16) * (1 - (p.value - min) / Math.max(0.001, max - min))
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const gradientId = `wg-grad-${zone.id}`;

  return (
    <div className="wg-chart" onPointerDown={keepInside}>
      <div className="wg-chart-head">
        <span className="wg-chart-name" title={entityId}>
          {name}
        </span>
        <span className="wg-pill">{zone.chartHours === 168 ? t('desktop.chart.d7') : t('desktop.chart.h24')}</span>
        <button type="button" className="zw-ib" title={t('desktop.ha.open')} onClick={() => void window.api.ha.openDashboard()}>
          <Icon name="external" size={14} />
        </button>
      </div>
      {error ? (
        <p className="zw-vide">{error}</p>
      ) : valid ? (
        <>
          <div className="wg-chart-now">
            {fmt.format(last)}
            {unit && <small>{unit}</small>}
          </div>
          <svg className="wg-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
            aria-label={`${name} : ${fmt.format(min)} – ${fmt.format(max)} ${unit}`}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--zc)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--zc)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={line} fill="none" stroke="var(--zc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="wg-chart-foot">
            <span>
              {t('desktop.chart.min')} <b>{fmt.format(min)}</b>
            </span>
            <span>
              {t('desktop.chart.max')} <b>{fmt.format(max)}</b>
            </span>
          </div>
        </>
      ) : (
        <p className="zw-vide">{t('desktop.chart.notEnough')}</p>
      )}
    </div>
  );
}

/* ----------------------------------------------- presse-papiers épinglé */
function ClipsWidget(): ReactNode {
  const { t } = useI18n();
  const [items, setItems] = useState<ClipItem[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const load = (): void => void window.api.clips.list().then((all) => setItems(all.filter((c) => c.pinned)));
    load();
    return window.api.clips.onChanged(load);
  }, []);

  if (!items) return null;
  if (items.length === 0) return <div className="zw-vide">{t('desktop.clips.empty')}</div>;

  const copy = async (c: ClipItem): Promise<void> => {
    await window.api.clips.copy(c.id);
    setCopied(c.id);
    setTimeout(() => setCopied((x) => (x === c.id ? null : x)), 1200);
  };

  return (
    <div className="wg-list" onPointerDown={keepInside}>
      {items.map((c) => {
        const done = copied === c.id;
        return (
          <button key={c.id} type="button" className={`wg-row${done ? ' ok' : ''}`} title={t('desktop.clips.copy')} onClick={() => void copy(c)}>
            {c.kind === 'image' ? (
              <img className="wg-thumb" src={c.preview} alt="" />
            ) : (
              <Tile icon={c.kind === 'file' ? 'file' : 'type'} color={c.kind === 'file' ? '#5b7be0' : undefined} />
            )}
            <span className="wg-row-tx">{c.kind === 'image' ? t('desktop.clips.image') : c.kind === 'file' ? (c.filename ?? c.preview) : c.preview}</span>
            <span className="wg-row-end">
              <Icon name={done ? 'check' : 'copy'} size={14} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------ Home Assistant */
function HaWidget({ zone }: { zone: Zone }): ReactNode {
  const { t } = useI18n();
  const [list, setList] = useState<HaEntity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = async (): Promise<void> => {
    try {
      const result = await window.api.ha.entities();
      if (!alive.current) return;
      if (result.ok) {
        setList(result.list);
        setError(null);
      } else setError(result.error);
    } catch {
      if (alive.current) setError('connection');
    }
  };

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="zw-vide">{t(error === 'not-configured' ? 'desktop.ha.notConfigured' : 'desktop.ha.error', { error })}</div>;
  if (!list) return <div className="zw-vide">…</div>;
  const shown = zone.entities.map((id) => list.find((entity) => entity.id === id)).filter((entity): entity is HaEntity => !!entity);
  if (!shown.length) return <div className="zw-vide">{t('desktop.ha.none')}</div>;
  return <HaCards entities={shown} layout={zone.widgetLayout} readOnly={zone.widget === 'ha-sensor'} onRefresh={load} />;
}

/* --------------------------------------------------- barre de recherche */
function ResultIcon({ r }: { r: LauncherResult }): ReactNode {
  const [url, setUrl] = useState<string | null>(null);
  const filePath = r.icon.kind === 'file' ? r.icon.path : null;
  useEffect(() => {
    if (filePath) void window.api.launcher.icon(filePath).then(setUrl);
  }, [filePath]);
  if (r.icon.kind === 'sprite') return <Tile icon={r.icon.name} />;
  return url ? <img className="wg-thumb ico" src={url} alt="" /> : <Tile icon="file" />;
}

function SearchWidget(): ReactNode {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LauncherResult[]>([]);
  const [sel, setSel] = useState(0);
  const qid = useRef(0);

  useEffect(
    () =>
      window.api.launcher.onResults((m) => {
        if (m.queryId !== qid.current) return;
        setResults(m.results.slice(0, 8));
        setSel(0);
      }),
    []
  );

  const reset = (): void => {
    setQ('');
    setResults([]);
    qid.current++;
  };
  const run = async (r: LauncherResult | undefined): Promise<void> => {
    if (!r) return;
    const out = await window.api.launcher.execute(r.id, 'primary', q);
    if (out.kind === 'query') {
      setQ(out.text);
      void window.api.launcher.query(out.text, ++qid.current);
    } else if (out.kind !== 'keep') reset();
  };

  return (
    <div className="wg-search" onPointerDown={keepInside}>
      <label className="wg-field">
        <Icon name="search" size={16} />
        <input
          value={q}
          placeholder={t('desktop.search.ph')}
          aria-label={t('desktop.search.ph')}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) {
              qid.current++;
              setResults([]);
              return;
            }
            void window.api.launcher.query(e.target.value, ++qid.current);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') setSel((s) => Math.min(results.length - 1, s + 1));
            else if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
            else if (e.key === 'Enter') void run(results[sel]);
            else if (e.key === 'Escape') reset();
            else return;
            e.preventDefault();
          }}
        />
        {q && (
          <button type="button" className="zw-ib" aria-label={t('desktop.search.clear')} onClick={reset}>
            <Icon name="x" size={14} />
          </button>
        )}
      </label>
      {results.length > 0 ? (
        <div className="wg-list">
          {results.map((r, i) => (
            <button key={r.id} type="button" className={`wg-row${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => void run(r)}>
              <ResultIcon r={r} />
              <span className="wg-row-tx two">
                <b>{r.title}</b>
                {r.subtitle && <small>{r.subtitle}</small>}
              </span>
              {i === sel && <span className="kbd">↵</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="wg-hint">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> {t('desktop.search.hintMove')} · <span className="kbd">↵</span> {t('desktop.search.hintOpen')}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ mini cloud */
function CloudWidget({ content }: { content: ZoneContent }): ReactNode {
  const { t, lang } = useI18n();
  const list = content.cloud ?? [];
  return (
    <div className="wg-cloud">
      <div className={`wg-drop${content.cloudReady ? '' : ' off'}`}>
        <Tile icon="upload" />
        <span>{content.cloudReady ? t('desktop.cloud.drop') : t('desktop.cloud.notConfigured')}</span>
      </div>
      {list.length > 0 && (
        <div className="wg-list">
          {list.map((c, i) => (
            <div key={`${c.at}-${i}`} className={`wg-row static ${c.state}`} title={c.error ?? c.name}>
              <span className="wg-state">
                <Icon name={c.state === 'sent' ? 'check' : c.state === 'error' ? 'alert' : 'upload'} size={13} />
              </span>
              <span className="wg-row-tx">{c.name}</span>
              <span className="wg-row-end mono">
                {c.state === 'error' ? t('desktop.cloud.failed') : c.state === 'sending' ? t('desktop.cloud.sending') : formatSize(c.size, lang)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
