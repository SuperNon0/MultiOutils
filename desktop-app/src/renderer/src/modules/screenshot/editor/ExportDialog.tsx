import { useState, type ReactNode } from 'react';
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
    <div className="modal-veil" onClick={onClose}>
      <div className="modal export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{t('editor.export.title')}</h3>

        <div className="prop-block">
          <div className="prop-label">{t('editor.export.format')}</div>
          <div className="export-formats">
            {(['png', 'jpg', 'webp'] as const).map((f) => (
              <label key={f} className="export-format">
                <input
                  type="radio"
                  name="format"
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                <span>{f.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </div>

        {format !== 'png' && (
          <div className="prop-block">
            <div className="prop-label">
              {t('editor.export.quality')} — {quality}%
            </div>
            <input
              type="range"
              min={40}
              max={100}
              step={5}
              value={quality}
              className="prop-wide"
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>
        )}

        <div className="export-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onExport(format, quality)}
          >
            {t('editor.export.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
