import { useEffect, useState, type ReactNode } from 'react';
import type { SavedNote } from '../../../../common/desktop';
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

/** Local notes library, shared with the desktop widgets. */
export function NotesLibraryPanel(): ReactNode {
  const { t, lang } = useI18n();
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void window.api.desktop.notes.list().then((data) => { if (alive) setNotes(data); });
    };
    refresh();
    const unsub = window.api.desktop.notes.onChanged(refresh);
    return () => { alive = false; unsub(); };
  }, []);

  const pick = (note: SavedNote): void => {
    setSelected(note.id); setTitle(note.title); setBody(note.body); setMessage('');
  };
  const fresh = (): void => {
    setSelected(null); setTitle(''); setBody(''); setMessage('');
  };
  const save = async (): Promise<void> => {
    if (!body.trim() || busy) return;
    setBusy(true); setMessage('');
    try {
      const note = await window.api.desktop.notes.save({ ...(selected ? { id: selected } : {}), title, body });
      pick(note); setMessage(t('desktop.notes.saved'));
    } catch {
      setMessage(t('desktop.notes.saveError'));
    } finally { setBusy(false); }
  };
  const remove = async (): Promise<void> => {
    if (!selected || busy || !await ui.confirmer(t('desktop.notes.deleteConfirm'), { ok: t('desktop.notes.delete') })) return;
    setBusy(true);
    try {
      if (await window.api.desktop.notes.remove(selected)) fresh();
    } catch { setMessage(t('desktop.notes.deleteError')); }
    finally { setBusy(false); }
  };
  const visible = notes.filter((note) => (note.title + ' ' + note.body).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const saved = notes.find((note) => note.id === selected);
  const dirty = saved ? title !== saved.title || body !== saved.body : !!title || !!body;
  return (
    <section className="mo-notes-library">
      <div className="mo-notes-head">
        <div><h2>{t('desktop.notes.title')} <span className="mo-notes-count">{notes.length}</span></h2>
          <p>{t('desktop.notes.intro')}</p></div>
        <button className="btn pri sm" disabled={busy} onClick={fresh}><Icon name="plus" size={16}/>{t('desktop.notes.new')}</button>
      </div>
      <div className="mo-notes-grid">
        <aside className="carte mo-notes-list" aria-label={t('desktop.notes.library')}>
          <div className="mo-notes-list-head"><span className="lbl-mono">{t('desktop.notes.library')}</span>
            <label className="champ"><Icon name="search" size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('desktop.notes.search')} aria-label={t('desktop.notes.search')}/></label>
          </div>
          <div className="mo-notes-items">
            {visible.length === 0 && <div className="mo-notes-empty">
              <span className="mo-notes-empty-icon"><Icon name={query ? 'search' : 'edit'} size={25}/></span>
              <strong>{t(query ? 'desktop.notes.noResults' : 'desktop.notes.empty')}</strong>
              <p>{t(query ? 'desktop.notes.trySearch' : 'desktop.notes.emptyHelp')}</p>
              {query && <button className="btn sm gh" onClick={() => setQuery('')}>{t('desktop.notes.clearSearch')}</button>}
            </div>}
            {visible.map((note) => <button key={note.id} type="button" disabled={busy}
              className={`mo-note-item ${selected === note.id ? 'on' : ''}`} onClick={() => pick(note)}>
              <strong>{note.title}</strong><span>{note.body.slice(0, 140)}</span>
              <small>{new Date(note.updatedAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
            </button>)}
          </div>
        </aside>
        <div className="carte mo-notes-editor">
          <div className="mo-notes-editor-head">
            <span className="mo-notes-editor-icon"><Icon name="edit" size={18}/></span>
            <div><strong>{t(selected ? 'desktop.notes.edit' : 'desktop.notes.draft')}</strong>
              <span>{t('desktop.notes.local')}</span></div>
            {dirty && <span className="badge">{t('desktop.notes.unsaved')}</span>}
          </div>
          <label className="mo-notes-field" htmlFor="mo-note-title">{t('desktop.notes.noteTitle')}</label>
          <input id="mo-note-title" className="input mo-note-title" value={title} maxLength={120} disabled={busy}
            onChange={(e) => setTitle(e.target.value)} placeholder={t('desktop.notes.titlePlaceholder')}/>
          <label className="mo-notes-field" htmlFor="mo-note-body">{t('desktop.notes.content')}</label>
          <textarea id="mo-note-body" className="input mo-note-body" value={body} maxLength={20000} disabled={busy}
            onChange={(e) => setBody(e.target.value)} placeholder={t('desktop.notes.bodyPlaceholder')}/>
          <div className="mo-note-actions">
            <span className="muted petit">{t('desktop.notes.characters', { n: body.length })}</span>
            <div>{selected && <button className="btn sm gh" disabled={busy} onClick={() => void remove()}><Icon name="trash" size={16}/>{t('desktop.notes.delete')}</button>}
              <button className="btn pri sm" disabled={busy || !body.trim()} onClick={() => void save()}><Icon name="save" size={16}/>{t(busy ? 'desktop.notes.saving' : 'desktop.notes.save')}</button></div>
          </div>
          {message && <p role="status" className="mo-notes-message">{message}</p>}
        </div>
      </div>
    </section>
  );
}
