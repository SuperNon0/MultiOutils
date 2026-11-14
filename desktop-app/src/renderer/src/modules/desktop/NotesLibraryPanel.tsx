import { useEffect, useState, type ReactNode } from 'react';
import type { SavedNote } from '../../../../common/desktop';
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';

/** Bibliothèque locale des notes du bureau : simple et synchronisée entre fenêtres. */
export function NotesLibraryPanel(): ReactNode {
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
    setSelected(note.id);
    setTitle(note.title);
    setBody(note.body);
    setMessage('');
  };
  const fresh = (): void => {
    setSelected(null);
    setTitle('');
    setBody('');
    setMessage('');
  };
  const save = async (): Promise<void> => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const note = await window.api.desktop.notes.save({ ...(selected ? { id: selected } : {}), title, body });
      pick(note);
      setMessage('Note enregistrée.');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (): Promise<void> => {
    if (!selected || busy) return;
    if (!await ui.confirmer('Supprimer définitivement cette note ?', { ok: 'Supprimer' })) return;
    setBusy(true);
    try {
      if (await window.api.desktop.notes.remove(selected)) fresh();
    } finally {
      setBusy(false);
    }
  };
  const visible = notes.filter((note) => (note.title + ' ' + note.body).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <div className="carte mo-notes-library">
      <div className="page-h">
        <h2 className="sec-t">Mes notes</h2>
        <button className="btn sm" onClick={fresh}><Icon name="plus" size={16}/> Nouvelle note</button>
      </div>
      <p className="muted petit">Retrouve ici les notes enregistrées depuis les widgets ou cette rubrique. Les brouillons du bureau restent indépendants.</p>
      <div className="mo-notes-grid">
        <div className="mo-notes-list">
          <label className="champ"><Icon name="search" size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une note" aria-label="Rechercher une note"/></label>
          {visible.length === 0 && <p className="muted petit">Aucune note enregistrée.</p>}
          {visible.map((note) => <button key={note.id} type="button" className={`mo-note-item ${selected === note.id ? 'on' : ''}`} onClick={() => pick(note)}>
            <strong>{note.title}</strong>
            <span>{note.body.slice(0, 100)}</span>
            <small>{new Date(note.updatedAt).toLocaleString()}</small>
          </button>)}
        </div>
        <div className="mo-notes-editor">
          <label htmlFor="mo-note-title">Titre</label>
          <input id="mo-note-title" className="champ" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la note"/>
          <label htmlFor="mo-note-body">Contenu</label>
          <textarea id="mo-note-body" className="champ" rows={10} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} placeholder="Écris ta note ici…" />
          <div className="mo-note-actions">
            <button className="btn pri" disabled={busy || !body.trim()} onClick={() => void save()}><Icon name="save" size={16}/> Enregistrer</button>
            {selected && <button className="btn" disabled={busy} onClick={() => void remove()}><Icon name="trash" size={16}/> Supprimer</button>}
          </div>
          {message && <p role="status" className="muted petit">{message}</p>}
        </div>
      </div>
    </div>
  );
}
