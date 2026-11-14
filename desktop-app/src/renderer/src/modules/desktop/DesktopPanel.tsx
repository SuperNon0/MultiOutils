import { useEffect, useState, type ReactNode } from 'react';
import {
  defaultZoneStyle,
  effectiveStyle,
  onActivePage,
  type DesktopState,
  type PageAutoRule,
  type Zone,
  type HaEntity,
  type ZoneIconSize,
  type ZonePreset,
  type ZoneSort,
  type ZoneStyle,
  type ZoneView
} from '../../../../common/desktop';
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSwitch } from '../../host/reglages';
import { useI18n } from '../../i18n';
import { LayoutsTab, PagesBar } from './LayoutsPanel';
import { LogTab, RulesTab } from './RulesPanel';
import { AiPlanSheet } from './AiPlanSheet';
import { StyleEditor } from './StyleEditor';
import { WIDGET_ICONS } from './ZoneWidgets';
import './desktop.css';

/** État partagé du module (page et réglages). */
export function useDesktopState(): [DesktopState | null, (s: DesktopState) => void] {
  const [state, setState] = useState<DesktopState | null>(null);
  useEffect(() => {
    void window.api.desktop.getState().then(setState);
    return window.api.desktop.onState(setState);
  }, []);
  return [state, setState];
}

function kindIcon(z: Zone): string {
  if (z.widget) return WIDGET_ICONS[z.widget];
  if (z.kind === 'folder') return 'folderopen';
  if (z.inbox) return 'sparkle';
  return 'grid';
}

/** Mini-carte : les écrans et la place de chaque zone. */
function MiniMap({ state, selected, onSelect }: { state: DesktopState; selected: string | null; onSelect(id: string): void }): ReactNode {
  const maxW = Math.max(...state.displays.map((d) => d.workArea.width), 1);
  const scale = 170 / maxW;
  return (
    <div className="bz-mini" aria-hidden="true">
      {state.displays.map((d) => (
        <div
          key={d.id}
          className="bz-scr"
          style={{
            width: d.workArea.width * scale,
            height: d.workArea.height * scale
          }}
        >
          {state.zones
            .filter((z) => z.bounds.displayId === d.id || (!state.displays.some((o) => o.id === z.bounds.displayId) && d.primary))
            .map((z) => (
              <button
                key={z.id}
                tabIndex={-1}
                className={`${z.id === selected ? 'on' : ''}${z.enabled ? '' : ' off'}`}
                style={{
                  left: z.bounds.x * scale,
                  top: z.bounds.y * scale,
                  width: Math.max(4, z.bounds.width * scale),
                  height: Math.max(3, z.bounds.height * scale),
                  borderColor: z.id === selected ? undefined : (z.color ?? undefined)
                }}
                onClick={() => onSelect(z.id)}
              />
            ))}
          <span>
            {d.label}
            {d.primary ? ' ★' : ''} · {Math.round(d.workArea.width)}×{Math.round(d.workArea.height)}
          </span>
        </div>
      ))}
    </div>
  );
}

const saveStyleAs = async (t: (k: string) => string, style: Partial<ZoneStyle>): Promise<void> => {
  const name = await ui.demander(t('desktop.style.save'), {
    placeholder: t('desktop.style.namePh')
  });
  if (name && name.trim()) {
    await window.api.desktop.saveStyle(name.trim(), style);
    ui.toast(t('desktop.style.saved'));
  }
};

