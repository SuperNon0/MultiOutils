import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../host/Icon';
import type { ToolModule } from '../../host/types';
import { useI18n } from '../../i18n';
import { displayAccelerator } from '../../lib/format';
import { LauncherSettingsView } from './LauncherSettings';

/** Vue de l'outil : présentation, bouton d'ouverture, exemples, puis les réglages. */
function LauncherPanel(): ReactNode {
  const { t, lang } = useI18n();
  const [shortcut, setShortcut] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    void window.api.launcher.getSettings().then((i) => setShortcut(i.settings.shortcut));
    const off = window.api.launcher.onState((s) => setShortcut(s.settings.shortcut));
    return () => {
      off();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const flash = (): void => {
    setSaved(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 2200);
  };

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
    <div className="panel">
      <div className="page-h">
        <h1 className="page-t">{t('launcher.title')}</h1>
        <div className="ligne capture-bar">
          {shortcut && <span className="kbd lzr-kbd">{displayAccelerator(shortcut, lang)}</span>}
          <button type="button" className="btn pri" onClick={() => void window.api.launcher.open()}>
            <Icon name="search" />
            {t('launcher.panel.open')}
          </button>
        </div>
      </div>
      <p className="intro-p">{t('launcher.panel.blurb')}</p>

      <div className="lzr-exemples">
        {tips.map(([code, text]) => (
          <div className="carte lzr-ex" key={code}>
            <code className="mono">{code}</code>
            <span className="soft petit">{text}</span>
          </div>
        ))}
      </div>

      <section className="carte reg-panneau lzr-panneau">
        <div className="reg-tete">
          <h2>
            <Icon name="gear" size={22} className="acc" />
            {t('launcher.panel.settings')}
          </h2>
          <span className={`statut ok enregistre${saved ? ' vu' : ''}`} aria-live="polite">
            {saved ? (
              <>
                <Icon name="check" size={16} />
                {t('reglages.saved')}
              </>
            ) : null}
          </span>
        </div>
        <LauncherSettingsView onSaved={flash} />
      </section>
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
