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

/** Nom de l'appli : marque + « Multi*Outils* » (wm du kit). */
export function Brand(): ReactNode {
  return (
    <span className="brand">
      <span className="marque" aria-hidden="true">
        M
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
