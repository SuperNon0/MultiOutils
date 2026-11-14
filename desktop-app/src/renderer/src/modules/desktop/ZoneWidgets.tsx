import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatSize, type HaEntity, type WidgetType, type Zone, type ZoneContent } from '../../../../common/desktop';
import type { LauncherResult } from '../../../../common/launcher';
import type { ClipItem } from '../../../../common/types';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

export const WIDGET_ICONS: Record<WidgetType, string> = {
  notes: 'edit',
  clips: 'clipboard',
  ha: 'home',
  'ha-sensor': 'signal',
  'ha-chart': 'signal',
  search: 'search',
  cloud: 'cloud'
};

/** Contenu d'une zone spéciale (étape 5) : notes, presse-papiers épinglé,
 *  Home Assistant, barre de recherche, mini cloud. */
export function WidgetBody({ zone, content }: { zone: Zone; content: ZoneContent }): ReactNode {
  switch (zone.widget) {
    case 'notes':
      return <NotesWidget zone={zone} />;
    case 'clips':
      return <ClipsWidget />;
    case 'ha':
      return <HaWidget zone={zone} />;
    case 'ha-sensor':
      return <HaSensorWidget zone={zone} />;
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

/* ------------------------------------------------------------- notes */
function NotesWidget({ zone }: { zone: Zone }): ReactNode {
  const { t } = useI18n();
  const [text, setText] = useState(zone.note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  useEffect(() => {
    setText(zone.note);
    latest.current = zone.note;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.id]);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        window.api.desktop.zone.note(latest.current);
      }
    },
    []
  );
  return (
    <textarea
      className="zw-note"
      value={text}
      spellCheck
      placeholder={t('desktop.notes.ph')}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        latest.current = v;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          window.api.desktop.zone.note(v);
        }, 500);
      }}
    />
  );
}

