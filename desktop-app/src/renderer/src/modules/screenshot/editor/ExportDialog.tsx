import { useState, type ReactNode } from 'react';
import { Feuille } from '../../../host/Feuille';
import { Icon } from '../../../host/Icon';
import { useI18n } from '../../../i18n';

export type ExportFormat = 'png' | 'jpg' | 'webp';

/** Dialogue « Exporter » : PNG / JPG / WebP + qualité (docs/00 §2.3). */
export function ExportDialog({
  onExport,
  onClose
}: {
  onExport(format: ExportFormat, quality: number): void;
  onClose(): void;
}): ReactNode {
  const { t } = useI18n();
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(90);

  return (
    <Feuille titre={t('editor.export.title')} onClose={onClose}>
      <div className="form">
        <div>
          <div className="lbl">{t('editor.export.format')}</div>
          <div className="seg" role="group" aria-label={t('editor.export.format')}>
            {(['png', 'jpg', 'webp'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={format === f ? 'on' : ''}
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {format !== 'png' && (
          <div>
            <div className="lbl">
              {t('editor.export.quality')} <span className="mono muted">{quality} %</span>
            </div>
            <input
              type="range"
              min={40}
              max={100}
              step={5}
              value={quality}
              className="curseur prop-wide"
              aria-label={t('editor.export.quality')}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>
        )}

        <div className="conf">
          <div className="bts">
            <button type="button" className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn pri" autoFocus onClick={() => onExport(format, quality)}>
              <Icon name="export" />
              {t('editor.export.confirm')}
            </button>
          </div>
        </div>
      </div>
    </Feuille>
  );
}
