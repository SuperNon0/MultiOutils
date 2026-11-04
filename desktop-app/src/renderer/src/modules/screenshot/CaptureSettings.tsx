import { useEffect, useState, type ReactNode } from 'react';
import type { AppSettings } from '../../../../common/types';
import { RegLigne, RegSec, RegSwitch } from '../../host/reglages';
import { useI18n } from '../../i18n';

/** Section « Capture » des Paramètres, contribuée par le module (docs/00 §1.3). */
export function CaptureSettings(): ReactNode {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    void window.api.settings.get().then(setSettings);
    return window.api.settings.onChanged(setSettings);
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<AppSettings>): void => {
    void window.api.settings.set(patch).then(setSettings);
  };

  return (
    <>
      <RegSec>
        <RegSwitch
          titre={t('settings.capture.clipboardAuto')}
          checked={settings.clipboardAuto}
          onChange={(v) => update({ clipboardAuto: v })}
        />
        <RegSwitch
          titre={t('settings.capture.openEditor')}
          checked={settings.openEditorAfterCapture}
          onChange={(v) => update({ openEditorAfterCapture: v })}
        />
        <RegSwitch
          titre={t('settings.capture.includeCursor')}
          sous={t('settings.capture.includeCursorNote')}
          checked={settings.includeCursor}
          disabled
          onChange={() => undefined}
        />
        <RegSwitch
          titre={t('settings.capture.captureAllScreens')}
          checked={settings.captureAllScreens}
          onChange={(v) => update({ captureAllScreens: v })}
        />
      </RegSec>

      <RegSec>
        <RegLigne titre={t('settings.capture.format')}>
          <div className="seg reg-seg" role="group" aria-label={t('settings.capture.format')}>
            {(['png', 'jpg'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={settings.defaultFormat === f ? 'on' : ''}
                aria-pressed={settings.defaultFormat === f}
                onClick={() => update({ defaultFormat: f })}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </RegLigne>

        {settings.defaultFormat === 'jpg' && (
          <RegLigne titre={t('settings.capture.jpgQuality')} sous={`${settings.jpgQuality} %`}>
            <input
              type="range"
              className="curseur"
              min={40}
              max={100}
              step={5}
              value={settings.jpgQuality}
              aria-label={t('settings.capture.jpgQuality')}
              onChange={(e) => update({ jpgQuality: Number(e.target.value) })}
            />
          </RegLigne>
        )}

        <RegLigne titre={t('settings.capture.delayedSeconds')}>
          <select
            className="select reg-select"
            value={settings.delayedSeconds}
            onChange={(e) => update({ delayedSeconds: Number(e.target.value) })}
          >
            {[3, 5, 10, 15, 30].map((s) => (
              <option key={s} value={s}>
                {s} s
              </option>
            ))}
          </select>
        </RegLigne>
      </RegSec>
    </>
  );
}
