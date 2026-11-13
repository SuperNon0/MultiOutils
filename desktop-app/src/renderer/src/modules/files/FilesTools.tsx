import { useEffect, useState, type ReactNode } from 'react';
import { formatSize } from '../../../../common/desktop';
import {
  batchConflicts,
  batchNames,
  defaultBatch,
  TAG_COLORS,
  type BatchRename,
  type CleanRule,
  type DupGroup,
  type FileEntry,
  type FileJob,
  type UsageItem
} from '../../../../common/files';
import { ui } from '../../encre/ui';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSwitch } from '../../host/reglages';
import { useI18n } from '../../i18n';

const base = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const parent = (p: string): string => p.replace(/[\\/][^\\/]+[\\/]?$/, '') || p;

/* -------------------------------------------------------------- aperçu */
export function PreviewSheet({ entry, onClose, onPrev, onNext }: { entry: FileEntry; onClose(): void; onPrev?(): void; onNext?(): void }): ReactNode {
  const { t, lang } = useI18n();
  const [pv, setPv] = useState<Awaited<ReturnType<typeof window.api.fm.preview>> | null>(null);
  const [ocr, setOcr] = useState<{ busy: boolean; text: string | null; error: string | null }>({ busy: false, text: null, error: null });
  useEffect(() => {
    setPv(null);
    setOcr({ busy: false, text: null, error: null });
    void window.api.fm.preview(entry.path).then(setPv);
  }, [entry.path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' && !(e.target as HTMLElement).closest('input,textarea')) {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowRight') onNext?.();
      if (e.key === 'ArrowLeft') onPrev?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);
  const canOcr = pv?.kind === 'image' || pv?.kind === 'thumb';
  return (
    <Feuille
      titre={entry.name}
      onClose={onClose}
      large
      actions={
        <>
          {canOcr && (
            <button
              className="btn sm"
              disabled={ocr.busy}
              onClick={async () => {
                setOcr({ busy: true, text: null, error: null });
                const r = await window.api.fm.ocr(entry.path);
                setOcr({ busy: false, text: r.ok ? (r.text ?? '') : null, error: r.ok ? null : (r.error ?? '') });
              }}
            >
              <Icon name="textscan" size={16} />
              {ocr.busy ? t('files.ocr.busy') : t('files.ocr.read')}
            </button>
          )}
          <button className="btn sm" onClick={() => void window.api.fm.open(entry.path)}>
            <Icon name="external" size={16} />
            {t('files.open')}
          </button>
        </>
      }
    >
      <div className="fm-pv">
        {!pv ? (
          <p className="muted">…</p>
        ) : pv.kind === 'text' ? (
          <pre className="fm-pv-text">
            {pv.text}
            {pv.truncated ? '\n…' : ''}
          </pre>
        ) : pv.data ? (
          <img src={pv.data} alt={entry.name} />
        ) : (
          <p className="muted">{t('files.preview.none')}</p>
        )}
        <p className="muted petit">
          {entry.isDir ? t('files.kind.folder') : `${entry.ext.toUpperCase()} · ${formatSize(entry.size, lang)}`} ·{' '}
          {new Date(entry.mtime).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
        </p>
        {ocr.error && <p className="dan petit">{ocr.error}</p>}
        {ocr.text !== null && (
          <div className="fm-ocr">
            <div className="ligne" style={{ justifyContent: 'space-between' }}>
              <span className="lbl-mono">{t('files.ocr.result')}</span>
              <button
                className="btn xs"
                onClick={() => {
                  void window.api.system.copyText(ocr.text ?? '');
                  ui.toast(t('files.copied'));
                }}
              >
                <Icon name="copy" size={14} />
                {t('files.copy')}
              </button>
            </div>
            <textarea readOnly value={ocr.text || t('files.ocr.empty')} />
          </div>
        )}
      </div>
    </Feuille>
  );
}

/* ---------------------------------------------------- renommage en lot */
export function BatchRenameSheet({ items, siblings, onClose, onDone }: { items: FileEntry[]; siblings: string[]; onClose(): void; onDone(): void }): ReactNode {
  const { t } = useI18n();
  const [o, setO] = useState<BatchRename>({ ...defaultBatch(), pattern: '{nom}' });
  const names = batchNames(items, o);
  const others = siblings.filter((n) => !items.some((i) => i.name === n));
  const bad = batchConflicts(names, others);
  const up = (patch: Partial<BatchRename>): void => setO((x) => ({ ...x, ...patch }));
  return (
    <Feuille titre={t('files.batch.title', { n: items.length })} onClose={onClose} large>
      <div className="fm-batch">
        <label className="champ">
          <input autoFocus value={o.pattern} onChange={(e) => up({ pattern: e.target.value })} placeholder="{nom} - {n}" aria-label={t('files.batch.pattern')} />
        </label>
        <p className="muted petit" style={{ margin: 0 }}>
          {t('files.batch.help')}
        </p>
        <div className="fm-batch-g">
          <label className="champ">
            <input value={o.find} onChange={(e) => up({ find: e.target.value })} placeholder={t('files.batch.find')} aria-label={t('files.batch.find')} />
          </label>
          <label className="champ">
            <input value={o.replace} onChange={(e) => up({ replace: e.target.value })} placeholder={t('files.batch.replace')} aria-label={t('files.batch.replace')} />
          </label>
        </div>
        <div className="fm-batch-g">
          <RegSwitch titre={t('files.batch.regex')} checked={o.regex} onChange={(regex) => up({ regex })} />
          <RegLigne titre={t('files.batch.start')} htmlFor="fm-bs">
            <input id="fm-bs" className="fm-numin" type="number" min={0} value={o.start} onChange={(e) => up({ start: Number(e.target.value) || 0 })} />
          </RegLigne>
          <RegLigne titre={t('files.batch.pad')} htmlFor="fm-bp">
            <input id="fm-bp" className="fm-numin" type="number" min={0} max={6} value={o.pad} onChange={(e) => up({ pad: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })} />
          </RegLigne>
          <RegLigne titre={t('files.batch.case')}>
            <div className="seg">
              {(['keep', 'lower', 'upper'] as const).map((c) => (
                <button key={c} className={o.case === c ? 'on' : ''} onClick={() => up({ case: c })}>
                  {t(`files.batch.case.${c}`)}
                </button>
              ))}
            </div>
          </RegLigne>
        </div>
        <div className="fm-batch-l">
          {items.map((it, i) => (
            <div key={it.path} className={bad.has(i) ? 'bad' : ''}>
              <span>{it.name}</span>
              <Icon name="chev" size={14} />
              <b>{names[i]}</b>
            </div>
          ))}
        </div>
        {bad.size > 0 && <p className="dan petit">{t('files.batch.conflict')}</p>}
        <div className="br-act">
          <button className="btn" onClick={onClose}>
            {t('desktop.rules.cancel')}
          </button>
          <button
            className="btn pri"
            disabled={bad.size > 0}
            onClick={async () => {
              const res = await window.api.fm.batchRename(
                items.map((i) => i.path),
                names
              );
              const failed = res.filter((r) => !r).length;
              ui.toast(failed ? t('files.batch.partial', { n: failed }) : t('files.batch.done', { n: items.length }), { erreur: failed > 0 });
              onDone();
            }}
          >
            <Icon name="check" size={16} />
            {t('files.batch.apply')}
          </button>
        </div>
      </div>
    </Feuille>
  );
}

/* ----------------------------------------------------------- étiquettes */
export function TagsSheet({ paths, tags, onClose, onChange }: { paths: string[]; tags: Record<string, string[]>; onClose(): void; onChange(t: Record<string, string[]>): void }): ReactNode {
  const { t } = useI18n();
  return (
    <Feuille titre={t('files.tags.title', { n: paths.length })} onClose={onClose}>
      <div className="fm-tagpick">
        {TAG_COLORS.map((c, i) => {
          const all = paths.every((p) => tags[p]?.includes(c));
          return (
            <button
              key={c}
              className={`chip${all ? ' on' : ''}`}
              aria-pressed={all}
              onClick={async () => onChange(await window.api.fm.setTag(paths, c, !all))}
            >
              <i style={{ background: c }} />
              {t(`desktop.color.${i}`)}
            </button>
          );
        })}
      </div>
    </Feuille>
  );
}

/* ---------------------------------------------------- copies en cours */
export function JobsBar({ jobs }: { jobs: FileJob[] }): ReactNode {
  const { t, lang } = useI18n();
  if (jobs.length === 0) return null;
  const active = jobs.some((j) => j.state === 'running' || j.state === 'paused');
  return (
    <div className="fm-jobs" role="status">
      {jobs.slice(-4).map((j) => {
        const pct = j.total > 0 ? Math.round((j.done / j.total) * 100) : j.state === 'done' ? 100 : 0;
        return (
          <div key={j.id} className={`fm-job ${j.state}`}>
            <Icon name={j.kind === 'copy' ? 'copy' : 'arrow'} size={16} />
            <span className="fm-job-t">
              <b>
                {t(`files.job.${j.kind}`, { n: j.sources.length })} → {base(j.dest)}
              </b>
              <span className="muted petit">
                {j.state === 'running' || j.state === 'paused'
                  ? `${formatSize(j.done, lang)} / ${formatSize(j.total, lang)} · ${j.current}`
                  : t(`files.job.${j.state}`)}
                {j.error ? ` · ${j.error}` : ''}
              </span>
              <span className="fm-bar">
                <i style={{ width: `${pct}%` }} />
              </span>
            </span>
            {j.state === 'running' && (
              <button className="ib" aria-label={t('files.job.pause')} onClick={() => void window.api.fm.job(j.id, 'pause')}>
                <Icon name="hourglass" size={16} />
              </button>
            )}
            {j.state === 'paused' && (
              <button className="ib" aria-label={t('files.job.resume')} onClick={() => void window.api.fm.job(j.id, 'resume')}>
                <Icon name="play" size={16} />
              </button>
            )}
            {(j.state === 'running' || j.state === 'paused') && (
              <button className="ib" aria-label={t('files.job.cancel')} onClick={() => void window.api.fm.job(j.id, 'cancel')}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        );
      })}
      {!active && (
        <button className="btn xs gh" onClick={() => void window.api.fm.job('', 'clear')}>
          {t('files.job.clear')}
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- outils (vues) */
function useProgress(task: 'dups' | 'usage'): { done: number; total: number; phase?: string } | null {
  const [p, setP] = useState<{ done: number; total: number; phase?: string } | null>(null);
  useEffect(() => window.api.fm.onProgress((x) => x.task === task && setP(x)), [task]);
  return p;
}

export function DupsView({ root, onOpen }: { root: string; onOpen(p: string): void }): ReactNode {
  const { t, lang } = useI18n();
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const prog = useProgress('dups');
  const run = async (): Promise<void> => {
    setBusy(true);
    setGroups(null);
    setPick(new Set());
    const g = await window.api.fm.duplicates(root);
    setGroups(g);
    // par défaut : on garde le premier de chaque groupe, on coche les autres
    setPick(new Set(g.flatMap((x) => x.paths.slice(1))));
    setBusy(false);
  };
  const waste = (groups ?? []).reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
  return (
    <div className="fm-tool">
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {t('files.dups.intro', { dir: root })}
        </p>
        {busy ? (
          <button className="btn sm" onClick={() => void window.api.fm.stopScan()}>
            <Icon name="x" size={16} />
            {t('files.stop')}
          </button>
        ) : (
          <button className="btn sm pri" onClick={() => void run()}>
            <Icon name="search" size={16} />
            {t('files.dups.run')}
          </button>
        )}
      </div>
      {busy && prog && (
        <p className="muted petit">{prog.phase === 'hash' ? t('files.dups.hashing', { done: prog.done, total: prog.total }) : t('files.dups.scanning', { n: prog.done })}</p>
      )}
      {groups && groups.length === 0 && <p className="muted">{t('files.dups.none')}</p>}
      {groups && groups.length > 0 && (
        <>
          <div className="ligne" style={{ justifyContent: 'space-between', margin: '6px 0 10px' }}>
            <b>{t('files.dups.found', { n: groups.length, size: formatSize(waste, lang) })}</b>
            <button
              className="btn sm"
              disabled={pick.size === 0}
              onClick={async () => {
                const ok = await ui.confirmer(t('files.dups.trashConfirm', { n: pick.size }), { ok: t('files.trash'), danger: true });
                if (!ok) return;
                const n = await window.api.fm.trash([...pick]);
                ui.toast(t('files.trashed', { n }));
                setGroups(groups.map((g) => ({ ...g, paths: g.paths.filter((p) => !pick.has(p)) })).filter((g) => g.paths.length > 1));
                setPick(new Set());
              }}
            >
              <Icon name="trash" size={16} />
              {t('files.dups.trashPicked', { n: pick.size })}
            </button>
          </div>
          {groups.slice(0, 300).map((g) => (
            <div key={g.hash} className="carte fm-dup">
              <div className="lbl-mono">
                {formatSize(g.size, lang)} × {g.paths.length}
              </div>
              {g.paths.map((p) => (
                <label key={p} className="fm-dup-r">
                  <input
                    type="checkbox"
                    checked={pick.has(p)}
                    onChange={(e) => {
                      const n = new Set(pick);
                      if (e.target.checked) n.add(p);
                      else n.delete(p);
                      // jamais tout un groupe : il resterait zéro copie
                      if (g.paths.every((x) => n.has(x))) return;
                      setPick(n);
                    }}
                  />
                  <span className="fm-dup-p" title={p}>
                    <b>{base(p)}</b> <span className="muted">{parent(p)}</span>
                  </span>
                  <button className="ib" aria-label={t('files.showIn')} onClick={() => onOpen(parent(p))}>
                    <Icon name="folderopen" size={16} />
                  </button>
                </label>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function UsageView({ root, onOpen }: { root: string; onOpen(p: string): void }): ReactNode {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<UsageItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const prog = useProgress('usage');
  const run = async (): Promise<void> => {
    setBusy(true);
    setItems(null);
    setItems(await window.api.fm.usage(root));
    setBusy(false);
  };
  useEffect(() => {
    void run();
    return () => void window.api.fm.stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);
  const max = Math.max(1, ...(items ?? []).map((i) => i.size));
  const total = (items ?? []).reduce((s, i) => s + i.size, 0);
  return (
    <div className="fm-tool">
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {busy ? t('files.usage.busy', { done: prog?.done ?? 0, total: prog?.total ?? 0 }) : t('files.usage.total', { size: formatSize(total, lang), dir: root })}
        </p>
        <button className="btn sm" disabled={busy} onClick={() => void run()}>
          <Icon name="refresh" size={16} />
          {t('files.refresh')}
        </button>
      </div>
      <div className="fm-usage">
        {(items ?? []).slice(0, 80).map((i) => (
          <button key={i.path} className="fm-usage-r" disabled={!i.isDir} onClick={() => onOpen(i.path)}>
            <Icon name={i.isDir ? 'folder' : 'file'} size={16} />
            <span className="fm-usage-n">{i.name}</span>
            <span className="fm-bar">
              <i style={{ width: `${(i.size / max) * 100}%` }} />
            </span>
            <span className="mono petit">{formatSize(i.size, lang)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CleanView(): ReactNode {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ rules: CleanRule[]; last: number } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => void window.api.fm.cleanGet().then(setData), []);
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(async () => {
      const out: Record<string, number> = {};
      for (const r of data.rules) out[r.id] = (await window.api.fm.cleanPreview(r)).length;
      setCounts(out);
    }, 300);
    return () => clearTimeout(timer);
  }, [data]);
  if (!data) return null;
  const save = async (rules: CleanRule[]): Promise<void> => setData({ ...data, rules: await window.api.fm.cleanSet(rules) });
  const up = (id: string, patch: Partial<CleanRule>): void => void save(data.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="fm-tool">
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {t('files.clean.intro')}
          {data.last ? ` ${t('files.clean.last', { at: new Date(data.last).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB') })}` : ''}
        </p>
        <button
          className="btn sm"
          onClick={async () => {
            const dir = await window.api.desktop.pickFolder();
            if (dir) void save([...data.rules, { id: Math.random().toString(36).slice(2, 10), enabled: true, folder: dir, days: 30, exts: '', folders: false }]);
          }}
        >
          <Icon name="plus" size={16} />
          {t('files.clean.add')}
        </button>
      </div>
      {data.rules.length === 0 && <p className="muted petit">{t('files.clean.none')}</p>}
      {data.rules.map((r) => (
        <div key={r.id} className="carte fm-clean">
          <div className="ligne" style={{ justifyContent: 'space-between', gap: 8 }}>
            <b className="br-name" title={r.folder}>
              {r.folder}
            </b>
            <input type="checkbox" className="sw" aria-label={t('desktop.rules.enabled')} checked={r.enabled} onChange={(e) => up(r.id, { enabled: e.target.checked })} />
          </div>
          <div className="fm-clean-g">
            <label className="champ" style={{ height: 34 }}>
              <span className="muted petit">{t('files.clean.after')}</span>
              <input type="number" min={1} value={r.days} onChange={(e) => up(r.id, { days: Number(e.target.value) || 30 })} aria-label={t('files.clean.after')} />
              <span className="muted petit">{t('desktop.rules.days')}</span>
            </label>
            <label className="champ" style={{ height: 34 }}>
              <input value={r.exts} placeholder={t('files.clean.extsPh')} onChange={(e) => up(r.id, { exts: e.target.value })} aria-label={t('files.clean.exts')} />
            </label>
          </div>
          <RegSwitch titre={t('files.clean.folders')} checked={r.folders} onChange={(folders) => up(r.id, { folders })} />
          <div className="ligne" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted petit">{t('files.clean.matches', { n: counts[r.id] ?? 0 })}</span>
            <span className="ligne" style={{ gap: 6 }}>
              <button
                className="btn xs"
                disabled={!counts[r.id]}
                onClick={async () => {
                  const ok = await ui.confirmer(t('files.clean.runConfirm', { n: counts[r.id] ?? 0 }), { ok: t('files.trash'), danger: true });
                  if (!ok) return;
                  const n = await window.api.fm.cleanRun(r.id);
                  ui.toast(t('files.trashed', { n }));
                  setData({ ...data });
                }}
              >
                <Icon name="trash" size={14} />
                {t('files.clean.runNow')}
              </button>
              <button className="btn xs gh" onClick={() => void save(data.rules.filter((o) => o.id !== r.id))}>
                <Icon name="x" size={14} />
                {t('desktop.menu.delete')}
              </button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrashView(): ReactNode {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Awaited<ReturnType<typeof window.api.fm.trashList>> | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const load = (): void => {
    setItems(null);
    void window.api.fm.trashList().then(setItems);
  };
  useEffect(load, []);
  return (
    <div className="fm-tool">
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {t('files.trashView.intro')}
        </p>
        <button
          className="btn sm"
          disabled={pick.size === 0}
          onClick={async () => {
            if (await window.api.fm.trashRestore([...pick])) ui.toast(t('files.trashView.restored', { n: pick.size }));
            setPick(new Set());
            load();
          }}
        >
          <Icon name="undo" size={16} />
          {t('files.trashView.restore', { n: pick.size })}
        </button>
        <button
          className="btn sm gh"
          disabled={!items?.length}
          onClick={async () => {
            if (!(await ui.confirmer(t('files.trashView.emptyConfirm'), { ok: t('files.trashView.empty'), danger: true }))) return;
            await window.api.fm.emptyTrash();
            load();
          }}
        >
          <Icon name="trash" size={16} />
          {t('files.trashView.empty')}
        </button>
      </div>
      {!items ? (
        <p className="muted petit">…</p>
      ) : items.length === 0 ? (
        <p className="muted">{t('files.trashView.none')}</p>
      ) : (
        <div className="liste-r">
          {items.map((i) => (
            <label key={i.id} className="li">
              <input
                type="checkbox"
                checked={pick.has(i.id)}
                onChange={(e) => {
                  const n = new Set(pick);
                  if (e.target.checked) n.add(i.id);
                  else n.delete(i.id);
                  setPick(n);
                }}
              />
              <span className="tx" style={{ flex: 1, minWidth: 0 }}>
                <b className="br-name">{i.name}</b>
                <span className="br-sub">
                  {i.from} · {i.deletedAt} · {formatSize(i.size, lang)}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
