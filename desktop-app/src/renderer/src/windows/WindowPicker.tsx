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
      <header className="page-h picker-head">
        <h1 className="page-t">{t('picker.title')}</h1>
        <span className="kbd">{t('palette.esc')}</span>
        <button type="button" className="btn sm" onClick={() => window.api.picker.cancel()}>
          <Icon name="close" size={16} />
          {t('picker.cancel')}
        </button>
      </header>

      {items === null ? (
        <div className="picker-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="sk picker-sk" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="vide">
          <Icon name="window" />
          <span>{t('picker.empty')}</span>
        </div>
      ) : (
        <div className="picker-grid anim-in">
          {(items ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              className="picker-item"
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
