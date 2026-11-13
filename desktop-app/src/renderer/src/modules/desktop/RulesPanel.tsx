import { useEffect, useState, type ReactNode } from 'react';
import {
  RULE_OPS,
  type DesktopState,
  type EntryKind,
  type Rule,
  type RuleCondition,
  type RuleField,
  type RuleLogEntry
} from '../../../../common/desktop';
import { ui } from '../../encre/ui';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

const KINDS: EntryKind[] = ['shortcut', 'app', 'folder', 'image', 'video', 'audio', 'pdf', 'doc', 'sheet', 'slides', 'archive', 'code', 'text', 'other'];
const FIELDS = Object.keys(RULE_OPS) as RuleField[];

const newId = (): string => (crypto.randomUUID ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(16).slice(2)}`);

/** Règles et journal, partagés par les deux onglets de la page. */
export function useRules(): [{ rules: Rule[]; log: RuleLogEntry[] } | null, (rules: Rule[]) => Promise<void>] {
  const [data, setData] = useState<{ rules: Rule[]; log: RuleLogEntry[] } | null>(null);
  useEffect(() => {
    void window.api.desktop.rules.get().then(setData);
    return window.api.desktop.rules.onChange(setData);
  }, []);
  const save = async (rules: Rule[]): Promise<void> => {
    const saved = await window.api.desktop.rules.set(rules);
    setData((d) => ({ rules: saved, log: d?.log ?? [] }));
  };
  return [data, save];
}

function blankRule(state: DesktopState, name: string): Rule {
  const target = state.zones.find((z) => z.kind === 'shortcuts' && !z.inbox) ?? state.zones.find((z) => z.kind === 'shortcuts');
  return {
    id: newId(),
    name,
    enabled: true,
    match: 'all',
    conditions: [{ field: 'kind', op: 'is', value: 'image' }],
    action: { type: 'zone', zoneId: target?.id ?? '' },
    mode: 'continuous'
  };
}

function ValueInput({ c, onChange }: { c: RuleCondition; onChange(v: string): void }): ReactNode {
  const { t } = useI18n();
  if (c.field === 'kind') {
    return (
      <select className="select sm" value={c.value} onChange={(e) => onChange(e.target.value)} aria-label={t('desktop.rules.value')}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`desktop.kind.${k}`)}
          </option>
        ))}
      </select>
    );
  }
  const numeric = c.field === 'age' || c.field === 'size';
  return (
    <label className="champ br-val">
      <input
        value={c.value}
        inputMode={numeric ? 'decimal' : undefined}
        placeholder={t(`desktop.rules.ph.${c.field}`)}
        aria-label={t('desktop.rules.value')}
        onChange={(e) => onChange(e.target.value)}
      />
      {numeric && <span className="muted petit">{t(c.field === 'age' ? 'desktop.rules.days' : 'desktop.rules.mb')}</span>}
    </label>
  );
}

function RuleEditor({ initial, state, onClose, onSave }: { initial: Rule; state: DesktopState; onClose(): void; onSave(r: Rule): void }): ReactNode {
  const { t } = useI18n();
  const [r, setR] = useState<Rule>(initial);
  const [preview, setPreview] = useState<{ count: number; names: string[] } | null>(null);
  const up = (patch: Partial<Rule>): void => setR((o) => ({ ...o, ...patch }));
  const setCond = (i: number, patch: Partial<RuleCondition>): void =>
    setR((o) => ({ ...o, conditions: o.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  useEffect(() => {
    const timer = setTimeout(() => void window.api.desktop.rules.preview(r).then(setPreview), 300);
    return () => clearTimeout(timer);
  }, [r]);

  const zones = state.zones.filter((z) => z.kind === 'shortcuts');
  const pick = async (key: 'source' | 'dest'): Promise<void> => {
    const dir = await window.api.desktop.pickFolder();
    if (dir && r.action.type === 'move') up({ action: { ...r.action, [key]: dir } });
  };
  const valid =
    r.conditions.length > 0 &&
    (r.action.type === 'zone' ? !!r.action.zoneId : !!r.action.source && !!r.action.dest && r.action.source !== r.action.dest);

  return (
    <Feuille titre={t(initial.name ? 'desktop.rules.edit' : 'desktop.rules.new')} onClose={onClose} large>
      <div className="br-ed">
        <label className="champ">
          <input autoFocus value={r.name} placeholder={t('desktop.rules.namePh')} onChange={(e) => up({ name: e.target.value })} />
        </label>

        <div className="br-l">
          <span className="lbl-mono">{t('desktop.rules.when')}</span>
          <div className="seg br-seg">
            {(['all', 'any'] as const).map((m) => (
              <button key={m} className={r.match === m ? 'on' : ''} onClick={() => up({ match: m })}>
                {t(`desktop.rules.match.${m}`)}
              </button>
            ))}
          </div>
        </div>
        {r.conditions.map((c, i) => (
          <div key={i} className="br-cond">
            <select
              className="select sm"
              value={c.field}
              aria-label={t('desktop.rules.field')}
              onChange={(e) => {
                const field = e.target.value as RuleField;
                setCond(i, { field, op: RULE_OPS[field][0], value: field === 'kind' ? 'image' : '' });
              }}
            >
              {FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t(`desktop.rules.field.${f}`)}
                </option>
              ))}
            </select>
            <select className="select sm" value={c.op} aria-label={t('desktop.rules.op')} onChange={(e) => setCond(i, { op: e.target.value as RuleCondition['op'] })}>
              {RULE_OPS[c.field].map((o) => (
                <option key={o} value={o}>
                  {t(`desktop.rules.op.${o}`)}
                </option>
              ))}
            </select>
            <ValueInput c={c} onChange={(value) => setCond(i, { value })} />
            <button
              className="ib"
              aria-label={t('desktop.rules.removeCond')}
              disabled={r.conditions.length === 1}
              onClick={() => up({ conditions: r.conditions.filter((_, j) => j !== i) })}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
        <button className="btn gh sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ conditions: [...r.conditions, { field: 'name', op: 'contains', value: '' }] })}>
          <Icon name="plus" size={16} />
          {t('desktop.rules.addCond')}
        </button>

        <div className="br-l">
          <span className="lbl-mono">{t('desktop.rules.then')}</span>
          <div className="seg br-seg">
            <button className={r.action.type === 'zone' ? 'on' : ''} onClick={() => up({ action: { type: 'zone', zoneId: zones[0]?.id ?? '' } })}>
              {t('desktop.rules.action.zone')}
            </button>
            <button className={r.action.type === 'move' ? 'on' : ''} onClick={() => up({ action: { type: 'move', source: '', dest: '' } })}>
              {t('desktop.rules.action.move')}
            </button>
          </div>
        </div>
        {r.action.type === 'zone' ? (
          <select
            className="select"
            value={r.action.zoneId}
            aria-label={t('desktop.rules.action.zone')}
            onChange={(e) => up({ action: { type: 'zone', zoneId: e.target.value } })}
          >
            {zones.length === 0 && <option value="">{t('desktop.rules.noZone')}</option>}
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="br-move">
            <button className="btn sm" onClick={() => void pick('source')}>
              <Icon name="folderopen" size={16} />
              <span className="br-path">{r.action.source || t('desktop.rules.source')}</span>
            </button>
            <Icon name="chev" size={16} />
            <button className="btn sm" onClick={() => void pick('dest')}>
              <Icon name="folderopen" size={16} />
              <span className="br-path">{r.action.dest || t('desktop.rules.dest')}</span>
            </button>
            <p className="muted petit" style={{ flexBasis: '100%', margin: 0 }}>
              {t('desktop.rules.moveWarn')}
            </p>
          </div>
        )}

        <div className="br-l">
          <span className="lbl-mono">{t('desktop.rules.modeLbl')}</span>
          <div className="seg br-seg">
            {(['continuous', 'once'] as const).map((m) => (
              <button key={m} className={r.mode === m ? 'on' : ''} onClick={() => up({ mode: m })}>
                {t(`desktop.rules.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="br-prev" role="status">
          <Icon name="info" size={16} />
          {preview ? (
            <span>
              {t('desktop.rules.preview', { n: preview.count })}
              {preview.names.length > 0 && <span className="muted"> · {preview.names.join(', ')}{preview.count > preview.names.length ? '…' : ''}</span>}
            </span>
          ) : (
            <span className="muted">…</span>
          )}
        </div>

        <div className="br-act">
          <button className="btn" onClick={onClose}>
            {t('desktop.rules.cancel')}
          </button>
          <button className="btn pri" disabled={!valid} onClick={() => onSave({ ...r, name: r.name.trim() || t('desktop.rules.untitled') })}>
            <Icon name="check" size={16} />
            {t('desktop.rules.save')}
          </button>
        </div>
      </div>
    </Feuille>
  );
}

