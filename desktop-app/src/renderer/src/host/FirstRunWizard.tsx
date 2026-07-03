import { useState, type ReactNode } from 'react';
import type { AppSettings, Language } from '../../../common/types';
import { useI18n } from '../i18n';
import { displayAccelerator } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  settings: AppSettings;
  onDone(patch: Partial<AppSettings>): Promise<AppSettings>;
}

const STEPS = ['language', 'folder', 'shortcuts', 'autostart'] as const;

/** Assistant de première utilisation (docs/02 §2.3). */
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
    <div className="wizard-veil">
      <div className="wizard card">
        <h1>
          {t('wizard.title').replace('MultiOutils', '')}
          Multi<span className="accent">Outils</span>
        </h1>
        <p className="muted">{t('wizard.subtitle')}</p>

        <div className="wizard-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`} />
          ))}
        </div>

        <div className="wizard-step">
          <h3>{t(`wizard.step.${current}`)}</h3>

          {current === 'language' && (
            <div>
              <div className="setting-row">
                <span>{t('settings.general.language')}</span>
                <select
                  className="select"
                  value={settings.language}
                  onChange={(e) =>
                    void onDone({ language: e.target.value as Language })
                  }
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="setting-row">
                <span>
                  {t('settings.general.theme')}
                  <div className="check-note">{t('settings.general.themeNote')}</div>
                </span>
                <select className="select" value="dark" disabled>
                  <option value="dark">{t('settings.general.theme.dark')}</option>
                </select>
              </div>
            </div>
          )}

          {current === 'folder' && (
            <div>
              <p className="section-note">{t('wizard.folder.help')}</p>
              <div className="field-row">
                <code className="storage-path" title={storageDir}>
                  {storageDir}
                </code>
                <button type="button" className="btn" onClick={() => void chooseFolder()}>
                  {t('settings.storage.change')}
                </button>
              </div>
            </div>
          )}

          {current === 'shortcuts' && (
            <div>
              <p className="section-note">{t('wizard.shortcuts.help')}</p>
              {(
                ['fullscreen', 'region', 'window', 'delayed'] as const
              ).map((id) => (
                <div key={id} className="setting-row">
                  <span>{t(`settings.shortcuts.${id}`)}</span>
                  <span className="kbd">
                    {displayAccelerator(settings.shortcuts[id], lang)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {current === 'autostart' && (
            <div>
              <p className="section-note">{t('wizard.autostart.help')}</p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => setAutostart(e.target.checked)}
                />
                <span>{t('settings.general.autostart')}</span>
              </label>
              <label className="check-row check-row-indent">
                <input
                  type="checkbox"
                  checked={startMinimized}
                  disabled={!autostart}
                  onChange={(e) => setStartMinimized(e.target.checked)}
                />
                <span>{t('settings.general.startMinimized')}</span>
              </label>
              <p className="muted wizard-tray-note">
                <Icon name="check" /> {t('wizard.trayNote')}
              </p>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          <button
            type="button"
            className="btn"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            {t('wizard.back')}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((s) => s + 1)}
            >
              {t('wizard.next')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={finishing}
              onClick={() => void finish()}
            >
              {t('wizard.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
