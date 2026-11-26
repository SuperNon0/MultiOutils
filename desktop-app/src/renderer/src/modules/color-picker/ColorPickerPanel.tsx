import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { newColorId, type ColorFolder, type ColorLibrary, type SavedColor } from '../../../../common/colors';
import { ui } from '../../encre/ui';
import { useHost } from '../../host/context';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSec } from '../../host/reglages';
import { useI18n } from '../../i18n';
import { formatColor, readableText, toHex } from '../../lib/color';

type Format = 'hex' | 'rgb' | 'hsl';

interface HistoryEntry {
  r: number;
  g: number;
  b: number;
  hex: string;
  formatted: string;
  pickedAt: string;
}

/** Panneau pipette : prélever, format, historique des dernières couleurs. */
export function ColorPickerPanel(): ReactNode {
  const { t } = useI18n();
  const host = useHost();
  const [format, setFormat] = useState<Format>('hex');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [library, setLibrary] = useState<ColorLibrary>({ colors: [], folders: [] });

  const refresh = async (): Promise<void> => {
    setHistory(await window.api.colorpicker.history());
    setLibrary(await window.api.colorpicker.library());
    setFormat(await window.api.colorpicker.getFormat());
  };

  useEffect(() => {
    void refresh();
    return window.api.colorpicker.onHistoryChanged(() => void refresh());
  }, []);

  const copyEntry = async (entry: HistoryEntry): Promise<void> => {
    const code = formatColor(entry.r, entry.g, entry.b, format);
    await window.api.system.copyText(code);
    host.notify(t('colorpicker.copied', { code }));
  };

  const copyHex = async (hex: string): Promise<void> => {
    const [r, g, b] = rgbOf(hex);
    const code = formatColor(r, g, b, format);
    await window.api.system.copyText(code);
    host.notify(t('colorpicker.copied', { code }));
  };

  /** Garder une couleur prélevée avec un nom (dans « Mes couleurs »). */
  const saveEntry = async (entry: HistoryEntry): Promise<void> => {
    const name = await ui.demander(t('colorpicker.save'), { label: t('colorpicker.colorName'), placeholder: entry.hex });
    if (name === null) return;
    const saved = await window.api.colorpicker.saveColor({ id: newColorId(), hex: entry.hex, name: name.trim() || entry.hex, folder: null });
    if (saved) ui.toast(t('colorpicker.savedAs', { name: saved.name }));
  };

  const historyMenu = (e: MouseEvent, entry: HistoryEntry): void => {
    e.preventDefault();
    ui.menu({ x: e.clientX, y: e.clientY }, [
      { texte: t('colorpicker.save'), icone: 'star', action: () => void saveEntry(entry) },
      { texte: t('colorpicker.copyCode'), icone: 'copy', action: () => void copyEntry(entry) }
    ]);
  };

  const colorMenu = (e: MouseEvent, c: SavedColor): void => {
    e.preventDefault();
    const at = { x: e.clientX, y: e.clientY };
    ui.menu(at, [
      { texte: t('colorpicker.copyCode'), icone: 'copy', action: () => void copyHex(c.hex) },
      {
        texte: t('colorpicker.rename'),
        icone: 'edit',
        action: async () => {
          const name = await ui.demander(t('colorpicker.rename'), { label: t('colorpicker.colorName'), valeur: c.name });
          if (name?.trim()) await window.api.colorpicker.saveColor({ ...c, name: name.trim() });
        }
      },
      {
        texte: t('colorpicker.moveTo'),
        icone: 'folder',
        action: () =>
          ui.menu(at, [
            { texte: t('colorpicker.noFolder'), action: () => void window.api.colorpicker.saveColor({ ...c, folder: null }) },
            ...library.folders.map((f) => ({ texte: f.name, icone: 'folder', action: () => void window.api.colorpicker.saveColor({ ...c, folder: f.id }) }))
          ])
      },
      { texte: t('colorpicker.remove'), icone: 'trash', danger: true, action: () => void window.api.colorpicker.removeColor(c.id) }
    ]);
  };

  const newFolder = async (): Promise<void> => {
    const name = await ui.demander(t('colorpicker.newFolder'), { label: t('colorpicker.folderName') });
    if (name?.trim()) await window.api.colorpicker.saveFolder({ id: newColorId('fcol'), name: name.trim() });
  };

  const folderMenu = (anchor: HTMLElement, f: ColorFolder): void => {
    ui.menu(anchor, [
      {
        texte: t('colorpicker.rename'),
        icone: 'edit',
        action: async () => {
          const name = await ui.demander(t('colorpicker.rename'), { label: t('colorpicker.folderName'), valeur: f.name });
          if (name?.trim()) await window.api.colorpicker.saveFolder({ ...f, name: name.trim() });
        }
      },
      {
        texte: t('colorpicker.deleteFolder'),
        icone: 'trash',
        danger: true,
        action: async () => {
          if (await ui.confirmer(t('colorpicker.deleteFolderConfirm', { name: f.name }), { danger: true, ok: t('colorpicker.deleteFolder') }))
            await window.api.colorpicker.removeFolder(f.id);
        }
      }
    ]);
  };

  // Groupes affichés : sans dossier d'abord, puis chaque dossier (même vide).
  const groups: Array<{ folder: ColorFolder | null; colors: SavedColor[] }> = [
    { folder: null, colors: library.colors.filter((c) => !c.folder) },
    ...library.folders.map((f) => ({ folder: f, colors: library.colors.filter((c) => c.folder === f.id) }))
  ].filter((g) => g.folder || g.colors.length);

  // Dernière couleur prélevée : l'historique est trié du plus récent au plus
  // ancien (module principal), donc history[0] est la couleur « actuelle ».
  const current = history[0];

  return (
    <div className="panel">
      <div className="page-h">
        <h1 className="page-t">{t('colorpicker.title')}</h1>
        <div className="ligne capture-bar">
          <div className="seg reg-seg" role="group" aria-label={t('colorpicker.format')}>
            {(['hex', 'rgb', 'hsl'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={format === f ? 'on' : ''}
                aria-pressed={format === f}
                onClick={() => {
                  setFormat(f);
                  void window.api.colorpicker.setFormat(f);
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn pri cp-pick"
            onClick={() => void window.api.colorpicker.start()}
          >
            {/* La pipette « se remplit » de la dernière couleur prélevée. */}
            <span
              className="cp-pick-tip"
              style={
                current
                  ? {
                      background: toHex(current.r, current.g, current.b),
                      color: readableText(current.r, current.g, current.b)
                    }
                  : undefined
              }
            >
              <Icon name="eyedropper" />
            </span>
            {t('colorpicker.pick')}
          </button>
        </div>
      </div>
      <p className="intro-p">{t('colorpicker.help')}</p>

        {current && (
          <button
            type="button"
            className="cp-current carte"
            title={t('colorpicker.copyTooltip')}
            onClick={() => void copyEntry(current)}
          >
            <span
              className="cp-current-swatch"
              style={{ background: toHex(current.r, current.g, current.b) }}
            />
            <span className="cp-current-text">
              <span className="cp-current-label muted">{t('colorpicker.current')}</span>
              <span className="cp-current-code">
                {formatColor(current.r, current.g, current.b, format)}
              </span>
            </span>
            <span className="cp-current-copy ib">
              <Icon name="copy" />
            </span>
          </button>
        )}

      <section className="cp-mine">
        <div className="sec-h">
          <h2 className="sec-t">{t('colorpicker.mine')}</h2>
          <button type="button" className="btn gh sm" onClick={() => void newFolder()}>
            <Icon name="folder" size={16} />
            {t('colorpicker.newFolder')}
          </button>
        </div>
        {groups.length === 0 ? (
          <p className="muted cp-mine-vide">{t('colorpicker.mineEmpty')}</p>
        ) : (
          groups.map((g) => (
            <div key={g.folder?.id ?? '_'} className="cp-group">
              <div className="cp-group-h">
                <Icon name="folder" size={15} />
                <span>{g.folder ? g.folder.name : t('colorpicker.noFolder')}</span>
                {g.folder && (
                  <button
                    type="button"
                    className="ib sm"
                    title={t('colorpicker.folderMenu')}
                    onClick={(e) => folderMenu(e.currentTarget, g.folder as ColorFolder)}
                  >
                    <Icon name="more" size={16} />
                  </button>
                )}
              </div>
              <div className="cp-grid">
                {g.colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="cp-swatch"
                    title={t('colorpicker.copyTooltip')}
                    onClick={() => void copyHex(c.hex)}
                    onContextMenu={(e) => colorMenu(e, c)}
                  >
                    <span className="cp-color" style={{ background: c.hex }} />
                    <span className="cp-name">{c.name}</span>
                    <span className="cp-code">{(() => { const [r, gg, b] = rgbOf(c.hex); return formatColor(r, gg, b, format); })()}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="cp-history">
        <div className="sec-h">
          <h2 className="sec-t">{t('colorpicker.history')}</h2>
          {history.length > 0 && (
            <button
              type="button"
              className="btn gh sm"
              onClick={() => void window.api.colorpicker.clearHistory()}
            >
              <Icon name="trash" size={16} />
              {t('colorpicker.clear')}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="vide">
            <Icon name="eyedropper" />
            <span>{t('colorpicker.historyEmpty')}</span>
          </div>
        ) : (
          <div className="cp-grid anim-in">
            {history.map((entry) => (
              <button
                key={`${entry.hex}-${entry.pickedAt}`}
                type="button"
                className="cp-swatch"
                title={t('colorpicker.copyTooltip')}
                onClick={() => void copyEntry(entry)}
                onContextMenu={(e) => historyMenu(e, entry)}
              >
                <span
                  className="cp-color"
                  style={{ background: toHex(entry.r, entry.g, entry.b) }}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    className="cp-save"
                    title={t('colorpicker.save')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void saveEntry(entry);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        void saveEntry(entry);
                      }
                    }}
                  >
                    <Icon name="plus" size={14} />
                  </span>
                </span>
                <span className="cp-code">
                  {formatColor(entry.r, entry.g, entry.b, format)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** #rrggbb → [r, g, b]. */
function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Section Paramètres du module : format copié par défaut. */
export function ColorPickerSettings(): ReactNode {
  const { t } = useI18n();
  const [format, setFormat] = useState<Format>('hex');

  useEffect(() => {
    void window.api.colorpicker.getFormat().then(setFormat);
  }, []);

  return (
    <RegSec>
      <RegLigne titre={t('colorpicker.format')}>
        <div className="seg reg-seg" role="group" aria-label={t('colorpicker.format')}>
          {(['hex', 'rgb', 'hsl'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={format === f ? 'on' : ''}
              aria-pressed={format === f}
              onClick={() => {
                setFormat(f);
                void window.api.colorpicker.setFormat(f);
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </RegLigne>
    </RegSec>
  );
}
