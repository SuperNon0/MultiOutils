import { useEffect, useState, type ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { useI18n } from '../../i18n';
import { formatAccelerator } from './highlight';
import { LauncherSettingsView } from './LauncherSettings';

/** Vue de l'outil : présentation, bouton d'ouverture, astuces, puis les réglages. */
function LauncherPanel(): ReactNode {
  const { t, lang } = useI18n();
  const [shortcut, setShortcut] = useState('');
  useEffect(() => {
    void window.api.launcher.getSettings().then((i) => setShortcut(i.settings.shortcut));
    return window.api.launcher.onState((s) => setShortcut(s.settings.shortcut));
  }, []);

  const tips: Array<[string, string]> = [
    ['chrome', t('launcher.tip.programs')],
    ['f facture', t('launcher.tip.files')],
    ['C:\\Users\\', t('launcher.tip.path')],
    ['12*7,5', t('launcher.tip.calc')],
    ['g météo', t('launcher.tip.web')],
    ['> ipconfig', t('launcher.tip.shell')],
    ['kill notepad', t('launcher.tip.kill')],
    ['wifi', t('launcher.tip.settings')]
  ];

  return (
    <div className="lzp-panel">
      <div className="lzp-hero">
        <div className="lzp-tx">
          <h2>{t('launcher.title')}</h2>
          <p>{t('launcher.panel.blurb')}</p>
        </div>
        <div className="lzp-hero-act">
          <button type="button" className="lzp-btn lzp-pri" onClick={() => void window.api.launcher.open()}>
            {t('launcher.panel.open')}
          </button>
          {shortcut && <span className="lzp-kbd">{formatAccelerator(shortcut, lang)}</span>}
        </div>
      </div>
      <div className="lzp-tips">
        {tips.map(([code, text]) => (
          <div className="lzp-tip" key={code}>
            <code>{code}</code> — {text}
          </div>
        ))}
      </div>
      <LauncherSettingsView />
    </div>
  );
}

/** Module « Lanceur » (recréation des fonctions de base de Flow Launcher). */
export const launcherModule: ToolModule = {
  id: 'launcher',
  name: 'launcher.title',
  icon: 'search',
  order: 6,

  activate(): void {
    // la fenêtre du lanceur et son moteur vivent côté main
  },

  renderPanel(): ReactNode {
    return <LauncherPanel />;
  },

  settingsPanel(): ReactNode {
    return <LauncherSettingsView />;
  }
};
