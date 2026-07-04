import {
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode
} from 'react';
import type { Folder, Tag } from '@multioutils/shared';
import { Icon } from '../../../host/Icon';
import { useI18n } from '../../../i18n';
import { PALETTE } from '../editor/model';

/** Source affichée dans la galerie (dossier réel, virtuel ou intelligent). */
export type LibSource =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'unsorted' }
  | { kind: 'sent' }
  | { kind: 'smart'; period: 'today' | 'week' | 'month' }
  | { kind: 'folder'; folderId: string };

export const sameSource = (a: LibSource, b: LibSource): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

interface Editing {
  type: 'folder' | 'tag';
  id: string | null; // null = création
  parentId: string | null;
  name: string;
  color: string | null;
}

interface Props {
  source: LibSource;
  folders: Folder[];
  tags: Tag[];
  activeTagIds: string[];
  onSource(source: LibSource): void;
  onToggleTag(id: string): void;
  onChanged(): void;
  /** Dépôt de captures (fichiers natifs) sur un dossier. */
  onDropCaptures(folderId: string | null, event: ReactDragEvent): void;
}

/** Barre latérale : dossiers intelligents, favoris, dossiers, tags (docs/03). */
export function LibrarySidebar({
  source,
  folders,
  tags,
  activeTagIds,
  onSource,
  onToggleTag,
  onChanged,
  onDropCaptures
}: Props): ReactNode {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const children = (parentId: string | null): Folder[] =>
    folders.filter((f) => f.parentId === parentId);

  const submitEditing = async (): Promise<void> => {
    if (!editing) return;
    const name = editing.name.trim();
    setEditing(null);
    if (!name) return;
    if (editing.type === 'folder') {
      if (editing.id) {
        await window.api.folders.update(editing.id, { name, color: editing.color });
      } else {
        await window.api.folders.create(name, editing.parentId, editing.color);
      }
    } else if (editing.id) {
      await window.api.tags.update(editing.id, { name, color: editing.color });
    } else {
      await window.api.tags.create(name, editing.color ?? PALETTE[0]);
    }
    onChanged();
  };

  const deleteFolder = async (folder: Folder): Promise<void> => {
    if (window.confirm(t('library.folder.confirmDelete', { name: folder.name }))) {
      await window.api.folders.remove(folder.id);
      if (source.kind === 'folder' && source.folderId === folder.id) {
        onSource({ kind: 'all' });
      }
      onChanged();
    }
  };

  const deleteTag = async (tag: Tag): Promise<void> => {
    if (window.confirm(t('library.tag.confirmDelete', { name: tag.name }))) {
      await window.api.tags.remove(tag.id);
      onChanged();
    }
  };

  const dropProps = (
    folderId: string | null,
    key: string
  ): Record<string, unknown> => ({
    onDragOver: (event: ReactDragEvent) => {
      event.preventDefault();
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((cur) => (cur === key ? null : cur)),
    onDrop: (event: ReactDragEvent) => {
      setDropTarget(null);
      onDropCaptures(folderId, event);
    }
  });

  const editorRow = (edit: Editing): ReactNode => (
    <div className="lib-editor" style={{ paddingLeft: edit.type === 'folder' ? 8 : 0 }}>
      <input
        className="input lib-editor-input"
        value={edit.name}
        autoFocus
        placeholder={t(
          edit.type === 'folder' ? 'library.folder.namePlaceholder' : 'library.tag.namePlaceholder'
        )}
        onChange={(e) => setEditing({ ...edit, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submitEditing();
          if (e.key === 'Escape') setEditing(null);
        }}
      />
      <div className="lib-editor-colors">
        {PALETTE.slice(0, 6).map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch small${edit.color === color ? ' active' : ''}`}
            style={{ background: color }}
            aria-label={color}
            onClick={() => setEditing({ ...edit, color })}
          />
        ))}
        <button
          type="button"
          className="btn btn-icon"
          aria-label={t('common.save')}
          onClick={() => void submitEditing()}
        >
          <Icon name="check" size={12} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={t('common.cancel')}
          onClick={() => setEditing(null)}
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    </div>
  );

  const renderFolder = (folder: Folder, depth: number): ReactNode => {
    const isEditing = editing?.type === 'folder' && editing.id === folder.id;
    return (
      <div key={folder.id}>
        {isEditing ? (
          editorRow(editing)
        ) : (
          <div
            className={`lib-item lib-folder${
              source.kind === 'folder' && source.folderId === folder.id ? ' active' : ''
            }${dropTarget === folder.id ? ' drop' : ''}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            {...dropProps(folder.id, folder.id)}
          >
            <button
              type="button"
              className="lib-item-main"
              onClick={() => onSource({ kind: 'folder', folderId: folder.id })}
            >
              <span
                className="lib-dot"
                style={{ background: folder.color ?? 'var(--muted)' }}
              />
              <span className="lib-name" title={folder.name}>
                {folder.name}
              </span>
            </button>
            <span className="lib-item-actions">
              <MiniBtn
                icon="plus"
                label={t('library.folder.newSub')}
                onClick={() =>
                  setEditing({
                    type: 'folder',
                    id: null,
                    parentId: folder.id,
                    name: '',
                    color: null
                  })
                }
              />
              <MiniBtn
                icon="textTool"
                label={t('gallery.rename')}
                onClick={() =>
                  setEditing({
                    type: 'folder',
                    id: folder.id,
                    parentId: folder.parentId,
                    name: folder.name,
                    color: folder.color
                  })
                }
              />
              <MiniBtn
                icon="trash"
                label={t('gallery.delete')}
                onClick={() => void deleteFolder(folder)}
              />
            </span>
          </div>
        )}
        {editing?.type === 'folder' &&
          editing.id === null &&
          editing.parentId === folder.id &&
          editorRow(editing)}
        {children(folder.id).map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  const smartItems: Array<{ source: LibSource; icon: string; label: string }> = [
    { source: { kind: 'all' }, icon: 'image', label: t('library.all') },
    { source: { kind: 'favorites' }, icon: 'star', label: t('library.favorites') },
    {
      source: { kind: 'smart', period: 'today' },
      icon: 'clock',
      label: t('library.today')
    },
    {
      source: { kind: 'smart', period: 'week' },
      icon: 'clock',
      label: t('library.week')
    },
    {
      source: { kind: 'smart', period: 'month' },
      icon: 'clock',
      label: t('library.month')
    },
    { source: { kind: 'unsorted' }, icon: 'folder', label: t('library.unsorted') },
    { source: { kind: 'sent' }, icon: 'send', label: t('library.sent') }
  ];

  return (
    <aside className="lib-sidebar">
      <nav>
        {smartItems.map((item) => (
          <div
            key={JSON.stringify(item.source)}
            className={`lib-item${sameSource(source, item.source) ? ' active' : ''}${
              item.source.kind === 'unsorted' && dropTarget === 'unsorted' ? ' drop' : ''
            }`}
            {...(item.source.kind === 'unsorted' ? dropProps(null, 'unsorted') : {})}
          >
            <button
              type="button"
              className="lib-item-main"
              onClick={() => onSource(item.source)}
            >
              <Icon name={item.icon} size={13} />
              <span className="lib-name">{item.label}</span>
            </button>
          </div>
        ))}
      </nav>

      <div className="lib-section">
        <span>{t('library.folders')}</span>
        <MiniBtn
          icon="plus"
          label={t('library.folder.new')}
          onClick={() =>
            setEditing({ type: 'folder', id: null, parentId: null, name: '', color: null })
          }
        />
      </div>
      <div className="lib-tree">
        {children(null).map((folder) => renderFolder(folder, 0))}
        {editing?.type === 'folder' &&
          editing.id === null &&
          editing.parentId === null &&
          editorRow(editing)}
        {folders.length === 0 && !editing && (
          <div className="muted lib-empty">{t('library.folder.none')}</div>
        )}
      </div>

      <div className="lib-section">
        <span>{t('library.tags')}</span>
        <MiniBtn
          icon="plus"
          label={t('library.tag.new')}
          onClick={() =>
            setEditing({ type: 'tag', id: null, parentId: null, name: '', color: PALETTE[0] })
          }
        />
      </div>
      <div className="lib-tree">
        {tags.map((tag) =>
          editing?.type === 'tag' && editing.id === tag.id ? (
            editorRow(editing)
          ) : (
            <div
              key={tag.id}
              className={`lib-item${activeTagIds.includes(tag.id) ? ' active' : ''}`}
            >
              <button
                type="button"
                className="lib-item-main"
                onClick={() => onToggleTag(tag.id)}
              >
                <span
                  className="lib-dot"
                  style={{ background: tag.color ?? 'var(--muted)' }}
                />
                <span className="lib-name" title={tag.name}>
                  {tag.name}
                </span>
              </button>
              <span className="lib-item-actions">
                <MiniBtn
                  icon="textTool"
                  label={t('gallery.rename')}
                  onClick={() =>
                    setEditing({
                      type: 'tag',
                      id: tag.id,
                      parentId: null,
                      name: tag.name,
                      color: tag.color
                    })
                  }
                />
                <MiniBtn
                  icon="trash"
                  label={t('gallery.delete')}
                  onClick={() => void deleteTag(tag)}
                />
              </span>
            </div>
          )
        )}
        {editing?.type === 'tag' && editing.id === null && editorRow(editing)}
        {tags.length === 0 && !editing && (
          <div className="muted lib-empty">{t('library.tag.none')}</div>
        )}
      </div>
    </aside>
  );
}

function MiniBtn({
  icon,
  label,
  onClick
}: {
  icon: string;
  label: string;
  onClick(): void;
}): ReactNode {
  return (
    <button
      type="button"
      className="lib-mini-btn"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}
