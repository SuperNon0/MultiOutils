import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode
} from 'react';
import type { Folder, Tag } from '@multioutils/shared';
import type { ClipItem, ClipsSettings } from '../../../../common/types';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSec, RegSwitch } from '../../host/reglages';
import { useI18n, type TFunc } from '../../i18n';
import { ClipsSidebar, type ClipSource } from './ClipsSidebar';

/** Options de rétention proposées (heures ; 0 = jamais). */
const RETENTION_CHOICES = [1, 6, 24, 168, 720, 0] as const;

/** Longueur affichée d'un texte : le CSS clampe à N lignes, ceci borne le DOM. */
const DISPLAY_CHARS = 4000;

function retentionLabel(hours: number, t: TFunc): string {
  if (hours === 0) return t('clips.retention.never');
  if (hours < 24) return t('clips.retention.hours', { n: hours });
  return t('clips.retention.days', { n: Math.round(hours / 24) });
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString()} ${time}`;
}

/** Borne inférieure des vues intelligentes (aujourd'hui / semaine / mois). */
function periodStart(period: 'today' | 'week' | 'month'): number {
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === 'week') return now.getTime() - 7 * 24 * 3600_000;
  return now.getTime() - 30 * 24 * 3600_000;
}

/** Dossiers aplatis avec indentation (pour le sélecteur d'organisation). */
function flattenFolders(folders: Folder[]): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const folder of folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ id: folder.id, label: `${'— '.repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Visionneuse plein texte d'un clip : défilement natif + sélection libre
 *  pour copier un passage précis (textarea en lecture seule — la sélection
 *  et le Ctrl+C fonctionnent nativement, sans logique custom). */
function ClipTextModal({ item, onClose }: { item: ClipItem; onClose: () => void }): ReactNode {
  const { t } = useI18n();

  return (
    <Feuille
      large
      className="clip-text-modal"
      onClose={onClose}
      titre={
        <span className="apercu-t">
          <span className="apercu-nom">{t('clips.fullTextTitle')}</span>
          <span className="apercu-sous">{timeLabel(item.createdAt)}</span>
        </span>
      }
      actions={
        <button type="button" className="btn sm" onClick={() => void window.api.clips.copy(item.id)}>
          <Icon name="copy" size={16} />
          {t('clips.copyAll')}
        </button>
      }
    >
      <textarea className="input clip-text-full" readOnly value={item.content ?? ''} />
    </Feuille>
  );
}

/** Panneau « Presse-papiers » — même présentation que la bibliothèque de
 *  captures : barre latérale (favoris, périodes, dossiers, tags séparés),
 *  barre d'outils, liste. */
export function ClipboardPanel(): ReactNode {
  const { t } = useI18n();
  const [items, setItems] = useState<ClipItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [source, setSource] = useState<ClipSource>({ kind: 'all' });
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [viewingItem, setViewingItem] = useState<ClipItem | null>(null);

  const refresh = async (): Promise<void> => {
    setItems(await window.api.clips.list());
    setEnabled((await window.api.clips.getSettings()).enabled);
    setFolders(await window.api.clips.folders.list());
    setTags(await window.api.clips.tags.list());
    setServerUrl((await window.api.remote.getConfig()).url);
  };

  useEffect(() => {
    void refresh();
    return window.api.clips.onChanged(() => void refresh());
  }, []);

  // Ferme la visionneuse si le clip affiché a été supprimé/purgé entre-temps.
  useEffect(() => {
    if (viewingItem && !items.some((i) => i.id === viewingItem.id)) setViewingItem(null);
  }, [items, viewingItem]);

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);
  const folderName = (id: string | null): string | null =>
    id ? (folders.find((f) => f.id === id)?.name ?? null) : null;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      switch (source.kind) {
        case 'favorites':
          if (!item.pinned) return false;
          break;
        case 'smart':
          if (new Date(item.createdAt).getTime() < periodStart(source.period)) return false;
          break;
        case 'unsorted':
          if (item.folderId) return false;
          break;
        case 'phone':
          if (item.source !== 'remote') return false;
          break;
        case 'sent':
          if (!(item.remoteId && item.source === 'local')) return false;
          break;
        case 'folder':
          if (item.folderId !== source.folderId) return false;
          break;
        default:
          break;
      }
      if (activeTagIds.length > 0 && !activeTagIds.every((id) => item.tagIds.includes(id)))
        return false;
      if (!query) return true;
      return (item.content ?? item.preview).toLowerCase().includes(query);
    });
  }, [items, source, activeTagIds, search]);

  const toggleEnabled = async (): Promise<void> => {
    const next = await window.api.clips.setSettings({ enabled: !enabled });
    setEnabled(next.enabled);
  };

  const toggleTag = async (item: ClipItem, tagId: string): Promise<void> => {
    const next = item.tagIds.includes(tagId)
      ? item.tagIds.filter((id) => id !== tagId)
      : [...item.tagIds, tagId];
    await window.api.clips.organize(item.id, { tagIds: next });
  };

  const handleDrop = async (event: ReactDragEvent): Promise<void> => {
    event.preventDefault();
    setDragOver(false);
    const paths = window.api.files.pathsFor(Array.from(event.dataTransfer.files));
    if (paths.length > 0) await window.api.clips.addPaths(paths);
  };

  return (
    <div className="panel">
      <div className="page-h">
        <h1 className="page-t">{t('clips.title')}</h1>
        <div className="ligne capture-bar">
          <button
            type="button"
            className={enabled ? 'btn' : 'btn pri'}
            onClick={() => void toggleEnabled()}
          >
            <Icon name={enabled ? 'minus' : 'play'} />
            {enabled ? t('clips.pause') : t('clips.resume')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void window.api.clips.syncNow().then(() => refresh())}
            title={t('clips.syncTooltip')}
          >
            <Icon name="sync" />
            {t('clips.sync')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void window.api.clips.importFiles()}
            title={t('clips.addFileTooltip')}
          >
            <Icon name="file" />
            {t('clips.addFile')}
          </button>
          {serverUrl && (
            <button
              type="button"
              className="btn"
              onClick={() => window.open(`${serverUrl}/clips`, '_blank')}
              title={t('clips.openSiteTooltip')}
            >
              <Icon name="send" />
              {t('clips.openSite')}
            </button>
          )}
        </div>
      </div>
      <p className="intro-p">{t('clips.help')}</p>

      <section className="gallery gallery-with-sidebar">
        <ClipsSidebar
          source={source}
          folders={folders}
          tags={tags}
          activeTagIds={activeTagIds}
          onSource={setSource}
          onToggleTag={(id) =>
            setActiveTagIds((ids) =>
              ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
            )
          }
          onChanged={() => void refresh()}
        />

        <div
          className={`gallery-main${dragOver ? ' clips-drop-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void handleDrop(e)}
        >
          <div className="gallery-toolbar">
            <label className="champ gallery-search">
              <Icon name="search" />
              <input
                type="search"
                placeholder={t('clips.search')}
                aria-label={t('clips.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <span className="gallery-count mono">
              {t('clips.count', { n: visible.length })}
            </span>
            <div className="gallery-toolbar-right">
              <button
                type="button"
                className="btn sm gh"
                onClick={() => void window.api.clips.clearUnpinned()}
                title={t('clips.clearTooltip')}
              >
                <Icon name="trash" size={16} />
                {t('clips.clear')}
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="vide gallery-empty">
              <Icon name={items.length === 0 ? 'clipboard' : 'search'} />
              <span>{items.length === 0 ? t('clips.empty') : t('clips.noMatch')}</span>
            </div>
          ) : (
            <div className="clips-list anim-in">
              {visible.map((item) => (
                <div key={item.id} className={`clip-row carte${item.pinned ? ' pinned' : ''}`}>
                  <div className="clip-body">
                    <button
                      type="button"
                      className="clip-main"
                      title={item.kind === 'file' ? t('clips.openTooltip') : t('clips.copyTooltip')}
                      onClick={() =>
                        void (item.kind === 'file'
                          ? window.api.clips.open(item.id)
                          : window.api.clips.copy(item.id))
                      }
                    >
                      {item.kind === 'image' ? (
                        <img className="clip-thumb" src={item.preview} alt="" />
                      ) : item.kind === 'file' ? (
                        <span className="clip-file">
                          <Icon name="file" size={20} />
                          <span className="clip-file-name">{item.filename ?? item.preview}</span>
                          {item.sizeBytes !== null && (
                            <span className="clip-file-size muted">{humanSize(item.sizeBytes)}</span>
                          )}
                        </span>
                      ) : (
                        <div className="clip-text">
                          {(item.content ?? item.preview).slice(0, DISPLAY_CHARS)}
                        </div>
                      )}
                      <span className="clip-meta muted">
                        {item.source === 'remote' && (
                          <span className="clip-badge" title={t('clips.fromPhone')}>
                            <Icon name="phone" size={14} />
                          </span>
                        )}
                        {item.remoteId && item.source === 'local' && (
                          <span className="clip-badge clip-badge-sent" title={t('clips.sentTooltip')}>
                            <Icon name="send" size={14} /> {t('clips.sentBadge')}
                          </span>
                        )}
                        {timeLabel(item.createdAt)}
                        {folderName(item.folderId) && (
                          <span className="clip-folder">
                            <Icon name="folder" size={14} /> {folderName(item.folderId)}
                          </span>
                        )}
                        {item.tagIds.length > 0 && (
                          <span className="clip-tags">
                            {item.tagIds
                              .map((id) => tags.find((tg) => tg.id === id))
                              .filter((tg): tg is Tag => Boolean(tg))
                              .map((tg) => (
                                <span
                                  key={tg.id}
                                  className="clip-tag"
                                  style={tg.color ? { borderColor: tg.color, color: tg.color } : undefined}
                                >
                                  {tg.name}
                                </span>
                              ))}
                          </span>
                        )}
                      </span>
                    </button>

                    {editingId === item.id && (
                      <div className="clip-organize">
                        <select
                          className="select sm"
                          value={item.folderId ?? ''}
                          aria-label={t('clips.folder')}
                          onChange={(e) =>
                            void window.api.clips.organize(item.id, {
                              folderId: e.target.value || null
                            })
                          }
                        >
                          <option value="">{t('clips.noFolder')}</option>
                          {folderOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <div className="chips clip-tag-picker">
                          {tags.length === 0 ? (
                            <span className="muted">{t('clips.noTagsYet')}</span>
                          ) : (
                            tags.map((tag) => (
                              <button
                                key={tag.id}
                                type="button"
                                className={`chip${item.tagIds.includes(tag.id) ? ' on' : ''}`}
                                onClick={() => void toggleTag(item, tag.id)}
                              >
                                {tag.name}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="clip-actions">
                    {item.kind === 'text' && (
                      <button
                        type="button"
                        className="ib"
                        title={t('clips.viewFull')}
                        onClick={() => setViewingItem(item)}
                      >
                        <Icon name="expand" />
                      </button>
                    )}
                    {item.kind === 'file' && (
                      <button
                        type="button"
                        className="ib"
                        title={t('clips.reveal')}
                        onClick={() => void window.api.clips.reveal(item.id)}
                      >
                        <Icon name="reveal" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`ib${editingId === item.id ? ' on' : ''}`}
                      title={t('clips.organize')}
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    >
                      <Icon name="folder" />
                    </button>
                    <button
                      type="button"
                      className={`ib${item.pinned ? ' on' : ''}`}
                      title={item.pinned ? t('clips.unpin') : t('clips.pin')}
                      onClick={() => void window.api.clips.pin(item.id, !item.pinned)}
                    >
                      <Icon name={item.pinned ? 'starFilled' : 'star'} />
                    </button>
                    <button
                      type="button"
                      className="ib"
                      title={t('clips.send')}
                      onClick={() => void window.api.clips.send(item.id)}
                    >
                      <Icon name="send" />
                    </button>
                    <button
                      type="button"
                      className="ib"
                      title={t('clips.delete')}
                      onClick={() => void window.api.clips.remove(item.id)}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {viewingItem && (
        <ClipTextModal item={viewingItem} onClose={() => setViewingItem(null)} />
      )}
    </div>
  );
}

/** Section Paramètres du module : surveillance, rétention, sync serveur. */
export function ClipboardSettings(): ReactNode {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ClipsSettings | null>(null);

  useEffect(() => {
    void window.api.clips.getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const update = async (patch: Partial<ClipsSettings>): Promise<void> => {
    setSettings(await window.api.clips.setSettings(patch));
  };

  return (
    <>
      <RegSec>
        <RegSwitch
          titre={t('clips.settings.enabled')}
          checked={settings.enabled}
          onChange={(v) => void update({ enabled: v })}
        />
        <RegLigne titre={t('clips.settings.retention')}>
          <select
            className="select reg-select"
            value={settings.retentionHours}
            onChange={(e) => void update({ retentionHours: Number(e.target.value) })}
          >
            {RETENTION_CHOICES.map((hours) => (
              <option key={hours} value={hours}>
                {retentionLabel(hours, t)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegSwitch
          titre={t('clips.settings.sync')}
          checked={settings.sync}
          onChange={(v) => void update({ sync: v })}
        />
      </RegSec>
      <p className="muted petit reg-note">{t('clips.settings.hint')}</p>
    </>
  );
}
