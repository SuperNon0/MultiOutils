import { useEffect, useState, type ReactNode } from 'react';
import type { AppSettings } from '../../../../common/types';
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
    <div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.clipboardAuto}
          onChange={(e) => update({ clipboardAuto: e.target.checked })}
        />
        <span>{t('settings.capture.clipboardAuto')}</span>
      </label>

      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.openEditorAfterCapture}
          onChange={(e) => update({ openEditorAfterCapture: e.target.checked })}
        />
        <span>{t('settings.capture.openEditor')}</span>
      </label>

      <label className="check-row">
        <input type="checkbox" checked={settings.includeCursor} disabled />
        <span>
          {t('settings.capture.includeCursor')}
          <div className="check-note">{t('settings.capture.includeCursorNote')}</div>
        </span>
      </label>

      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.captureAllScreens}
          onChange={(e) => update({ captureAllScreens: e.target.checked })}
        />
        <span>{t('settings.capture.captureAllScreens')}</span>
      </label>

      <div className="setting-row">
        <span>{t('settings.capture.format')}</span>
        <select
          className="select"
          value={settings.defaultFormat}
          onChange={(e) =>
            update({ defaultFormat: e.target.value as AppSettings['defaultFormat'] })
          }
        >
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
      </div>

      {settings.defaultFormat === 'jpg' && (
        <div className="setting-row">
          <span>
            {t('settings.capture.jpgQuality')} — {settings.jpgQuality}
          </span>
          <input
            type="range"
            min={40}
            max={100}
            step={5}
            value={settings.jpgQuality}
            onChange={(e) => update({ jpgQuality: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="setting-row">
        <span>{t('settings.capture.delayedSeconds')}</span>
        <select
          className="select"
          value={settings.delayedSeconds}
          onChange={(e) => update({ delayedSeconds: Number(e.target.value) })}
        >
          {[3, 5, 10, 15, 30].map((s) => (
            <option key={s} value={s}>
              {s} s
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
