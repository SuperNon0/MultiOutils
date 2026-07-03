import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { ToolModule } from './types';
import { Icon } from './Icon';

interface Props {
  modules: ToolModule[];
  active: string;
  version: string;
  onSelect(id: string): void;
}

export function Sidebar({ modules, active, version, onSelect }: Props): ReactNode {
  const { t } = useI18n();
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Multi<span className="accent">Outils</span>
      </div>

      <div className="sidebar-label">{t('sidebar.tools')}</div>
      <nav className="sidebar-nav">
        {modules.map((module) => (
          <button
            key={module.id}
            type="button"
            className={`nav-item${active === module.id ? ' active' : ''}`}
            onClick={() => onSelect(module.id)}
          >
            <Icon name={module.icon} />
            <span>{t(module.name)}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-item${active === 'settings' ? ' active' : ''}`}
          onClick={() => onSelect('settings')}
        >
          <Icon name="settings" />
          <span>{t('sidebar.settings')}</span>
        </button>
        <div className="sidebar-version muted">v{version}</div>
      </div>
    </aside>
  );
}
