import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react';
import type { Capture } from '@multioutils/shared';
import type { LibraryView, SortKey } from '../../../../common/types';
import { useHost } from '../../host/context';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { displayAccelerator, formatBytes, formatDate } from '../../lib/format';

/** Galerie : grille, tri, renommage, corbeille, aperçu, ouverture éditeur. */
export function Gallery({ onEdit }: { onEdit(capture: Capture): void }): ReactNode {
  const { t, lang } = useI18n();
  const host = useHost();
  const [view, setView] = useState<LibraryView>('library');
  const [sort, setSort] = useState<SortKey>('date');
  const [items, setItems] = useState<Capture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [fullscreenShortcut, setFullscreenShortcut] = useState('PrintScreen');
  const gridRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setItems(await window.api.library.list(view, sort));
  }, [view, sort]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void window.api.settings
      .get()
      .then((s) => setFullscreenShortcut(s.shortcuts.fullscreen));
    const unsubChanged = window.api.library.onChanged(() => void refresh());
    const unsubDone = window.api.capture.onDone((capture) => {
      setView('library');
      setSelectedId(capture.id);
      void refresh();
    });
    return () => {
      unsubChanged();
      unsubDone();
    };
  }, [refresh]);

  // Navigation depuis une notification / la barre rapide : sélectionne la
  // capture, ou ouvre directement l'éditeur (action 'edit').
  useEffect(() => {
    if (!host.navCaptureId) return;
    setView('library');
    setSelectedId(host.navCaptureId);
    if (host.navAction === 'edit') {
      const capture = items.find((c) => c.id === host.navCaptureId);
      if (!capture) return; // attend le rafraîchissement de la liste
      host.consumeNavCapture();
      onEdit(capture);
      return;
    }
    host.consumeNavCapture();
  }, [host, host.navCaptureId, items, onEdit]);

  useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(`shot-${selectedId}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, items]);

  const selected = items.find((c) => c.id === selectedId) ?? null;
  const preview = items.find((c) => c.id === previewId) ?? null;

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

  const destroyOne = async (id: string): Promise<void> => {
    if (window.confirm(t('gallery.confirmDestroy'))) {
      await window.api.library.update({ action: 'destroy', id });
    }
  };

  const emptyTrash = async (): Promise<void> => {
    if (window.confirm(t('gallery.confirmEmptyTrash'))) {
      await window.api.library.update({ action: 'emptyTrash' });
    }
  };

  const onGridKeyDown = (event: KeyboardEvent): void => {
    if (!selected || renamingId) return;
    if (event.key === 'Delete') {
      event.preventDefault();
      if (view === 'library') {
        void window.api.library.update({ action: 'trash', id: selected.id });
      } else {
        void destroyOne(selected.id);
      }
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setPreviewId(selected.id);
    }
  };

  return (
    <section className="gallery">
      <div className="gallery-toolbar">
        <div className="gallery-views">
          <button
            type="button"
            className={`btn${view === 'library' ? ' btn-primary' : ''}`}
            onClick={() => setView('library')}
          >
            <Icon name="image" />
            {t('gallery.view.library')}
          </button>
          <button
            type="button"
            className={`btn${view === 'trash' ? ' btn-primary' : ''}`}
            onClick={() => setView('trash')}
          >
            <Icon name="trash" />
            {t('gallery.view.trash')}
          </button>
        </div>
        <span className="muted">{t('gallery.count', { n: items.length })}</span>
        <div className="gallery-toolbar-right">
          {view === 'trash' && items.length > 0 && (
            <button type="button" className="btn btn-danger" onClick={() => void emptyTrash()}>
              {t('gallery.emptyTrash')}
            </button>
          )}
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
        </div>
      </div>

      {items.length === 0 ? (
        <div className="gallery-empty muted">
          {view === 'trash'
            ? t('gallery.trashEmptyState')
            : t('gallery.empty', {
                shortcut: displayAccelerator(fullscreenShortcut, lang)
              })}
        </div>
      ) : (
        <div
          className="gallery-grid"
          ref={gridRef}
          tabIndex={0}
          role="listbox"
          aria-label={t('gallery.title')}
          onKeyDown={onGridKeyDown}
        >
          {items.map((capture) => (
            <div
              key={capture.id}
              id={`shot-${capture.id}`}
              role="option"
              aria-selected={selectedId === capture.id}
              className={`shot-card card${selectedId === capture.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(capture.id)}
              onDoubleClick={() =>
                view === 'library' ? onEdit(capture) : setPreviewId(capture.id)
              }
            >
              <div className="shot-thumb">
                <img
                  src={`mo-media://thumb/${capture.id}`}
                  alt={capture.filename}
                  loading="lazy"
                  draggable={false}
                />
                <div className="shot-actions">
                  {view === 'library' ? (
                    <>
                      <IconBtn name="edit" title={t('quickbar.edit')} onClick={() => onEdit(capture)} />
                      <IconBtn name="copy" title={t('gallery.copy')} onClick={() => void window.api.library.update({ action: 'copy', id: capture.id })} />
                      <IconBtn name="save" title={t('gallery.saveAs')} onClick={() => void window.api.library.update({ action: 'saveAs', id: capture.id })} />
                      <IconBtn name="textTool" title={t('gallery.rename')} onClick={() => startRename(capture)} />
                      <IconBtn name="reveal" title={t('gallery.reveal')} onClick={() => void window.api.library.update({ action: 'reveal', id: capture.id })} />
                      <IconBtn name="trash" title={t('gallery.delete')} onClick={() => void window.api.library.update({ action: 'trash', id: capture.id })} />
                    </>
                  ) : (
                    <>
                      <IconBtn name="restore" title={t('gallery.restore')} onClick={() => void window.api.library.update({ action: 'restore', id: capture.id })} />
                      <IconBtn name="trash" title={t('gallery.destroy')} onClick={() => void destroyOne(capture.id)} />
                    </>
                  )}
                </div>
              </div>
              <div className="shot-meta">
                {renamingId === capture.id ? (
                  <input
                    className="input shot-rename"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <div className="shot-name" title={capture.filename}>
                    {capture.filename}
                  </div>
                )}
                <div className="shot-sub muted">
                  {formatDate(capture.createdAt, lang)}
                  {capture.width && capture.height
                    ? ` · ${capture.width}×${capture.height}`
                    : ''}
                  {` · ${formatBytes(capture.sizeBytes)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
