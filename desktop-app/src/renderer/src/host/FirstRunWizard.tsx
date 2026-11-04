import { useState, type ReactNode } from 'react';
import type { AppSettings, Language } from '../../../common/types';
import { useI18n } from '../i18n';
import { displayAccelerator } from '../lib/format';
import { Icon } from './Icon';
import { RegLigne, RegSec, RegSwitch } from './reglages';
import { AppearanceSection } from './SettingsView';
import { Brand } from './Sidebar';

interface Props {
  settings: AppSettings;
  onDone(patch: Partial<AppSettings>): Promise<AppSettings>;
}

const STEPS = ['language', 'folder', 'shortcuts', 'autostart'] as const;
const STEP_ICONS: Record<(typeof STEPS)[number], string> = {
  language: 'palette',
  folder: 'folder',
  shortcuts: 'keyboard',
  autostart: 'zap'
};

/** Assistant de première utilisation (docs/02 §2.3), en carte « encre ». */
export function FirstRunWizard({ settings, onDone }: Props): ReactNode {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const [storageDir, setStorageDir] = useState(settings.storageDir);
  const [autostart, setAutostart] = useState(true);
  const [startMinimized, setStartMinimized] = useState(true);
  const [finishing, setFinishing] = useState(false);

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.api.settings.chooseFolder();
    if (dir) setStorageDir(dir);
  };

  const finish = async (): Promise<void> => {
    setFinishing(true);
    await onDone({
      storageDir,
      autostart,
      startMinimized,
      firstRunDone: true
    });
  };

  const current = STEPS[step];

  return (
    <div className="login-page assistant">
      <div className="login-card onboarding-card">
        <div className="login-logo">
          <Brand />
        </div>
        <span className="badge">
          {step + 1} / {STEPS.length}
        </span>
        <h1 className="h-acces">{t('wizard.title')}</h1>
        <p className="onb-intro">{t('wizard.subtitle')}</p>

        <div className="pg acc" aria-hidden="true">
          <i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className="onb-steps" key={current}>
          <h2 className="sub-title">
            <Icon name={STEP_ICONS[current]} size={22} className="acc" />
            {t(`wizard.step.${current}`)}
          </h2>

          {current === 'language' && (
            <>
              <RegSec>
                <RegLigne titre={t('settings.general.language')}>
                  <select
                    className="select reg-select"
                    value={settings.language}
                    onChange={(e) => void onDone({ language: e.target.value as Language })}
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </RegLigne>
              </RegSec>
              <AppearanceSection settings={settings} update={onDone} />
            </>
          )}

          {current === 'folder' && (
            <>
              <p className="soft">{t('wizard.folder.help')}</p>
              <div className="copie">
                <code title={storageDir}>{storageDir}</code>
                <button type="button" className="btn sm" onClick={() => void chooseFolder()}>
                  <Icon name="folder" />
                  {t('settings.storage.change')}
                </button>
              </div>
            </>
          )}

          {current === 'shortcuts' && (
            <>
              <p className="soft">{t('wizard.shortcuts.help')}</p>
              <RegSec>
                {(['fullscreen', 'region', 'window', 'delayed'] as const).map((id) => (
                  <RegLigne key={id} titre={t(`settings.shortcuts.${id}`)}>
                    <span className="kbd">{displayAccelerator(settings.shortcuts[id], lang)}</span>
                  </RegLigne>
                ))}
              </RegSec>
            </>
          )}

          {current === 'autostart' && (
            <>
              <p className="soft">{t('wizard.autostart.help')}</p>
              <RegSec>
                <RegSwitch
                  titre={t('settings.general.autostart')}
                  checked={autostart}
                  onChange={setAutostart}
                />
                <RegSwitch
                  titre={t('settings.general.startMinimized')}
                  checked={startMinimized}
                  disabled={!autostart}
                  onChange={setStartMinimized}
                />
              </RegSec>
              <p className="statut ok">
                <Icon name="check" size={16} /> {t('wizard.trayNote')}
              </p>
            </>
          )}
        </div>

        <div className="conf">
          <div className="bts">
            <button
              type="button"
              className="btn"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <Icon name="chevl" />
              {t('wizard.back')}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn pri" onClick={() => setStep((s) => s + 1)}>
                {t('wizard.next')}
                <Icon name="chev" />
              </button>
            ) : (
              <button
                type="button"
                className={`btn pri${finishing ? ' occupe' : ''}`}
                disabled={finishing}
                onClick={() => void finish()}
              >
                <Icon name="check" />
                {t('wizard.done')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