/** Onglet « Règles » de la page Bureau. */
export function RulesTab({ state }: { state: DesktopState }): ReactNode {
  const { t } = useI18n();
  const [data, save] = useRules();
  const [editing, setEditing] = useState<Rule | null>(null);
  if (!data) return null;
  const rules = data.rules;

  const summary = (r: Rule): string => {
    if (r.action.type === 'zone') {
      const id = r.action.zoneId;
      const z = state.zones.find((o) => o.id === id);
      return t('desktop.rules.sum.zone', { n: r.conditions.length, zone: z?.title ?? '—' });
    }
    const last = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
    return t('desktop.rules.sum.move', { n: r.conditions.length, from: last(r.action.source) || '—', to: last(r.action.dest) || '—' });
  };
  const swap = (i: number, j: number): void => {
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
  };
  const upsert = (r: Rule): void => {
    const exists = rules.some((o) => o.id === r.id);
    void save(exists ? rules.map((o) => (o.id === r.id ? r : o)) : [...rules, r]);
    setEditing(null);
  };
  const applyNow = async (r: Rule): Promise<void> => {
    const n = await window.api.desktop.rules.apply(r.id);
    ui.toast(t('desktop.rules.applied', { n }));
  };
  const menu = (r: Rule, i: number, anchor: HTMLElement): void => {
    ui.menu(
      anchor,
      [
        { icone: 'edit', texte: t('desktop.rules.editShort'), action: () => setEditing(r) },
        { icone: 'play', texte: t('desktop.rules.applyNow'), action: () => void applyNow(r) },
        { icone: 'copy', texte: t('desktop.rules.duplicate'), action: () => void save([...rules.slice(0, i + 1), { ...r, id: newId(), name: `${r.name} (2)` }, ...rules.slice(i + 1)]) },
        null,
        {
          icone: 'trash',
          texte: t('desktop.menu.delete'),
          danger: true,
          action: () => {
            const before = rules;
            void save(rules.filter((o) => o.id !== r.id));
            ui.toast(t('desktop.rules.deleted', { name: r.name }), { annuler: () => void save(before) });
          }
        }
      ],
      { titre: r.name }
    );
  };

  return (
    <div>
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {t('desktop.rules.intro')}
        </p>
        <button
          className="btn sm"
          disabled={rules.length === 0}
          onClick={async () => {
            const n = await window.api.desktop.rules.applyAll();
            ui.toast(t('desktop.rules.applied', { n }));
          }}
        >
          <Icon name="sparkle" size={16} />
          {t('desktop.rules.sortNow')}
        </button>
        <button className="btn sm pri" onClick={() => setEditing(blankRule(state, ''))}>
          <Icon name="plus" size={16} />
          {t('desktop.rules.new')}
        </button>
      </div>
      {rules.length === 0 ? (
        <div className="carte bz-vide">
          <h2 className="sec-t">{t('desktop.rules.empty.title')}</h2>
          <p>{t('desktop.rules.empty.text')}</p>
        </div>
      ) : (
        <div className="liste-r">
          {rules.map((r, i) => (
            <div key={r.id} className="li">
              <span className="li-ic">
                <Icon name={r.action.type === 'zone' ? 'grid' : 'folderopen'} size={18} />
              </span>
              <span className="tx" style={{ flex: 1, minWidth: 0 }}>
                <b>{r.name}</b>
                <span className="br-sub">{summary(r)}</span>
              </span>
              <span className="badge">{t(`desktop.rules.mode.${r.mode}`)}</span>
              <button className="ib" style={{ width: 28, height: 28 }} disabled={i === 0} aria-label={t('desktop.rules.up')} onClick={() => swap(i, i - 1)}>
                <Icon name="chevu" size={16} />
              </button>
              <button
                className="ib"
                style={{ width: 28, height: 28 }}
                disabled={i === rules.length - 1}
                aria-label={t('desktop.rules.down')}
                onClick={() => swap(i, i + 1)}
              >
                <Icon name="chevd" size={16} />
              </button>
              <input
                type="checkbox"
                className="sw"
                aria-label={t('desktop.rules.enabled')}
                checked={r.enabled}
                onChange={(e) => void save(rules.map((o) => (o.id === r.id ? { ...o, enabled: e.target.checked } : o)))}
              />
              <button className="ib" style={{ width: 32, height: 32 }} aria-label={t('desktop.zone.menu')} onClick={(e) => menu(r, i, e.currentTarget)}>
                <Icon name="dots" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {editing && <RuleEditor initial={editing} state={state} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}

/** Onglet « Journal » : ce que les règles ont rangé, avec annulation. */
export function LogTab({ state }: { state: DesktopState }): ReactNode {
  const { t, lang } = useI18n();
  const [data] = useRules();
  if (!data) return null;
  const when = (ms: number): string =>
    new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const where = (l: RuleLogEntry): string => {
    if (l.action === 'zone') return state.zones.find((z) => z.id === l.zoneId)?.title ?? '—';
    return l.to?.split(/[\\/]/).slice(-2, -1)[0] ?? '—';
  };
  return (
    <div>
      <div className="br-top">
        <p className="muted petit" style={{ flex: 1, margin: 0 }}>
          {t('desktop.log.intro')}
        </p>
        <button
          className="btn sm"
          disabled={data.log.length === 0}
          onClick={async () => {
            if (await ui.confirmer(t('desktop.log.clearConfirm'), { ok: t('desktop.log.clear'), danger: true })) void window.api.desktop.rules.clearLog();
          }}
        >
          <Icon name="trash" size={16} />
          {t('desktop.log.clear')}
        </button>
      </div>
      {data.log.length === 0 ? (
        <p className="muted petit">{t('desktop.log.empty')}</p>
      ) : (
        <div className="liste-r">
          {data.log.map((l) => (
            <div key={l.id} className={`li${l.undone ? ' br-undone' : ''}`}>
              <span className="li-ic">
                <Icon name={l.action === 'zone' ? 'grid' : 'folderopen'} size={18} />
              </span>
              <span className="tx" style={{ flex: 1, minWidth: 0 }}>
                <b className="br-name">{l.name}</b>
                <span className="br-sub">
                  {t(l.action === 'zone' ? 'desktop.log.toZone' : 'desktop.log.moved', { where: where(l) })} · {l.ruleName} · {when(l.at)}
                </span>
              </span>
              {l.undone ? (
                <span className="badge">{t('desktop.log.undone')}</span>
              ) : (
                <button
                  className="btn xs"
                  onClick={async () => {
                    const ok = await window.api.desktop.rules.undo(l.id);
                    if (!ok) ui.toast(t('desktop.log.undoFailed'), { erreur: true });
                  }}
                >
                  <Icon name="undo" size={14} />
                  {t('desktop.log.undo')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
