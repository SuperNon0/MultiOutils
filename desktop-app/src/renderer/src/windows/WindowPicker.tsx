import { useEffect, useState, type ReactNode } from 'react';
import type { PickerItem } from '../../../common/types';
import { Icon } from '../host/Icon';
import { useI18n } from '../i18n';

/**
 * Sélecteur de fenêtre à capturer (docs/00 §1.1 — variante « liste de
 * vignettes », voir docs/06-decisions-techniques.md). Échap annule.
 */
export function WindowPicker(): ReactNode {
  const { t } = useI18n();
  const [items, setItems] = useState<PickerItem[] | null>(null);

  useEffect(() => {
    void window.api.picker.list().then(setItems);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.api.picker.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="picker-root">
      <header className="picker-head">
        <h2>{t('picker.title')}</h2>
        <button type="button" className="btn" onClick={() => window.api.picker.cancel()}>
          <Icon name="close" size={13} />
          {t('picker.cancel')}
        </button>
      </header>

      {items && items.length === 0 ? (
        <div className="gallery-empty muted">{t('picker.empty')}</div>
      ) : (
        <div className="picker-grid">
          {(items ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              className="picker-item card"
              onClick={() => window.api.picker.pick(item.id)}
            >
              <div className="picker-thumb">
                <img src={item.thumbDataUrl} alt="" draggable={false} />
              </div>
              <div className="picker-name">
                {item.iconDataUrl && <img className="picker-icon" src={item.iconDataUrl} alt="" />}
                <span title={item.name}>{item.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
