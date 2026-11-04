import { useEffect, useState, type ReactNode } from 'react';
import type { QuickbarAction } from '../../../common/types';
import { Icon } from '../host/Icon';
import { useI18n } from '../i18n';

/**
 * Barre d'actions rapides post-capture (docs/00 §1.1) :
 * Éditer · Copier · Enregistrer sous… · Envoyer au serveur · Traduire (IA) · Supprimer.
 */
export function QuickBar({ captureId }: { captureId: string }): ReactNode {
  const { t } = useI18n();
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => {
    document.body.classList.add('transparent-bg');
    void window.api.remote
      .getConfig()
      .then((c) => setRemoteReady(Boolean(c.url) && c.hasToken));
    return () => document.body.classList.remove('transparent-bg');
  }, []);

  const act = (action: QuickbarAction): void => {
    void window.api.quickbar.action(captureId, action);
  };

  return (
    <div
      className="quickbar verre-barre"
      onMouseEnter={() => window.api.quickbar.hover(true)}
      onMouseLeave={() => window.api.quickbar.hover(false)}
    >
      <button type="button" className="quickbar-btn" onClick={() => act('edit')}>
        <Icon name="edit" size={20} />
        <span>{t('quickbar.edit')}</span>
      </button>
      <button type="button" className="quickbar-btn" onClick={() => act('copy')}>
        <Icon name="copy" size={20} />
        <span>{t('quickbar.copy')}</span>
      </button>
      <button type="button" className="quickbar-btn" onClick={() => act('saveAs')}>
        <Icon name="save" size={20} />
        <span>{t('quickbar.saveAs')}</span>
      </button>
      <button
        type="button"
        className="quickbar-btn"
        disabled={!remoteReady}
        title={remoteReady ? t('quickbar.send') : t('quickbar.sendNotConfigured')}
        onClick={() => act('send')}
      >
        <Icon name="send" size={20} />
        <span>{t('quickbar.send')}</span>
      </button>
      <button
        type="button"
        className="quickbar-btn"
        title={t('text.ai.action')}
        onClick={() => act('translate')}
      >
        <Icon name="sparkle" size={20} />
        <span>{t('quickbar.translate')}</span>
      </button>
      <button
        type="button"
        className="quickbar-btn dn"
        onClick={() => act('delete')}
      >
        <Icon name="trash" size={20} />
        <span>{t('quickbar.delete')}</span>
      </button>
    </div>
  );
}
