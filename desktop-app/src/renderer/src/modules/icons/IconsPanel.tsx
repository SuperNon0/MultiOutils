import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IconLibraryPublic } from '../../../../common/api';
import { applyStyle, applyTheme, defaultDesign, newIconId, type IconDesign } from '../../../../common/icons';
import { ui } from '../../encre/ui';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { designUrl, refsOf, requestArts, useArtVersion } from './art';
import { IconEditor, ThemeGroups, exportDesigns } from './IconEditor';
import './icons.css';

type View = 'all' | 'fav' | string;

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function IconsPanel(): ReactNode {
  const { t } = useI18n();
  useArtVersion();
  const [state, setState] = useState<IconLibraryPublic | null>(null);
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<IconDesign | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deck, setDeck] = useState(false);
  const [batchTheme, setBatchTheme] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<IconDesign | null>(null);

  useEffect(() => {
    void window.api.icons.state().then(setState);
    return window.api.icons.onChanged(setState);
  }, []);

  useEffect(() => {
    if (state) requestArts(state.designs.flatMap(refsOf));
  }, [state]);

  // l'icône ouverte suit la bibliothèque, sauf pendant qu'on la modifie
  useEffect(() => {
    if (!state || !openId) return setDraft(null);
    if (pending.current?.id === openId) return;
    setDraft(state.designs.find((d) => d.id === openId) ?? null);
  }, [state, openId]);

  const flush = (): void => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const d = pending.current;
    pending.current = null;
    if (d) void window.api.icons.saveDesigns([d]);
  };
  useEffect(() => flush, []);

  const edit = (d: IconDesign): void => {
    setDraft(d);
    requestArts(refsOf(d));
    pending.current = d;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 350);
  };

  const open = (id: string | null): void => {
    flush();
    setOpenId(id);
  };

  const list = useMemo(() => {
    if (!state) return [];
    let l = state.designs;
    if (view === 'fav') l = l.filter((d) => d.favorite);
    else if (view === 'none') l = l.filter((d) => !d.folder);
    else if (view !== 'all') l = l.filter((d) => d.folder === view);
    const needle = norm(q.trim());
    if (needle) l = l.filter((d) => norm(`${d.name} ${d.symbol?.name ?? ''}`).includes(needle));
    return [...l].sort((a, b) => a.createdAt - b.createdAt);
  }, [state, view, q]);

  if (!state) return <div className="panel" />;

  const shown = (d: IconDesign): IconDesign => (draft && d.id === draft.id ? draft : d);
  const folderOf = (id: string | null): string | null => (view !== 'all' && view !== 'fav' && view !== 'none' ? view : id);

  const create = async (): Promise<void> => {
    const d = defaultDesign({ id: newIconId(), folder: folderOf(null), name: t('icons.newIcon') });
    await window.api.icons.saveDesigns([d]);
    open(d.id);
  };

  const duplicate = async (d: IconDesign): Promise<void> => {
    const copy = { ...d, id: newIconId(), name: `${d.name} (copie)`, createdAt: Date.now() };
    await window.api.icons.saveDesigns([copy]);
    open(copy.id);
  };

  const remove = async (ids: string[]): Promise<void> => {
    flush();
    const removed = await window.api.icons.removeDesigns(ids);
    if (ids.includes(openId ?? '')) setOpenId(null);
    setSelected(new Set());
    ui.toast(t('icons.deleted', { n: String(removed.length) }), { annuler: () => void window.api.icons.saveDesigns(removed) });
  };

  const newFolder = async (): Promise<void> => {
    const name = await ui.demander(t('icons.newFolder'), { label: t('icons.name') });
    if (!name) return;
    const f = await window.api.icons.saveFolder({ id: newIconId(), name, color: '#a99bff' });
    if (f) setView(f.id);
  };

  const folderMenu = (e: React.MouseEvent, id: string): void => {
    e.preventDefault();
    const f = state.folders.find((x) => x.id === id);
    if (!f) return;
    ui.menu({ x: e.clientX, y: e.clientY }, [
      {
        texte: t('icons.rename'),
        icone: 'edit',
        action: async () => {
          const name = await ui.demander(t('icons.rename'), { valeur: f.name });
          if (name) await window.api.icons.saveFolder({ ...f, name });
        }
      },
      {
        texte: t('icons.deleteFolder'),
        icone: 'trash',
        danger: true,
        action: async () => {
          if (await ui.confirmer(t('icons.deleteFolderConfirm', { name: f.name }), { danger: true, ok: t('icons.delete') })) {
            await window.api.icons.removeFolder(id);
            setView('all');
          }
        }
      }
    ]);
  };

  const sel = [...selected].map((id) => state.designs.find((d) => d.id === id)).filter((d): d is IconDesign => !!d);
  const toggleSel = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const saveAll = (l: IconDesign[]): void => void window.api.icons.saveDesigns(l);

  const batchMenu = (e: React.MouseEvent<HTMLButtonElement>, kind: 'style' | 'folder'): void => {
    if (kind === 'style') {
      ui.menu(
        e.currentTarget,
        state.styles.length
          ? state.styles.map((s) => ({ texte: s.name, action: () => saveAll(sel.map((d) => applyStyle(d, s.look))) }))
          : [{ texte: t('icons.noStyles'), action: () => undefined }]
      );
    } else {
      ui.menu(e.currentTarget, [
        { texte: t('icons.noFolder'), action: () => saveAll(sel.map((d) => ({ ...d, folder: null }))) },
        ...state.folders.map((f) => ({ texte: f.name, icone: 'folder', action: () => saveAll(sel.map((d) => ({ ...d, folder: f.id }))) }))
      ]);
    }
  };

  const count = (pred: (d: IconDesign) => boolean): number => state.designs.filter(pred).length;
  const deckKeys = list.slice(0, 15);

  return (
    <div className="panel ic-panel">
      <div className="page-h">
        <h1 className="page-t">{t('icons.title')}</h1>
        <div className="ligne ic-bar">
          <label className="champ ic-q">
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('icons.search')} />
          </label>
          <button type="button" className={`btn sm${deck ? ' pri' : ''}`} onClick={() => setDeck(!deck)} title={t('icons.deckPreview')}>
            <Icon name="grid" size={15} /> {t('icons.deck')}
          </button>
          <button type="button" className="btn sm pri" onClick={() => void create()}>
            <Icon name="plus" size={15} /> {t('icons.newIcon')}
          </button>
        </div>
      </div>

      <div className={`ic-layout${draft ? ' with-ed' : ''}`}>
        <nav className="ic-folders">
          <button type="button" className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>
            <Icon name="grid" size={15} /> <span>{t('icons.all')}</span> <span className="n">{state.designs.length}</span>
          </button>
          <button type="button" className={view === 'fav' ? 'on' : ''} onClick={() => setView('fav')}>
            <Icon name="star" size={15} /> <span>{t('icons.favorites')}</span> <span className="n">{count((d) => d.favorite)}</span>
          </button>
          <button type="button" className={view === 'none' ? 'on' : ''} onClick={() => setView('none')}>
            <Icon name="file" size={15} /> <span>{t('icons.unfiled')}</span> <span className="n">{count((d) => !d.folder)}</span>
          </button>
          <span className="lbl-mono ic-folders-t">{t('icons.folders')}</span>
          {state.folders.map((f) => (
            <button key={f.id} type="button" className={view === f.id ? 'on' : ''} onClick={() => setView(f.id)} onContextMenu={(e) => folderMenu(e, f.id)}>
              <Icon name="folder" size={15} /> <span>{f.name}</span> <span className="n">{count((d) => d.folder === f.id)}</span>
            </button>
          ))}
          <button type="button" className="ic-add" onClick={() => void newFolder()}>
            <Icon name="plus" size={15} /> <span>{t('icons.newFolder')}</span>
          </button>
        </nav>

        <div className="ic-main">
          {selected.size > 0 && (
            <div className="ic-batch carte">
              <b>{t('icons.selected', { n: String(selected.size) })}</b>
              <button type="button" className="btn xs" onClick={() => setBatchTheme(true)}><Icon name="palette" size={14} /> {t('icons.applyTheme')}</button>
              <button type="button" className="btn xs" onClick={(e) => batchMenu(e, 'style')}>{t('icons.applyStyle')}</button>
              <button type="button" className="btn xs" onClick={(e) => batchMenu(e, 'folder')}><Icon name="folder" size={14} /> {t('icons.move')}</button>
              <button type="button" className="btn xs" onClick={(e) => ui.menu(e.currentTarget, [
                { texte: 'PNG', action: () => void exportDesigns(sel, 'png', ui.toast) },
                { texte: 'PNG @2x', action: () => void exportDesigns(sel, 'png2x', ui.toast) },
                { texte: 'SVG', action: () => void exportDesigns(sel, 'svg', ui.toast) }
              ])}><Icon name="download" size={14} /> {t('icons.export')}</button>
              <button type="button" className="btn xs dn" onClick={() => void remove([...selected])}><Icon name="trash" size={14} /></button>
              <button type="button" className="btn xs gh" onClick={() => setSelected(new Set())}>{t('icons.cancel')}</button>
            </div>
          )}

          {deck && (
            <div className="ic-deck" aria-label={t('icons.deckPreview')}>
              {Array.from({ length: 15 }, (_, i) => {
                const d = deckKeys[i];
                return (
                  <button key={i} type="button" className="ic-deck-key" disabled={!d} onClick={() => d && open(d.id)}>
                    {d && <img src={designUrl(shown(d), 144)} alt={d.name} />}
                  </button>
                );
              })}
            </div>
          )}

          {!list.length ? (
            <div className="vide ic-vide">
              <p>{state.designs.length ? t('icons.emptyFilter') : t('icons.empty')}</p>
              {!state.designs.length && (
                <button type="button" className="btn sm pri" onClick={() => void create()}>
                  <Icon name="plus" size={15} /> {t('icons.newIcon')}
                </button>
              )}
            </div>
          ) : (
            <div className="ic-grid">
              {list.map((raw) => {
                const d = shown(raw);
                const isSel = selected.has(d.id);
                return (
                  <div key={d.id} className={`ic-tile${openId === d.id ? ' open' : ''}${isSel ? ' sel' : ''}`}>
                    <button
                      type="button"
                      className="ic-tile-b"
                      onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey || selected.size ? toggleSel(d.id) : open(openId === d.id ? null : d.id))}
                      title={d.name}
                    >
                      <img src={designUrl(d, 144)} alt="" draggable={false} />
                      <span>{d.name}</span>
                    </button>
                    <label className="ic-tile-ck" title={t('icons.select')}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSel(d.id)} />
                    </label>
                    {d.favorite && <Icon name="starFilled" size={13} className="ic-tile-fav" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {draft && (
          <aside className="ic-side">
            <button type="button" className="btn xs gh ic-close" onClick={() => open(null)} title={t('icons.close')}>
              <Icon name="x" size={15} />
            </button>
            <IconEditor
              key={draft.id}
              design={draft}
              state={state}
              onChange={edit}
              onDuplicate={() => void duplicate(draft)}
              onRemove={() => void remove([draft.id])}
            />
          </aside>
        )}
      </div>

      {batchTheme && (
        <Feuille titre={t('icons.applyThemeTo', { n: String(sel.length) })} onClose={() => setBatchTheme(false)}>
          <ThemeGroups
            state={state}
            onPick={(th) => {
              saveAll(sel.map((d) => applyTheme(d, th)));
              setBatchTheme(false);
            }}
          />
        </Feuille>
      )}
    </div>
  );
}
