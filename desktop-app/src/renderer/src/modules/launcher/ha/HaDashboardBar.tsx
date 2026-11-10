/**
 * Barre du haut de la mini fenêtre « tableau de bord Home Assistant »
 * (#/ha-dashboard). La page de HA elle-même est une vue web posée dessous par
 * le main (homeassistant/dashboard.ts).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../../../host/Icon';
import { useI18n } from '../../../i18n';
import './ha.css';

export function HaDashboardBar(): ReactNode {
  const { t } = useI18n();
  const [title, setTitle] = useState('Home Assistant');
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    document.body.dataset.fenetre = 'ha-dashboard';
    const a = window.api.ha.dash.onTitle((v) => setTitle(v || 'Home Assistant'));
    const b = window.api.ha.dash.onError(setError);
    return () => {
      a();
      b();
    };
  }, []);
  const d = window.api.ha.dash;
  return (
    <>
      <div className="had-barre">
        <span className="had-ic">
          <Icon name="home" size={16} />
        </span>
        <span className="had-titre" title={title}>
          {title}
        </span>
        <div className="had-btns">
          <button type="button" className="ib" title={t('ha.dash.back')} onClick={() => d.back()}>
            <Icon name="chevl" size={16} />
          </button>
          <button type="button" className="ib" title={t('ha.dash.home')} onClick={() => d.home()}>
            <Icon name="home" size={16} />
          </button>
          <button type="button" className="ib" title={t('ha.dash.reload')} onClick={() => d.reload()}>
            <Icon name="refresh" size={16} />
          </button>
          <button type="button" className="ib" title={t('ha.dash.external')} onClick={() => d.external()}>
            <Icon name="external" size={16} />
          </button>
          <button
            type="button"
            className={`ib${pinned ? ' on' : ''}`}
            title={t(pinned ? 'ha.dash.unpin' : 'ha.dash.pin')}
            aria-pressed={pinned}
            onClick={() => void d.pin().then(setPinned)}
          >
            <Icon name="pin" size={16} />
          </button>
          <button type="button" className="ib" title={t('common.close')} onClick={() => d.hide()}>
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
      {error && (
        <div className="had-erreur">
          <Icon name="alert" size={18} />
          <span>{error === 'not-configured' ? t('launcher.ha.notConfiguredSub') : t('ha.dash.error', { msg: error })}</span>
          <button type="button" className="btn sm" onClick={() => d.reload()}>
            {t('ha.dash.retry')}
          </button>
        </div>
      )}
    </>
  );
}
