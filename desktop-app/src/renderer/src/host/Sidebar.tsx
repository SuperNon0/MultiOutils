import type { ReactNode } from 'react';
import { ui } from '../encre/ui';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import type { ToolModule } from './types';

interface Props {
  modules: ToolModule[];
  active: string;
  version: string;
  onSelect(id: string): void;
}

/**
 * Symbole de l'appli (le même que resources/icon.svg) : quatre tuiles, trois
 * au trait et une pleine. Dessiné en currentColor sur le fond de la marque.
 */
export function Symbole(): ReactNode {
  return (
    <svg className="marque-sym" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
        <rect x="4.15" y="4.15" width="6.2" height="6.2" rx="1.5" />
        <rect x="4.15" y="13.65" width="6.2" height="6.2" rx="1.5" />
        <rect x="13.65" y="13.65" width="6.2" height="6.2" rx="1.5" />
      </g>
      <rect x="12.7" y="3.2" width="8.1" height="8.1" rx="2.3" fill="currentColor" />
    </svg>
  );
}

/** Nom de l'appli : marque + « Multi*Outils* » (wm du kit). */
export function Brand(): ReactNode {
  return (
    <span className="brand">
      <span className="marque" aria-hidden="true">
        <Symbole />
      </span>
      <span className="wm">
        Multi<b>Outils</b>
      </span>
    </span>
  );
}

/** Menu de gauche « encre » (ordinateur) : outils, recherche, réglages. */
export function Sidebar({ modules, active, version, onSelect }: Props): ReactNode {
  const { t } = useI18n();
  return (
    <aside className="side" aria-label={t('sidebar.tools')}>
      <div className="ligne">
        <Brand />
        <span className="ver" title={t('settings.about.version', { v: version })}>
          {version}
        </span>
      </div>

      <button type="button" className="side-search" onClick={() => ui.palette.open()}>
        <Icon name="search" />
        {t('palette.button')}
        <span className="kbd">Ctrl K</span>
      </button>

      <div className="side-lbl">{t('sidebar.tools')}</div>
      <nav className="side-listes" aria-label={t('sidebar.tools')}>
        {modules.map((module) => (
          <button
            key={module.id}
            type="button"
            className={`side-it${active === module.id ? ' on' : ''}`}
            aria-current={active === module.id ? 'page' : undefined}
            onClick={() => onSelect(module.id)}
          >
            <Icon name={module.icon} size={20} />
            <span className="nom">{t(module.name)}</span>
          </button>
        ))}
      </nav>

      <div className="side-foot">
        <button
          type="button"
          className={`side-it${active === 'settings' ? ' on' : ''}`}
          aria-current={active === 'settings' ? 'page' : undefined}
          onClick={() => onSelect('settings')}
        >
          <Icon name="gear" size={20} />
          <span className="nom">{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  );
}
