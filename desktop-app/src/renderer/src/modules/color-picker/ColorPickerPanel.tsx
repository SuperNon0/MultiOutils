import { useEffect, useState, type ReactNode } from 'react';
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
              >
                <span
                  className="cp-color"
                  style={{ background: toHex(entry.r, entry.g, entry.b) }}
                />
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