/* -------------------------------------------- presse-papiers épinglé */
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
  return (
    <div className="zw-wl">
      {items.map((c) => (
        <button
          key={c.id}
          className={`zw-clip${copied === c.id ? ' ok' : ''}`}
          title={t('desktop.clips.copy')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async () => {
            await window.api.clips.copy(c.id);
            setCopied(c.id);
            setTimeout(() => setCopied((x) => (x === c.id ? null : x)), 1200);
          }}
        >
          {c.kind === 'image' ? <img src={c.preview} alt="" /> : <Icon name={c.kind === 'file' ? 'file' : 'type'} size={14} />}
          {c.kind !== 'image' && <span>{c.kind === 'file' ? (c.filename ?? c.preview) : c.preview}</span>}
          {copied === c.id && <Icon name="check" size={14} />}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Home Assistant */
const HA_ICONS: Record<string, string> = {
  light: 'sun',
  switch: 'zap',
  fan: 'refresh',
  cover: 'window',
  media_player: 'play',
  climate: 'sun',
  scene: 'sparkle',
  script: 'play',
  automation: 'wrench',
  lock: 'lock',
  vacuum: 'home',
  button: 'dot',
  input_boolean: 'zap',
  input_button: 'dot'
};
function HaWidget({ zone }: { zone: Zone }): ReactNode {
  const { t } = useI18n();
  const [list, setList] = useState<HaEntity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = async (): Promise<void> => {
    const r = await window.api.ha.entities();
    if (r.ok) {
      setList(r.list);
      setError(null);
    } else setError(r.error);
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, []);
  if (error) return <div className="zw-vide">{t(error === 'not-configured' ? 'desktop.ha.notConfigured' : 'desktop.ha.error', { error })}</div>;
  if (!list) return <div className="zw-vide">…</div>;
  const shown = zone.entities.map((id) => list.find((e) => e.id === id)).filter((e): e is HaEntity => !!e);
  if (shown.length === 0) return <div className="zw-vide">{t('desktop.ha.none')}</div>;
  return (
    <div className="zw-ha">
      {shown.map((e) => (
        <button
          key={e.id}
          className={`zw-hab${e.on ? ' on' : ''}${busy === e.id ? ' busy' : ''}`}
          title={`${e.name} · ${e.state}`}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={async () => {
            setBusy(e.id);
            setList((l) => l?.map((x) => (x.id === e.id ? { ...x, on: !x.on } : x)) ?? l);
            await window.api.ha.toggle(e.id);
            setTimeout(() => {
              setBusy(null);
              void load();
            }, 700);
          }}
        >
          <Icon name={HA_ICONS[e.domain] ?? 'zap'} size={20} />
          <span>{e.name}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------- barre de recherche */
function ResultIcon({ r }: { r: LauncherResult }): ReactNode {
  const [url, setUrl] = useState<string | null>(null);
  const filePath = r.icon.kind === 'file' ? r.icon.path : null;
  useEffect(() => {
    if (filePath) void window.api.launcher.icon(filePath).then(setUrl);
  }, [filePath]);
  if (r.icon.kind === 'sprite') return <Icon name={r.icon.name} size={16} />;
  return url ? <img src={url} alt="" /> : <Icon name="file" size={16} />;
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
  const run = async (r: LauncherResult | undefined): Promise<void> => {
    if (!r) return;
    const out = await window.api.launcher.execute(r.id, 'primary', q);
    if (out.kind === 'query') {
      setQ(out.text);
      void window.api.launcher.query(out.text, ++qid.current);
    } else if (out.kind !== 'keep') {
      setQ('');
      setResults([]);
    }
  };
  return (
    <div className="zw-search" onPointerDown={(e) => e.stopPropagation()}>
      <label className="zw-sf">
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
            else if (e.key === 'Escape') {
              setQ('');
              setResults([]);
              qid.current++;
            } else return;
            e.preventDefault();
          }}
        />
      </label>
      {results.length > 0 && (
        <div className="zw-sr">
          {results.map((r, i) => (
            <button key={r.id} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => void run(r)}>
              <ResultIcon r={r} />
              <span className="tx">
                <b>{r.title}</b>
                {r.subtitle && <small>{r.subtitle}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- mini cloud */
function CloudWidget({ content }: { content: ZoneContent }): ReactNode {
  const { t, lang } = useI18n();
  const list = content.cloud ?? [];
  return (
    <div className="zw-cloud">
      <div className="zw-cdrop">
        <Icon name="cloud" size={26} />
        <span>{content.cloudReady ? t('desktop.cloud.drop') : t('desktop.cloud.notConfigured')}</span>
      </div>
      {list.map((c, i) => (
        <div key={`${c.at}-${i}`} className={`zw-ci ${c.state}`} title={c.error ?? c.name}>
          <Icon name={c.state === 'sent' ? 'check' : c.state === 'error' ? 'alert' : 'upload'} size={14} />
          <span className="nm">{c.name}</span>
          <span className="m">{c.state === 'error' ? t('desktop.cloud.failed') : formatSize(c.size, lang)}</span>
        </div>
      ))}
    </div>
  );
}

/** Capteurs HA en lecture seule, style Encre avec couleur par zone. */
function HaSensorWidget({ zone }: { zone: Zone }): ReactNode {
  const [list, setList] = useState<HaEntity[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const result = await window.api.ha.entities();
        if (!alive) return;
        if (result.ok) { setList(result.list); setError(null); }
        else setError(result.error);
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (error) return <div className="zw-vide">{error}</div>;
  const selected = zone.entities.map((id) => list.find((e) => e.id === id)).filter((e): e is HaEntity => !!e);
  if (!selected.length) return <div className="zw-vide">Choisis des capteurs dans Bureau → Modifier la zone.</div>;
  return (
    <div className={`zw-sensors ${zone.widgetLayout}`}>
      {selected.map((entity) => (
        <div key={entity.id} className="zw-sensor" title={entity.id}>
          <span className="zw-sensor-name">{entity.name}</span>
          <span className="zw-sensor-value">{entity.state}{entity.unit ? ` ${entity.unit}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

/** Courbe compacte : aperçu léger, détails conservés dans Home Assistant. */
function HaChartWidget({ zone }: { zone: Zone }): ReactNode {
  const entityId = zone.entities[0] ?? '';
  const [points, setPoints] = useState<Array<{ at: number; value: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      if (!entityId) { setPoints([]); return; }
      try {
        const response = await window.api.ha.series(entityId, zone.chartHours);
        if (!alive) return;
        if (response.ok) { setPoints(response.points); setError(null); }
        else setError(response.error);
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 300_000);
    return () => { alive = false; clearInterval(timer); };
  }, [entityId, zone.chartHours]);
  if (!entityId) return <div className="zw-vide">Sélectionne un capteur numérique dans Bureau → Modifier la zone.</div>;
  const valid = points.length >= 2;
  const values = points.map((p) => p.value);
  const min = valid ? Math.min(...values) : 0;
  const max = valid ? Math.max(...values) : 1;
  const minAt = points[0]?.at ?? 0;
  const maxAt = points[points.length - 1]?.at ?? 1;
  const line = valid ? points.map((p) => {
    const x = 4 + 292 * (p.at - minAt) / Math.max(1, maxAt - minAt);
    const y = 88 - 76 * (p.value - min) / Math.max(0.001, max - min);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') : '';
  return (
    <div className="zw-chart">
      <div className="zw-chart-title"><span title={entityId}>{entityId.split('.')[1]?.replace(/_/g, ' ') ?? entityId}</span><strong>{zone.chartHours === 168 ? '7 jours' : '24 h'}</strong></div>
      {error ? <p className="zw-vide">{error}</p> : valid ? (
        <>
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label={`Historique : de ${min} à ${max}`}>
            <polyline points={line} fill="none" stroke="var(--zc)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          </svg>
          <div className="zw-chart-values"><span>{min.toLocaleString()} min</span><strong>{values[values.length - 1]?.toLocaleString()}</strong><span>{max.toLocaleString()} max</span></div>
        </>
      ) : <p className="zw-vide">Pas assez de mesures numériques disponibles.</p>}
      <button type="button" className="btn xs zw-chart-more" onPointerDown={(e) => e.stopPropagation()} onClick={() => void window.api.ha.openDashboard()}>Ouvrir Home Assistant</button>
    </div>
  );
}
