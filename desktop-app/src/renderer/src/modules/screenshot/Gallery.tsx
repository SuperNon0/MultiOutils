import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';
import type { Capture, Folder, Tag } from '@multioutils/shared';
import type {
  CaptureListItem,
  LibraryQuery,
  LibraryView,
  SortKey
} from '../../../../common/types';
import { useHost } from '../../host/context';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { displayAccelerator, formatBytes, formatDate } from '../../lib/format';
import { LibrarySidebar, type LibSource } from './library/LibrarySidebar';

type DatePeriod = '' | 'today' | 'week' | 'month';
type ViewMode = 'grid' | 'list';
type ThumbSize = 's' | 'm' | 'l';

const THUMB_PX: Record<ThumbSize, number> = { s: 160, m: 205, l: 265 };
const VIEWMODE_KEY = 'multioutils.gallery.viewMode';
const THUMB_KEY = 'multioutils.gallery.thumbSize';

function dateFromFor(period: Exclude<DatePeriod, ''>): string {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return day.toISOString();
  if (period === 'week') {
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); // lundi
    return day.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** Bibliothèque complète : dossiers, tags, favoris, recherche, corbeille,
 * sélection multiple et actions en lot (docs/00 §4, docs/03). */
export function Gallery({ onEdit }: { onEdit(capture: Capture): void }): ReactNode {
  const { t, lang } = useI18n();
  const host = useHost();

  const [view, setView] = useState<LibraryView>('library');
  const [source, setSource] = useState<LibSource>({ kind: 'all' });
  const [sort, setSort] = useState<SortKey>('date');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [datePeriod, setDatePeriod] = useState<DatePeriod>('');
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEWMODE_KEY) as ViewMode) || 'grid'
  );
  const [thumbSize, setThumbSize] = useState<ThumbSize>(
    () => (localStorage.getItem(THUMB_KEY) as ThumbSize) || 'm'
  );
  const [items, setItems] = useState<CaptureListItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const anchorRef = useRef<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [fullscreenShortcut, setFullscreenShortcut] = useState('PrintScreen');

  useEffect(() => localStorage.setItem(VIEWMODE_KEY, viewMode), [viewMode]);
  useEffect(() => localStorage.setItem(THUMB_KEY, thumbSize), [thumbSize]);

  // recherche avec léger debounce
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const effectivePeriod: DatePeriod =
    source.kind === 'smart' ? source.period : datePeriod;

  const refresh = useCallback(async () => {
    const query: LibraryQuery = { view, sort };
    if (source.kind === 'folder') query.folderId = source.folderId;
    if (source.kind === 'favorites') query.favorites = true;
    if (source.kind === 'unsorted') query.unsorted = true;
    if (source.kind === 'sent') query.sent = true;
    const period = source.kind === 'smart' ? source.period : datePeriod;
    if (period) query.dateFrom = dateFromFor(period);
    if (search) query.search = search;
    if (activeTagIds.length > 0) query.tagIds = activeTagIds;
    setItems(await window.api.library.list(query));
  }, [view, sort, source, datePeriod, search, activeTagIds]);

  const refreshMeta = useCallback(async () => {
    setFolders(await window.api.folders.list());
    setTags(await window.api.tags.list());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshMeta();
    void window.api.settings
      .get()
      .then((s) => setFullscreenShortcut(s.shortcuts.fullscreen));
    const unsubChanged = window.api.library.onChanged(() => {
      void refresh();
      void refreshMeta();
    });
    const unsubDone = window.api.capture.onDone((capture) => {
      setView('library');
      setSelectedIds([capture.id]);
      anchorRef.current = capture.id;
      void refresh();
    });
    return () => {
      unsubChanged();
      unsubDone();
    };
  }, [refresh, refreshMeta]);

  // Navigation depuis une notification / la barre rapide.
  useEffect(() => {
    if (!host.navCaptureId) return;
    setView('library');
    setSelectedIds([host.navCaptureId]);
    anchorRef.current = host.navCaptureId;
    if (host.navAction === 'edit') {
      const capture = items.find((c) => c.id === host.navCaptureId);
      if (!capture) return; // attend le rafraîchissement
      host.consumeNavCapture();
      onEdit(capture);
      return;
    }
    host.consumeNavCapture();
  }, [host, host.navCaptureId, items, onEdit]);

  useEffect(() => {
    const first = selectedIds[0];
    if (!first) return;
    document.getElementById(`shot-${first}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIds, items]);

  // nettoie la sélection quand la liste change
  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => items.some((c) => c.id === id)));
  }, [items]);

  const selected = items.filter((c) => selectedIds.includes(c.id));
  const preview = items.find((c) => c.id === previewId) ?? null;

  const clickCard = (event: ReactMouseEvent, capture: CaptureListItem): void => {
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((ids) =>
        ids.includes(capture.id)
          ? ids.filter((id) => id !== capture.id)
          : [...ids, capture.id]
      );
      anchorRef.current = capture.id;
    } else if (event.shiftKey && anchorRef.current) {
      const a = items.findIndex((c) => c.id === anchorRef.current);
      const b = items.findIndex((c) => c.id === capture.id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelectedIds(items.slice(from, to + 1).map((c) => c.id));
      }
    } else {
      setSelectedIds([capture.id]);
      anchorRef.current = capture.id;
    }
  };

  const dragStart = (event: ReactDragEvent, capture: CaptureListItem): void => {
    event.preventDefault();
    const ids = selectedIds.includes(capture.id) ? selectedIds : [capture.id];
    window.api.library.startDrag(ids);
  };

  const dropOnFolder = async (
    folderId: string | null,
    event: ReactDragEvent
  ): Promise<void> => {
    event.preventDefault();
    const paths = window.api.files.pathsFor(Array.from(event.dataTransfer.files));
    const ids = await window.api.library.dropPaths(paths);
    if (ids.length > 0) {
      await window.api.library.update({ action: 'setFolder', ids, folderId });
    }
  };

  const startRename = (capture: Capture): void => {
    setRenamingId(capture.id);
    setRenameValue(capture.filename);
  };

  const commitRename = async (): Promise<void> => {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    if (id && name) {
      await window.api.library.update({ action: 'rename', id, name });
    }
  };

  const destroyMany = async (ids: string[]): Promise<void> => {
    if (window.confirm(t('gallery.confirmDestroy'))) {
      await window.api.library.update({ action: 'destroy', ids });
    }
  };

  const emptyTrash = async (): Promise<void> => {
    if (window.confirm(t('gallery.confirmEmptyTrash'))) {
      await window.api.library.update({ action: 'emptyTrash' });
    }
  };

  const onGridKeyDown = (event: ReactKeyboardEvent): void => {
    if (selectedIds.length === 0 || renamingId) return;
    if (event.key === 'Delete') {
      event.preventDefault();
      if (view === 'library') {
        void window.api.library.update({ action: 'trash', ids: selectedIds });
      } else {
        void destroyMany(selectedIds);
      }
    } else if ((event.key === ' ' || event.key === 'Enter') && selected[0]) {
      event.preventDefault();
      setPreviewId(selected[0].id);
    }
  };

  const allFavorites = selected.length > 0 && selected.every((c) => c.favorite);

  const folderOptions = ((): Array<{ id: string; label: string }> => {
    const out: Array<{ id: string; label: string }> = [];
    const walk = (parentId: string | null, depth: number): void => {
      for (const folder of folders.filter((f) => f.parentId === parentId)) {
        out.push({ id: folder.id, label: `${'— '.repeat(depth)}${folder.name}` });
        walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  })();

  return (
    <section className="gallery gallery-with-sidebar">
      <LibrarySidebar
        source={source}
        folders={folders}
        tags={tags}
        activeTagIds={activeTagIds}
        onSource={(s) => {
          setSource(s);
          setView('library');
        }}
        onToggleTag={(id) =>
          setActiveTagIds((ids) =>
            ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
          )
        }
        onChanged={() => void refreshMeta()}
        onDropCaptures={(folderId, event) => void dropOnFolder(folderId, event)}
      />

      <div className="gallery-main">
        <div className="gallery-toolbar">
          <input
            className="input gallery-search"
            type="search"
            placeholder={t('library.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="select"
            value={effectivePeriod}
            aria-label={t('library.dateFilter')}
            onChange={(e) => {
              const value = e.target.value as DatePeriod;
              if (source.kind === 'smart') {
                if (value) setSource({ kind: 'smart', period: value });
                else setSource({ kind: 'all' });
                setDatePeriod('');
              } else {
                setDatePeriod(value);
              }
            }}
          >
            <option value="">{t('library.date.any')}</option>
            <option value="today">{t('library.today')}</option>
            <option value="week">{t('library.week')}</option>
            <option value="month">{t('library.month')}</option>
          </select>
          <select
            className="select"
            value={sort}
            aria-label={t('gallery.sort.date')}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="date">{t('gallery.sort.date')}</option>
            <option value="name">{t('gallery.sort.name')}</option>
            <option value="size">{t('gallery.sort.size')}</option>
          </select>

          <span className="muted gallery-count">
            {t('gallery.count', { n: items.length })}
          </span>

          <div className="gallery-toolbar-right">
            <button
              type="button"
              className={`btn btn-icon${viewMode === 'grid' ? ' view-active' : ''}`}
              title={t('library.view.grid')}
              aria-label={t('library.view.grid')}
              onClick={() => setViewMode('grid')}
            >
              <Icon name="grid" size={14} />
            </button>
            <button
              type="button"
              className={`btn btn-icon${viewMode === 'list' ? ' view-active' : ''}`}
              title={t('library.view.list')}
              aria-label={t('library.view.list')}
              onClick={() => setViewMode('list')}
            >
              <Icon name="list" size={14} />
            </button>
            {viewMode === 'grid' && (
              <select
                className="select"
                value={thumbSize}
                aria-label={t('library.thumbSize')}
                onChange={(e) => setThumbSize(e.target.value as ThumbSize)}
              >
                <option value="s">{t('library.thumb.s')}</option>
                <option value="m">{t('library.thumb.m')}</option>
                <option value="l">{t('library.thumb.l')}</option>
              </select>
            )}
            <button
              type="button"
              className={`btn${view === 'trash' ? ' btn-primary' : ''}`}
              onClick={() => setView(view === 'trash' ? 'library' : 'trash')}
            >
              <Icon name="trash" size={13} />
              {t('gallery.view.trash')}
            </button>
            {view === 'trash' && items.length > 0 && (
              <button type="button" className="btn btn-danger" onClick={() => void emptyTrash()}>
                {t('gallery.emptyTrash')}
              </button>
            )}
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="selection-bar card">
            <span className="accent">
              {t('library.selected', { n: selectedIds.length })}
            </span>

            {view === 'library' ? (
              <>
                <select
                  className="select"
                  value=""
                  aria-label={t('library.moveTo')}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    void window.api.library.update({
                      action: 'setFolder',
                      ids: selectedIds,
                      folderId: value === '@none' ? null : value
                    });
                  }}
                >
                  <option value="">{t('library.moveTo')}</option>
                  <option value="@none">{t('library.unsorted')}</option>
                  {folderOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <div className="tag-menu-wrap">
                  <button
                    type="button"
                    className="btn"
                    aria-expanded={tagMenuOpen}
                    onClick={() => setTagMenuOpen((open) => !open)}
                  >
                    <Icon name="tag" size={13} />
                    {t('library.tags')}
                    <Icon name="chevronDown" size={11} />
                  </button>
                  {tagMenuOpen && (
                    <div className="tag-menu card">
                      {tags.length === 0 && (
                        <div className="muted lib-empty">{t('library.tag.none')}</div>
                      )}
                      {tags.map((tag) => {
                        const count = selected.filter((c) =>
                          c.tags.some((x) => x.id === tag.id)
                        ).length;
                        const all = count === selected.length && count > 0;
                        return (
                          <label key={tag.id} className="tag-menu-item">
                            <input
                              type="checkbox"
                              checked={all}
                              ref={(el) => {
                                if (el) el.indeterminate = count > 0 && !all;
                              }}
                              onChange={() =>
                                void window.api.library.update({
                                  action: all ? 'removeTag' : 'addTag',
                                  ids: selectedIds,
                                  tagId: tag.id
                                })
                              }
                            />
                            <span
                              className="lib-dot"
                              style={{ background: tag.color ?? 'var(--muted)' }}
                            />
                            {tag.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void window.api.library.update({
                      action: 'favorite',
                      ids: selectedIds,
                      value: !allFavorites
                    })
                  }
                >
                  <Icon name={allFavorites ? 'starFilled' : 'star'} size={13} />
                  {t('library.favorite')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void window.api.library.update({ action: 'export', ids: selectedIds })
                  }
                >
                  <Icon name="export" size={13} />
                  {t('library.export')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    void window.api.library.update({ action: 'trash', ids: selectedIds })
                  }
                >
                  <Icon name="trash" size={13} />
                  {t('gallery.delete')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void window.api.library.update({ action: 'restore', ids: selectedIds })
                  }
                >
                  <Icon name="restore" size={13} />
                  {t('gallery.restore')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void destroyMany(selectedIds)}
                >
                  {t('gallery.destroy')}
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-icon selection-clear"
              aria-label={t('common.cancel')}
              onClick={() => setSelectedIds([])}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="gallery-empty muted">
            {view === 'trash'
              ? t('gallery.trashEmptyState')
              : search || activeTagIds.length > 0 || source.kind !== 'all' || effectivePeriod
                ? t('library.noResults')
                : t('gallery.empty', {
                    shortcut: displayAccelerator(fullscreenShortcut, lang)
                  })}
          </div>
        ) : (
          <div
            className={viewMode === 'grid' ? 'gallery-grid' : 'gallery-list'}
            style={
              viewMode === 'grid'
                ? {
                    gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_PX[thumbSize]}px, 1fr))`
                  }
                : undefined
            }
            tabIndex={0}
            role="listbox"
            aria-multiselectable="true"
            aria-label={t('gallery.title')}
            onKeyDown={onGridKeyDown}
          >
            {items.map((capture) =>
              viewMode === 'grid' ? (
                <GridCard
                  key={capture.id}
                  capture={capture}
                  view={view}
                  selected={selectedIds.includes(capture.id)}
                  renaming={renamingId === capture.id}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameCommit={() => void commitRename()}
                  onRenameCancel={() => setRenamingId(null)}
                  onClick={(e) => clickCard(e, capture)}
                  onDoubleClick={() =>
                    view === 'library' ? onEdit(capture) : setPreviewId(capture.id)
                  }
                  onDragStart={(e) => dragStart(e, capture)}
                  onEdit={() => onEdit(capture)}
                  onRename={() => startRename(capture)}
                  onDestroy={() => void destroyMany([capture.id])}
                />
              ) : (
                <ListRow
                  key={capture.id}
                  capture={capture}
                  lang={lang}
                  selected={selectedIds.includes(capture.id)}
                  onClick={(e) => clickCard(e, capture)}
                  onDoubleClick={() =>
                    view === 'library' ? onEdit(capture) : setPreviewId(capture.id)
                  }
                  onDragStart={(e) => dragStart(e, capture)}
                />
              )
            )}
          </div>
        )}
      </div>

      {preview && (
        <PreviewModal
          capture={preview}
          onClose={() => setPreviewId(null)}
          onEdit={
            view === 'library'
              ? () => {
                  setPreviewId(null);
                  onEdit(preview);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function GridCard({
  capture,
  view,
  selected,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  onDragStart,
  onEdit,
  onRename,
  onDestroy
}: {
  capture: CaptureListItem;
  view: LibraryView;
  selected: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameChange(value: string): void;
  onRenameCommit(): void;
  onRenameCancel(): void;
  onClick(event: ReactMouseEvent): void;
  onDoubleClick(): void;
  onDragStart(event: ReactDragEvent): void;
  onEdit(): void;
  onRename(): void;
  onDestroy(): void;
}): ReactNode {
  const { t, lang } = useI18n();
  return (
    <div
      id={`shot-${capture.id}`}
      role="option"
      aria-selected={selected}
      className={`shot-card card${selected ? ' selected' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="shot-thumb">
        <img
          src={`mo-media://thumb/${capture.id}`}
          alt={capture.filename}
          loading="lazy"
          draggable={false}
        />
        <button
          type="button"
          className={`shot-fav${capture.favorite ? ' on' : ''}`}
          title={t('library.favorite')}
          aria-label={t('library.favorite')}
          onClick={(e) => {
            e.stopPropagation();
            void window.api.library.update({
              action: 'favorite',
              ids: [capture.id],
              value: !capture.favorite
            });
          }}
        >
          <Icon name={capture.favorite ? 'starFilled' : 'star'} size={14} />
        </button>
        <div className="shot-actions">
          {view === 'library' ? (
            <>
              <IconBtn name="edit" title={t('quickbar.edit')} onClick={onEdit} />
              <IconBtn name="copy" title={t('gallery.copy')} onClick={() => void window.api.library.update({ action: 'copy', id: capture.id })} />
              <IconBtn name="save" title={t('gallery.saveAs')} onClick={() => void window.api.library.update({ action: 'saveAs', id: capture.id })} />
              <IconBtn name="textTool" title={t('gallery.rename')} onClick={onRename} />
              <IconBtn name="reveal" title={t('gallery.reveal')} onClick={() => void window.api.library.update({ action: 'reveal', id: capture.id })} />
              <IconBtn name="trash" title={t('gallery.delete')} onClick={() => void window.api.library.update({ action: 'trash', ids: [capture.id] })} />
            </>
          ) : (
            <>
              <IconBtn name="restore" title={t('gallery.restore')} onClick={() => void window.api.library.update({ action: 'restore', ids: [capture.id] })} />
              <IconBtn name="trash" title={t('gallery.destroy')} onClick={onDestroy} />
            </>
          )}
        </div>
      </div>
      <div className="shot-meta">
        {renaming ? (
          <input
            className="input shot-rename"
            value={renameValue}
            autoFocus
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
          />
        ) : (
          <div className="shot-name" title={capture.filename}>
            {capture.filename}
          </div>
        )}
        <div className="shot-sub muted">
          {formatDate(capture.createdAt, lang)}
          {capture.width && capture.height ? ` · ${capture.width}×${capture.height}` : ''}
          {` · ${formatBytes(capture.sizeBytes)}`}
        </div>
        {capture.tags.length > 0 && (
          <div className="shot-tags">
            {capture.tags.map((tag) => (
              <span
                key={tag.id}
                className="shot-tag-dot"
                title={tag.name}
                style={{ background: tag.color ?? 'var(--muted)' }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListRow({
  capture,
  lang,
  selected,
  onClick,
  onDoubleClick,
  onDragStart
}: {
  capture: CaptureListItem;
  lang: 'fr' | 'en';
  selected: boolean;
  onClick(event: ReactMouseEvent): void;
  onDoubleClick(): void;
  onDragStart(event: ReactDragEvent): void;
}): ReactNode {
  return (
    <div
      id={`shot-${capture.id}`}
      role="option"
      aria-selected={selected}
      className={`list-row${selected ? ' selected' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <img
        className="list-thumb"
        src={`mo-media://thumb/${capture.id}`}
        alt=""
        loading="lazy"
        draggable={false}
      />
      {capture.favorite && (
        <span className="accent">
          <Icon name="starFilled" size={12} />
        </span>
      )}
      <span className="list-name" title={capture.filename}>
        {capture.filename}
      </span>
      <span className="list-tags">
        {capture.tags.map((tag) => (
          <span
            key={tag.id}
            className="shot-tag-chip"
            style={{ borderColor: tag.color ?? 'var(--border)' }}
          >
            {tag.name}
          </span>
        ))}
      </span>
      <span className="muted list-date">{formatDate(capture.createdAt, lang)}</span>
      <span className="muted list-dims">
        {capture.width && capture.height ? `${capture.width}×${capture.height}` : '—'}
      </span>
      <span className="muted list-size">{formatBytes(capture.sizeBytes)}</span>
    </div>
  );
}

function IconBtn({
  name,
  title,
  onClick
}: {
  name: string;
  title: string;
  onClick(): void;
}): ReactNode {
  return (
    <button
      type="button"
      className="btn btn-icon"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon name={name} size={14} />
    </button>
  );
}

function PreviewModal({
  capture,
  onClose,
  onEdit
}: {
  capture: Capture;
  onClose(): void;
  onEdit?: () => void;
}): ReactNode {
  const { t, lang } = useI18n();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-head">
          <div>
            <div className="shot-name">{capture.filename}</div>
            <div className="muted">
              {formatDate(capture.createdAt, lang)}
              {capture.width && capture.height
                ? ` · ${capture.width}×${capture.height}`
                : ''}
              {` · ${formatBytes(capture.sizeBytes)}`}
            </div>
          </div>
          <div className="preview-actions">
            {onEdit && (
              <button type="button" className="btn btn-primary" onClick={onEdit}>
                <Icon name="edit" />
                {t('quickbar.edit')}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => void window.api.library.update({ action: 'copy', id: capture.id })}
            >
              <Icon name="copy" />
              {t('gallery.copy')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void window.api.library.update({ action: 'saveAs', id: capture.id })}
            >
              <Icon name="save" />
              {t('gallery.saveAs')}
            </button>
            <button type="button" className="btn btn-icon" aria-label={t('common.close')} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="preview-body">
          <img src={`mo-media://capture/${capture.id}`} alt={capture.filename} />
        </div>
      </div>
    </div>
  );
}
