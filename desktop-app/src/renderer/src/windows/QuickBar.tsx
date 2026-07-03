import { useEffect, type ReactNode } from 'react';
import type { QuickbarAction } from '../../../common/types';
import { Icon } from '../host/Icon';
import { useI18n } from '../i18n';

/**
 * Barre d'actions rapides post-capture (docs/00 §1.1) :
 * Éditer · Copier · Enregistrer sous… · Envoyer au serveur · Supprimer.
 */
export function QuickBar({ captureId }: { captureId: string }): ReactNode {
  const { t } = useI18n();

  useEffect(() => {
    document.body.classList.add('transparent-bg');
    return () => document.body.classList.remove('transparent-bg');
  }, []);

  const act = (action: QuickbarAction): void => {
    void window.api.quickbar.action(captureId, action);
  };

  return (
    <div
      className="quickbar"
      onMouseEnter={() => window.api.quickbar.hover(true)}
      onMouseLeave={() => window.api.quickbar.hover(false)}
    >
      <button type="button" className="quickbar-btn" onClick={() => act('edit')}>
        <Icon name="edit" />
        <span>{t('quickbar.edit')}</span>
      </button>
      <button type="button" className="quickbar-btn" onClick={() => act('copy')}>
        <Icon name="copy" />
        <span>{t('quickbar.copy')}</span>
      </button>
      <button type="button" className="quickbar-btn" onClick={() => act('saveAs')}>
        <Icon name="save" />
        <span>{t('quickbar.saveAs')}</span>
      </button>
      <button
        type="button"
        className="quickbar-btn"
        disabled
        title={t('quickbar.sendSoon')}
      >
        <Icon name="send" />
        <span>{t('quickbar.send')}</span>
      </button>
      <button
        type="button"
        className="quickbar-btn quickbar-danger"
        onClick={() => act('delete')}
      >
        <Icon name="trash" />
        <span>{t('quickbar.delete')}</span>
      </button>
    </div>
  );
}
