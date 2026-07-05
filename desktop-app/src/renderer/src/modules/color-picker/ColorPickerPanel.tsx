import { useEffect, useState, type ReactNode } from 'react';
import { useHost } from '../../host/context';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { formatColor } from '../../lib/color';

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

  const refresh = async (): Promise<void> => {
    setHistory(await window.api.colorpicker.history());
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

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>{t('colorpicker.title')}</h2>
        <div className="capture-bar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void window.api.colorpicker.start()}
          >
            <Icon name="eyedropper" />
            {t('colorpicker.pick')}
          </button>
          <select
            className="select"
            value={format}
            aria-label={t('colorpicker.format')}
            onChange={(e) => {
              const value = e.target.value as Format;
              setFormat(value);
              void window.api.colorpicker.setFormat(value);
            }}
          >
            <option value="hex">HEX</option>
            <option value="rgb">RGB</option>
            <option value="hsl">HSL</option>
          </select>
        </div>
        <div className="capture-hint muted">{t('colorpicker.help')}</div>
      </header>

      <section className="cp-history">
        <div className="gallery-toolbar">
          <h3 className="cp-history-title">{t('colorpicker.history')}</h3>
          {history.length > 0 && (
            <div className="gallery-toolbar-right">
              <button
                type="button"
                className="btn"
                onClick={() => void window.api.colorpicker.clearHistory()}
              >
                {t('colorpicker.clear')}
              </button>
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <div className="gallery-empty muted">{t('colorpicker.historyEmpty')}</div>
        ) : (
          <div className="cp-grid">
            {history.map((entry) => (
              <button
                key={`${entry.hex}-${entry.pickedAt}`}
                type="button"
                className="cp-swatch card"
                title={t('colorpicker.copyTooltip')}
                onClick={() => void copyEntry(entry)}
              >
                <span className="cp-color" style={{ background: entry.hex }} />
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

/** Section Paramètres du module : format copié par défaut. */
export function ColorPickerSettings(): ReactNode {
  const { t } = useI18n();
  const [format, setFormat] = useState<Format>('hex');

  useEffect(() => {
    void window.api.colorpicker.getFormat().then(setFormat);
  }, []);

  return (
    <div className="setting-row">
      <span>{t('colorpicker.format')}</span>
      <select
        className="select"
        value={format}
        onChange={(e) => {
          const value = e.target.value as Format;
          setFormat(value);
          void window.api.colorpicker.setFormat(value);
        }}
      >
        <option value="hex">HEX</option>
        <option value="rgb">RGB</option>
        <option value="hsl">HSL</option>
      </select>
    </div>
  );
}