/** Réglages propres aux zones spéciales. */
function WidgetDetail({ zone }: { zone: Zone }): ReactNode {
  const { t } = useI18n();
  const [ents, setEnts] = useState<HaEntity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (zone.widget !== 'ha' && zone.widget !== 'ha-sensor' && zone.widget !== 'ha-chart') return;
    void window.api.ha.entities().then((r) => (r.ok ? setEnts(r.list) : setErr(r.error)));
  }, [zone.widget]);
  if (zone.widget === 'ha' || zone.widget === 'ha-sensor' || zone.widget === 'ha-chart') {
    if (err) return <p className="muted petit">{t(err === 'not-configured' ? 'desktop.ha.notConfigured' : 'desktop.ha.error', { error: err })}</p>;
    if (!ents) return <p className="muted petit">…</p>;
    const low = q.trim().toLowerCase();
    const list = ents.filter((e) => ((zone.widget === 'ha-sensor' || zone.widget === 'ha-chart') ? ['sensor', 'binary_sensor'].includes(e.domain) : !['sensor', 'binary_sensor'].includes(e.domain)) && (!low || e.name.toLowerCase().includes(low) || e.id.includes(low)));
    const toggle = (id: string): void =>
      void window.api.desktop.updateZone(zone.id, {
        entities: zone.entities.includes(id) ? zone.entities.filter((x) => x !== id) : zone.widget === 'ha-chart' ? [id] : [...zone.entities, id]
      });
    return (
      <div className="bz-ha">
        <p className="muted petit" style={{ margin: 0 }}>
          {t('desktop.ha.pickHelp', { n: zone.entities.length })}
        </p>
        <label className="champ" style={{ height: 36 }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('desktop.ha.filter')} aria-label={t('desktop.ha.filter')} />
        </label>
        <div className="bz-ha-l">
          {list.slice(0, 120).map((e) => (
            <label key={e.id} className="bz-ha-r">
              <input type="checkbox" checked={zone.entities.includes(e.id)} onChange={() => toggle(e.id)} />
              <span className="tx">
                <b>{e.name}</b>
                <small>{e.id}</small>
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  return <p className="muted petit">{t(`desktop.preset.${zone.widget}.help`)}</p>;
}

function ZoneDetail({ zone, state }: { zone: Zone; state: DesktopState }): ReactNode {
  const { t } = useI18n();
  const [showStyle, setShowStyle] = useState(false);
  const [colorDraft, setColorDraft] = useState(zone.color ?? '');
  useEffect(() => setColorDraft(zone.color ?? ''), [zone.id, zone.color]);
  const up = (patch: Partial<Zone>): void => void window.api.desktop.updateZone(zone.id, patch);
  const commitColor = (): void => {
    const next = colorDraft.trim();
    if (next === '') up({ color: null });
    else if (/^#[0-9a-f]{6}$/i.test(next)) up({ color: next });
    else setColorDraft(zone.color ?? '');
  };
  const sorts: ZoneSort[] = zone.kind === 'folder' ? ['name', 'type', 'size', 'date', 'opens'] : ['manual', 'name', 'type', 'size', 'date', 'opens'];
  return (
    <div className="carte bz-det">
      <div className="lbl-mono">{zone.title}</div>
      {zone.kind === 'widget' ? (
        <>
          <WidgetDetail zone={zone} />
          {zone.widget === 'ha-chart' && (
            <RegLigne titre="Période du graphique">
              <select className="select sm" value={zone.chartHours} onChange={(e) => up({ chartHours: Number(e.target.value) as Zone['chartHours'] })}>
                <option value={24}>24 heures</option><option value={168}>7 jours</option>
              </select>
            </RegLigne>
          )}
          <RegLigne titre="Couleur d'accent du widget">
            <div className="bs-color">
              <input type="color" aria-label="Choisir une couleur libre" value={zone.color && /^#[0-9a-f]{6}$/i.test(zone.color) ? zone.color : '#a99bff'} onChange={(e) => up({ color: e.target.value })} />
              <input className="champ" style={{ width: 106 }} aria-label="Code hexadécimal" placeholder="#A99BFF" maxLength={7} value={colorDraft} onChange={(e) => setColorDraft(e.target.value)} onBlur={commitColor} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              <button className="btn xs" type="button" onClick={() => up({ color: null })}>Thème Encre</button>
            </div>
          </RegLigne>
          <RegLigne titre="Affichage du widget">
            <select className="select sm" value={zone.widgetLayout} onChange={(e) => up({ widgetLayout: e.target.value as Zone['widgetLayout'] })}>
              <option value="cards">Cartes</option>
              <option value="compact">Compact</option>
            </select>
          </RegLigne>
          <p className="muted petit">Le widget suit le thème Encre. Personnalise son fond, ses couleurs, sa transparence, ses angles et son titre dans Apparence ci-dessous.</p>
        </>
      ) : (
        <>
          <RegLigne titre={t('desktop.menu.view')}>
            <div className="seg">
              {(['icons', 'list', 'details'] as ZoneView[]).map((v) => (
                <button key={v} className={zone.view === v ? 'on' : ''} onClick={() => up({ view: v })}>
                  {t(`desktop.menu.view.${v}`)}
                </button>
              ))}
            </div>
          </RegLigne>
          <RegLigne titre={t('desktop.menu.sort')} htmlFor="bz-sort">
            <select id="bz-sort" className="select sm" style={{ width: 150 }} value={zone.sort} onChange={(e) => up({ sort: e.target.value as ZoneSort })}>
              {sorts.map((s) => (
                <option key={s} value={s}>
                  {t(`desktop.menu.sort.${s}`)}
                </option>
              ))}
            </select>
          </RegLigne>
          <RegLigne titre={t('desktop.menu.iconSize')}>
            <div className="seg">
              {(['small', 'medium', 'large'] as ZoneIconSize[]).map((v) => (
                <button key={v} className={zone.iconSize === v ? 'on' : ''} onClick={() => up({ iconSize: v })}>
                  {t(`desktop.menu.iconSize.${v}`)}
                </button>
              ))}
            </div>
          </RegLigne>
          <RegLigne titre={t('desktop.detail.maxItems')} htmlFor="bz-max">
            <select id="bz-max" className="select sm" style={{ width: 150 }} value={zone.maxItems} onChange={(e) => up({ maxItems: Number(e.target.value) })}>
              {[0, 6, 12, 24, 48].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('desktop.detail.maxAll') : String(n)}
                </option>
              ))}
            </select>
          </RegLigne>
        </>
      )}
      <RegSwitch titre={t('desktop.menu.lock')} sous={t('desktop.detail.lockSub')} checked={zone.locked} onChange={(v) => up({ locked: v })} />
      {!zone.tabOf && (
        <>
          <RegSwitch titre={t('desktop.menu.roll')} sous={t('desktop.detail.rollSub')} checked={zone.rolled} onChange={(v) => up({ rolled: v })} />
          <RegSwitch
            titre={t('desktop.menu.keepOnHide')}
            sous={t('desktop.detail.keepOnHideSub')}
            checked={zone.keepOnHide}
            onChange={(v) => up({ keepOnHide: v })}
          />
          {state.settings.pages.length > 1 && (
            <>
              <RegLigne titre={t('desktop.page.of')} htmlFor="bz-page">
                <select
                  id="bz-page"
                  className="select sm"
                  style={{ width: 150 }}
                  disabled={zone.allPages}
                  value={zone.pageId || state.settings.pages[0].id}
                  onChange={(e) => up({ pageId: e.target.value })}
                >
                  {state.settings.pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </RegLigne>
              <RegSwitch titre={t('desktop.page.all')} sous={t('desktop.page.allSub')} checked={zone.allPages} onChange={(v) => up({ allPages: v })} />
            </>
          )}
          <button className="btn sm gh bs-toggle" aria-expanded={showStyle} onClick={() => setShowStyle(!showStyle)}>
            <Icon name="palette" size={16} />
            {t('desktop.style.title')}
            <Icon name={showStyle ? 'chevu' : 'chevd'} size={14} />
          </button>
          {showStyle && (
            <StyleEditor
              idPrefix={`bz-${zone.id.slice(0, 6)}`}
              full={effectiveStyle(zone, state.settings)}
              saved={state.settings.savedStyles}
              onChange={(patch) => up({ style: { ...zone.style, ...patch } })}
              onPick={(field) => void window.api.desktop.pickColor(zone.id, field)}
              onReset={() => up({ style: {} })}
              onSaveStyle={() => void saveStyleAs(t, zone.style)}
            />
          )}
        </>
      )}
      {zone.kind === 'folder' ? (
        <>
          <RegSwitch titre={t('desktop.menu.navigate')} sous={zone.folder ?? ''} checked={zone.navigate} onChange={(v) => up({ navigate: v })} />
          <RegLigne titre={t('desktop.detail.shelf')} sous={t('desktop.detail.shelfSub')} htmlFor="bz-shelf">
            <select
              id="bz-shelf"
              className="select sm"
              style={{ width: 150 }}
              value={zone.shelfDays}
              onChange={(e) => up({ shelfDays: Number(e.target.value) })}
            >
              {[0, 1, 3, 7, 14, 30].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('desktop.detail.shelfNever') : t('desktop.detail.shelfDays', { n })}
                </option>
              ))}
            </select>
          </RegLigne>
        </>
      ) : zone.kind === 'widget' ? null : (
        <RegSwitch titre={t('desktop.menu.inbox')} sous={t('desktop.detail.inboxSub')} checked={zone.inbox} onChange={(v) => up({ inbox: v })} />
      )}
    </div>
  );
}

const PRESETS: Array<[ZonePreset, string]> = [
  ['captures', 'camera'],
  ['shelf', 'hourglass'],
  ['notes', 'edit'],
  ['clips', 'clipboard'],
  ['ha', 'home'],
  ['ha-sensor', 'signal'],
  ['ha-chart', 'signal'],
  ['search', 'search'],
  ['cloud', 'cloud']
];

/** Page « Bureau » de la fenêtre principale. */
export function DesktopPanel(): ReactNode {
  const { t } = useI18n();
  const [state] = useDesktopState();
  const [selected, setSelected] = useState<string | null>(null);
  const [section, setSection] = useState<'zones' | 'rules' | 'log' | 'layouts'>('zones');
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(
    () =>
      window.api.desktop.onZoneDeleted((zone) => {
        ui.toast(t('desktop.deleted', { name: zone.title }), {
          annuler: () => window.api.desktop.restoreZone(zone)
        });
      }),
    [t]
  );

  if (!state) return null;
  const zone = state.zones.find((z) => z.id === selected) ?? null;
  // Zones de la page affichée (un onglet suit la page de sa zone hôte).
  const pageZones = state.zones.filter((z) => onActivePage(state.zones.find((h) => h.id === z.tabOf) ?? z, state.settings));

  const zoneMenu = (z: Zone, anchor: HTMLElement): void => {
    ui.menu(
      anchor,
      [
        {
          icone: 'edit',
          texte: t('desktop.menu.rename'),
          action: async () => {
            const name = await ui.demander(t('desktop.menu.rename'), {
              valeur: z.title
            });
            if (name && name.trim()) void window.api.desktop.updateZone(z.id, { title: name.trim() });
          }
        },
        {
          icone: z.locked ? 'lock' : 'lock',
          texte: t(z.locked ? 'desktop.unlock' : 'desktop.menu.lock'),
          action: () => void window.api.desktop.updateZone(z.id, { locked: !z.locked })
        },
        null,
        {
          icone: 'trash',
          texte: t('desktop.menu.delete'),
          danger: true,
          action: () => void window.api.desktop.deleteZone(z.id)
        }
      ],
      { titre: z.title }
    );
  };

  const sub = (z: Zone): string => {
    const host = z.tabOf ? state.zones.find((o) => o.id === z.tabOf) : undefined;
    if (host) return t('desktop.sub.tabOf', { name: host.title });
    if (z.widget) return t(`desktop.preset.${z.widget}.sub`);
    if (z.kind === 'folder' && z.shelfDays > 0) return t('desktop.sub.shelf', { n: z.shelfDays });
    if (z.kind === 'folder') return t('desktop.sub.folder', { path: z.folder ?? '—' });
    if (z.inbox) return t('desktop.sub.inbox');
    return t('desktop.sub.shortcuts', { n: z.items.length });
  };
  const screenOf = (z: Zone): string => state.displays.find((d) => d.id === z.bounds.displayId)?.label ?? '1';

  return (
    <div>
      <div className="page-h">
        <h1 className="page-t">{t('desktop.title')}</h1>
        <button className="btn sm" title={t('desktop.peek.button')} onClick={() => void window.api.desktop.peek()}>
          <Icon name="eye" size={16} />
          {t('desktop.peek.button')}
        </button>
        <button className="btn sm" onClick={() => void window.api.desktop.createZone('folder')}>
          <Icon name="folderopen" size={16} />
          {t('desktop.newFolderZone')}
        </button>
        <button
          className="btn sm"
          onClick={(e) =>
            ui.menu(
              e.currentTarget,
              PRESETS.map(([p, icon]) => ({
                icone: icon,
                texte: t(`desktop.preset.${p}`),
                action: () => void window.api.desktop.createZone(p)
              })),
              { titre: t('desktop.preset.menu') }
            )
          }
        >
          <Icon name="sparkle" size={16} />
          {t('desktop.preset.button')}
        </button>
        <button className="btn sm" title={t('desktop.ai.title')} onClick={() => setAiOpen(true)}>
          <Icon name="chat" size={16} />
          {t('desktop.ai.button')}
        </button>
        <button className="btn sm pri" onClick={() => void window.api.desktop.draw()}>
          <Icon name="plus" size={16} />
          {t('desktop.drawZone')}
        </button>
      </div>
      <p className="intro-p muted" style={{ marginBottom: 14 }}>
        {t('desktop.intro')}
      </p>

      {!state.native && (
        <div className="bz-bandeau" role="status">
          <Icon name="alert" size={18} />
          {t(state.nativeError === 'platform' ? 'desktop.native.platform' : 'desktop.native.off')}
        </div>
      )}
      {!state.settings.enabled && (
        <div className="bz-bandeau" role="status">
          <Icon name="info" size={18} />
          <span style={{ flex: 1 }}>{t('desktop.disabled')}</span>
          <button className="btn xs" onClick={() => void window.api.desktop.setSettings({ enabled: true })}>
            {t('desktop.enable')}
          </button>
        </div>
      )}

      <div className="chips" role="tablist" style={{ marginBottom: 14 }}>
        {(['zones', 'rules', 'log', 'layouts'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={section === k} className={`chip${section === k ? ' on' : ''}`} onClick={() => setSection(k)}>
            {t(`desktop.section.${k}`)}
          </button>
        ))}
      </div>

      {aiOpen && <AiPlanSheet onClose={() => setAiOpen(false)} />}
      {section === 'zones' && <PagesBar state={state} />}

      {section === 'rules' ? (
        <RulesTab state={state} />
      ) : section === 'layouts' ? (
        <LayoutsTab state={state} />
      ) : section === 'log' ? (
        <LogTab state={state} />
      ) : pageZones.length === 0 ? (
        <div className="carte bz-vide">
          <h2 className="sec-t">{t('desktop.empty.title')}</h2>
          <p>{t('desktop.empty.text')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn pri" onClick={() => void window.api.desktop.starter()}>
              <Icon name="sparkle" size={16} />
              {t('desktop.empty.starter')}
            </button>
            <button className="btn" onClick={() => void window.api.desktop.draw()}>
              <Icon name="plus" size={16} />
              {t('desktop.drawZone')}
            </button>
          </div>
        </div>
      ) : (
        <div className="bz-grid">
          <div className="liste-r">
            {pageZones.map((z) => (
              <div
                key={z.id}
                className={`li${z.id === selected ? ' on' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(z.id === selected ? null : z.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSelected(z.id === selected ? null : z.id);
                }}
              >
                <span className="li-ic" style={{ color: z.color ?? 'var(--accent)' }}>
                  <Icon name={kindIcon(z)} size={18} />
                </span>
                <span className="tx" style={{ flex: 1, minWidth: 0 }}>
                  <b>{z.title}</b>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: 'var(--muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {sub(z)} · {t('desktop.sub.screen', { n: screenOf(z) })}
                  </span>
                </span>
                <span className="badge">
                  {t(
                    z.widget
                      ? 'desktop.badge.widget'
                      : z.kind === 'folder'
                        ? 'desktop.badge.folder'
                        : z.inbox
                          ? 'desktop.badge.inbox'
                          : 'desktop.badge.shortcuts'
                  )}
                </span>
                <input
                  type="checkbox"
                  className="sw"
                  aria-label={t('desktop.zoneVisible')}
                  checked={z.enabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    void window.api.desktop.updateZone(z.id, {
                      enabled: e.target.checked
                    })
                  }
                />
                <button
                  className="ib"
                  style={{ width: 32, height: 32 }}
                  aria-label={t('desktop.zone.menu')}
                  onClick={(e) => {
                    e.stopPropagation();
                    zoneMenu(z, e.currentTarget);
                  }}
                >
                  <Icon name="dots" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="bz-side">
            <MiniMap state={state} selected={selected} onSelect={setSelected} />
            {zone ? <ZoneDetail zone={zone} state={state} /> : <p className="muted petit">{t('desktop.pickZone')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const keyLabel = (accel: string): string => accel.replace(/\+/g, ' + ').replace('Control', 'Ctrl');

const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** Pages automatiques : selon l'heure (et les jours) ou le programme au premier plan (g5). */
function PageAutoEditor({ state }: { state: DesktopState }): ReactNode {
  const { t } = useI18n();
  const s = state.settings;
  if (s.pages.length < 2) return <p className="muted petit">{t('desktop.auto.needPages')}</p>;
  const save = (pageAuto: PageAutoRule[]): void => void window.api.desktop.setSettings({ pageAuto });
  const up = (id: string, patch: Partial<PageAutoRule>): void => save(s.pageAuto.map((r) => (r.id === id ? ({ ...r, ...patch } as PageAutoRule) : r)));
  const add = (type: 'time' | 'app'): void => {
    const id = Math.random().toString(36).slice(2, 10);
    const pageId = s.pages[1]?.id ?? s.pages[0].id;
    save([
      ...s.pageAuto,
      type === 'time'
        ? {
            id,
            pageId,
            type,
            from: '09:00',
            to: '18:00',
            days: [1, 2, 3, 4, 5]
          }
        : { id, pageId, type, exe: '' }
    ]);
  };
  return (
    <div className="bz-auto">
      <div className="reg-l" style={{ borderBottom: 0 }}>
        <span className="tx">
          <b>{t('desktop.auto.title')}</b>
          <span>{t('desktop.auto.sub')}</span>
        </span>
      </div>
      {s.pageAuto.map((r) => (
        <div key={r.id} className="bz-auto-r">
          <select className="select sm" value={r.pageId} aria-label={t('desktop.page.label')} onChange={(e) => up(r.id, { pageId: e.target.value })}>
            {s.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {r.type === 'time' ? (
            <>
              <input className="bz-time" type="time" aria-label={t('desktop.auto.from')} value={r.from} onChange={(e) => up(r.id, { from: e.target.value })} />
              <span className="muted">→</span>
              <input className="bz-time" type="time" aria-label={t('desktop.auto.to')} value={r.to} onChange={(e) => up(r.id, { to: e.target.value })} />
              <span className="bz-days">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    className={`chip${r.days.includes(d) ? ' on' : ''}`}
                    aria-pressed={r.days.includes(d)}
                    onClick={() =>
                      up(r.id, {
                        days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d]
                      })
                    }
                  >
                    {t(`desktop.auto.day.${d}`)}
                  </button>
                ))}
              </span>
            </>
          ) : (
            <label className="champ" style={{ flex: 1, minWidth: 140, height: 34 }}>
              <input value={r.exe} placeholder="code.exe" aria-label={t('desktop.auto.app')} onChange={(e) => up(r.id, { exe: e.target.value })} />
            </label>
          )}
          <button className="ib" aria-label={t('desktop.rules.removeCond')} onClick={() => save(s.pageAuto.filter((o) => o.id !== r.id))}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm gh" onClick={() => add('time')}>
          <Icon name="clock" size={16} />
          {t('desktop.auto.addTime')}
        </button>
        <button className="btn sm gh" disabled={!state.native} onClick={() => add('app')}>
          <Icon name="plus" size={16} />
          {t('desktop.auto.addApp')}
        </button>
      </div>
    </div>
  );
}

/** Section « Bureau » des Réglages. */
export function DesktopSettingsPanel(): ReactNode {
  const { t, lang } = useI18n();
  const [state] = useDesktopState();
  if (!state) return null;
  const s = state.settings;
  const set = (patch: Partial<typeof s>): void => void window.api.desktop.setSettings(patch);
  return (
    <div>
      <RegSwitch titre={t('desktop.set.enabled')} sous={t('desktop.set.enabledSub')} checked={s.enabled} onChange={(v) => set({ enabled: v })} />
      <RegSwitch
        titre={t('desktop.set.hideNative')}
        sous={t('desktop.set.hideNativeSub')}
        checked={s.hideNativeIcons}
        disabled={!state.native}
        onChange={(v) => set({ hideNativeIcons: v })}
      />
      <RegSwitch titre={t('desktop.set.contextMenu')} sous={t('desktop.set.contextMenuSub')} checked={s.contextMenu} onChange={(v) => set({ contextMenu: v })} />
      <RegSwitch titre={t('desktop.set.snap')} sous={t('desktop.set.snapSub')} checked={s.snap} onChange={(v) => set({ snap: v })} />
      <RegLigne titre={t('desktop.set.gap')} htmlFor="bz-gap">
        <input id="bz-gap" type="range" min={0} max={40} step={2} value={s.gap} disabled={!s.snap} onChange={(e) => set({ gap: Number(e.target.value) })} />
        <span className="mono" style={{ width: 44, textAlign: 'right' }}>
          {s.gap} px
        </span>
      </RegLigne>

      <div className="lbl-mono" style={{ margin: '18px 0 6px' }}>
        {t('desktop.set.secRoll')}
      </div>
      <RegLigne titre={t('desktop.set.rollOpen')} sous={t('desktop.set.rollOpenSub')}>
        <div className="seg">
          {(['hover', 'delay', 'click'] as const).map((v) => (
            <button key={v} className={s.rollOpen === v ? 'on' : ''} onClick={() => set({ rollOpen: v })}>
              {t(`desktop.set.rollOpen.${v}`)}
            </button>
          ))}
        </div>
      </RegLigne>
      {s.rollOpen === 'delay' && (
        <RegLigne titre={t('desktop.set.rollDelay')} htmlFor="bz-rd">
          <input id="bz-rd" type="range" min={100} max={2000} step={100} value={s.rollDelay} onChange={(e) => set({ rollDelay: Number(e.target.value) })} />
          <span className="mono" style={{ width: 60, textAlign: 'right' }}>
            {s.rollDelay} ms
          </span>
        </RegLigne>
      )}
      <RegSwitch
        titre={t('desktop.set.autoRollEdge')}
        sous={t('desktop.set.autoRollEdgeSub')}
        checked={s.autoRollEdge}
        onChange={(v) => set({ autoRollEdge: v })}
      />
      <RegLigne titre={t('desktop.set.tabStyle')}>
        <div className="seg">
          {(['tabs', 'segments', 'menu'] as const).map((v) => (
            <button key={v} className={s.tabStyle === v ? 'on' : ''} onClick={() => set({ tabStyle: v })}>
              {t(`desktop.set.tabStyle.${v}`)}
            </button>
          ))}
        </div>
      </RegLigne>

      <div className="lbl-mono" style={{ margin: '18px 0 6px' }}>
        {t('desktop.set.secHide')}
      </div>
      <RegSwitch
        titre={t('desktop.set.dblClickHide')}
        sous={t(state.native ? 'desktop.set.dblClickHideSub' : 'desktop.native.off')}
        checked={s.dblClickHide}
        disabled={!state.native}
        onChange={(v) => set({ dblClickHide: v })}
      />
      <RegLigne titre={t('desktop.set.autoHide')} sous={t('desktop.set.autoHideSub')} htmlFor="bz-ah">
        <select id="bz-ah" className="select sm" style={{ width: 150 }} value={s.autoHideSec} onChange={(e) => set({ autoHideSec: Number(e.target.value) })}>
          {[0, 30, 60, 120, 300, 600].map((v) => (
            <option key={v} value={v}>
              {v === 0 ? t('desktop.set.never') : v < 60 ? `${v} s` : `${v / 60} min`}
            </option>
          ))}
        </select>
      </RegLigne>
      <RegSwitch titre={t('desktop.set.edgeReveal')} sous={t('desktop.set.edgeRevealSub')} checked={s.edgeReveal} onChange={(v) => set({ edgeReveal: v })} />

      <div className="lbl-mono" style={{ margin: '18px 0 6px' }}>
        {t('desktop.set.secPeek')}
      </div>
      <RegLigne titre={t('desktop.set.peekShortcut')} sous={t('desktop.set.peekShortcutSub')}>
        <span className="kbd">
          {s.peekShortcut
            .replace(/\+/g, ' + ')
            .replace('Control', 'Ctrl')
            .replace('Space', lang === 'fr' ? 'Espace' : 'Space')}
        </span>
      </RegLigne>
      <RegLigne titre={t('desktop.set.peekMode')}>
        <div className="seg">
          {(['hold', 'toggle'] as const).map((v) => (
            <button key={v} className={s.peekMode === v ? 'on' : ''} onClick={() => set({ peekMode: v })}>
              {t(`desktop.set.peekMode.${v}`)}
            </button>
          ))}
        </div>
      </RegLigne>
      <RegLigne titre={t('desktop.set.hotCorner')} sous={t('desktop.set.hotCornerSub')} htmlFor="bz-hc">
        <select
          id="bz-hc"
          className="select sm"
          style={{ width: 150 }}
          value={s.hotCorner}
          onChange={(e) => set({ hotCorner: e.target.value as typeof s.hotCorner })}
        >
          {(['off', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`desktop.set.hotCorner.${v}`)}
            </option>
          ))}
        </select>
      </RegLigne>

      <div className="lbl-mono" style={{ margin: '18px 0 6px' }}>
        {t('desktop.set.secPages')}
      </div>
      <RegSwitch
        titre={t('desktop.set.pageWheel')}
        sous={t('desktop.set.pageWheelSub')}
        checked={s.pageWheel}
        disabled={!state.native}
        onChange={(v) => set({ pageWheel: v })}
      />
      <RegSwitch
        titre={t('desktop.set.pageIndicator')}
        sous={t('desktop.set.pageIndicatorSub')}
        checked={s.pageIndicator}
        onChange={(v) => set({ pageIndicator: v })}
      />
      <RegLigne titre={t('desktop.set.pageKeys')} sous={t('desktop.set.peekShortcutSub')}>
        <span className="kbd">{keyLabel(s.pagePrevShortcut)}</span>
        <span className="kbd">{keyLabel(s.pageNextShortcut)}</span>
      </RegLigne>
      <PageAutoEditor state={state} />

      <div className="lbl-mono" style={{ margin: '18px 0 6px' }}>
        {t('desktop.set.secStyle')}
      </div>
      <p className="muted petit" style={{ margin: '0 0 6px' }}>
        {t('desktop.set.styleSub')}
      </p>
      <StyleEditor
        idPrefix="bz-def"
        full={effectiveStyle({ style: {} }, s)}
        saved={s.savedStyles}
        onChange={(patch) => set({ defaultStyle: { ...s.defaultStyle, ...patch } })}
        onPick={(field) => void window.api.desktop.pickColor(null, field)}
        onReset={() => set({ defaultStyle: defaultZoneStyle(), opacity: 90 })}
        onSaveStyle={() => void saveStyleAs(t, s.defaultStyle)}
      />
      {s.savedStyles.length > 0 && (
        <RegLigne titre={t('desktop.style.savedList')}>
          <div className="chips">
            {s.savedStyles.map((st) => (
              <button
                key={st.id}
                className="chip"
                title={t('desktop.style.deleteSaved')}
                onClick={async () => {
                  if (await ui.confirmer(t('desktop.style.deleteConfirm', { name: st.name }), { ok: t('desktop.menu.delete'), danger: true })) {
                    set({
                      savedStyles: s.savedStyles.filter((o) => o.id !== st.id)
                    });
                  }
                }}
              >
                {st.name}
                <Icon name="x" size={12} />
              </button>
            ))}
          </div>
        </RegLigne>
      )}
    </div>
  );
}
