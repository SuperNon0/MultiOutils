import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode
} from 'react';
import type { Folder, Tag } from '@multioutils/shared';
import type { ClipItem, ClipsSettings } from '../../../../common/types';
import { Icon } from '../../host/Icon';
import { useI18n, type TFunc } from '../../i18n';
import { ClipsSidebar, type ClipSource } from './ClipsSidebar';

/** Options de rétention proposées (heures ; 0 = jamais). */
const RETENTION_CHOICES = [1, 6, 24, 168, 720, 0] as const;

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

  const refresh = async (): Promise<void> => {
    setItems(await window.api.clips.list());
    setEnabled((await window.api.clips.getSettings()).enabled);
    setFolders(await window.api.clips.folders.list());
    setTags(await window.api.clips.tags.list());
  };

  useEffect(() => {
    void refresh();
    return window.api.clips.onChanged(() => void refresh());
  }, []);

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
      <header className="panel-header">
        <h2>{t('clips.title')}</h2>
        <div className="capture-bar">
          <button
            type="button"
            className={enabled ? 'btn' : 'btn btn-primary'}
            onClick={() => void toggleEnabled()}
          >
            {enabled ? t('clips.pause') : t('clips.resume')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void window.api.clips.syncNow().then(() => refresh())}
            title={t('clips.syncTooltip')}
          >
            <Icon name="restore" />
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
        </div>
        <div className="capture-hint muted">{t('clips.help')}</div>
      </header>

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
            <input
              className="input gallery-search"
              type="search"
              placeholder={t('clips.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="muted gallery-count">
              {t('clips.count', { n: visible.length })}
            </span>
            <div className="gallery-toolbar-right">
              <button
                type="button"
                className="btn"
                onClick={() => void window.api.clips.clearUnpinned()}
                title={t('clips.clearTooltip')}
              >
                <Icon name="trash" size={13} />
                {t('clips.clear')}
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="gallery-empty muted">
              {items.length === 0 ? t('clips.empty') : t('clips.noMatch')}
            </div>
          ) : (
            <div className="clips-list">
              {visible.map((item) => (
                <div key={item.id} className={`clip-row card${item.pinned ? ' pinned' : ''}`}>
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
                        <span className="clip-text">{item.preview}</span>
                      )}
                      <span className="clip-meta muted">
                        {item.source === 'remote' && (
                          <span className="clip-badge" title={t('clips.fromPhone')}>
                            <Icon name="phone" size={12} />
                          </span>
                        )}
                        {timeLabel(item.createdAt)}
                        {folderName(item.folderId) && (
                          <span className="clip-folder">
                            <Icon name="folder" size={11} /> {folderName(item.folderId)}
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
                        {item.remoteId && item.source === 'local' && (
                          <span title={t('clips.sentTooltip')}> · ✓</span>
                        )}
                      </span>
                    </button>

                    {editingId === item.id && (
                      <div className="clip-organize">
                        <select
                          className="select"
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
                        <div className="clip-tag-picker">
                          {tags.length === 0 ? (
                            <span className="muted">{t('clips.noTagsYet')}</span>
                          ) : (
                            tags.map((tag) => (
                              <button
                                key={tag.id}
                                type="button"
                                className={`clip-tag-choice${item.tagIds.includes(tag.id) ? ' on' : ''}`}
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
                    {item.kind === 'file' && (
                      <button
                        type="button"
                        className="btn btn-icon"
                        title={t('clips.reveal')}
                        onClick={() => void window.api.clips.reveal(item.id)}
                      >
                        <Icon name="reveal" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn btn-icon${editingId === item.id ? ' active' : ''}`}
                      title={t('clips.organize')}
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    >
                      <Icon name="folder" />
                    </button>
                    <button
                      type="button"
                      className={`btn btn-icon${item.pinned ? ' active' : ''}`}
                      title={item.pinned ? t('clips.unpin') : t('clips.pin')}
                      onClick={() => void window.api.clips.pin(item.id, !item.pinned)}
                    >
                      <Icon name={item.pinned ? 'starFilled' : 'star'} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon"
                      title={t('clips.send')}
                      onClick={() => void window.api.clips.send(item.id)}
                    >
                      <Icon name="send" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon"
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
      <div className="setting-row">
        <span>{t('clips.settings.enabled')}</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void update({ enabled: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <span>{t('clips.settings.retention')}</span>
        <select
          className="select"
          value={settings.retentionHours}
          onChange={(e) => void update({ retentionHours: Number(e.target.value) })}
        >
          {RETENTION_CHOICES.map((hours) => (
            <option key={hours} value={hours}>
              {retentionLabel(hours, t)}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>{t('clips.settings.sync')}</span>
        <input
          type="checkbox"
          checked={settings.sync}
          onChange={(e) => void update({ sync: e.target.checked })}
        />
      </div>
      <div className="setting-hint muted">{t('clips.settings.hint')}</div>
    </>
  );
}
