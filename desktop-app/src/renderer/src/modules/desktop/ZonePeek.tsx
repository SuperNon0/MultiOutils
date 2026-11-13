import { useEffect, type ReactNode } from 'react';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import './desktop.css';

/** Voile de l'aperçu (route #/zone-peek) : un clic ou Échap le referme. */
export function ZonePeek(): ReactNode {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.desktop.peekStop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="zp" onPointerDown={() => window.api.desktop.peekStop()} onContextMenu={(e) => e.preventDefault()}>
      <span className="zp-hint">
        <Icon name="grid" size={16} />
        {t('desktop.peek.hint')}
        <span className="kbd">{t('desktop.draw.esc')}</span>
      </span>
    </div>
  );
}
