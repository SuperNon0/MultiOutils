import { useEffect, useState, type ReactNode } from 'react';
import type { Capture, CaptureType } from '@multioutils/shared';
import type { AppSettings, DisplayInfo } from '../../../../common/types';
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { displayAccelerator } from '../../lib/format';
import { EditorView } from './editor/EditorView';
import { Gallery } from './Gallery';

/** Panneau principal de l'outil : barre de capture + bibliothèque, ou
 * l'éditeur quand une capture est en cours d'édition (docs/00 §2). */
export function ScreenshotPanel(): ReactNode {
  const { t, lang } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [editing, setEditing] = useState<Capture | null>(null);

  useEffect(() => {
    void window.api.settings.get().then(setSettings);
    void window.api.system.displays().then(setDisplays);
    return window.api.settings.onChanged(setSettings);
  }, []);

  const take = (type: CaptureType, displayId?: number): void => {
    void window.api.capture.take(type, displayId != null ? { displayId } : undefined);
  };

  if (editing) {
    return <EditorView capture={editing} onClose={() => setEditing(null)} />;
  }

  const hint =
    settings &&
    t('screenshot.actions.hint', {
      fullscreen: displayAccelerator(settings.shortcuts.fullscreen, lang),
      region: displayAccelerator(settings.shortcuts.region, lang),
      window: displayAccelerator(settings.shortcuts.window, lang),
      delayed: displayAccelerator(settings.shortcuts.delayed, lang)
    });

  return (
    <div className="panel">
      <div className="page-h">
        <h1 className="page-t">{t('screenshot.title')}</h1>
        <div className="ligne capture-bar">
          <button type="button" className="btn pri" onClick={() => take('fullscreen')}>
            <Icon name="fullscreen" />
            {t('screenshot.actions.fullscreen')}
          </button>
          <button type="button" className="btn" onClick={() => take('region')}>
            <Icon name="region" />
            {t('screenshot.actions.region')}
          </button>
          <button type="button" className="btn" onClick={() => take('window')}>
            <Icon name="window" />
            {t('screenshot.actions.window')}
          </button>
          {displays.length > 1 && (
            <button
              type="button"
              className="btn"
              aria-haspopup="menu"
              onClick={(e) =>
                ui.menu(
                  e.currentTarget,
                  displays.map((display) => ({
                    icone: display.primary ? 'staron' : 'monitor',
                    texte: t('tray.capture.screenItem', {
                      n: display.index + 1,
                      w: display.width,
                      h: display.height
                    }),
                    action: () => take('screen', display.id)
                  })),
                  { titre: t('tray.capture.screenMenu') }
                )
              }
            >
              <Icon name="screen" />
              {t('screenshot.actions.screen')}
              <Icon name="chevronDown" size={16} />
            </button>
          )}
          <button type="button" className="btn" onClick={() => take('delayed')}>
            <Icon name="clock" />
            {t('screenshot.actions.delayed')}
            {settings ? <span className="mono muted">{settings.delayedSeconds} s</span> : null}
          </button>
        </div>
      </div>
      {hint && (
        <p className="intro-p capture-hint">
          <Icon name="keyboard" size={16} className="muted" />
          {hint}
        </p>
      )}

      <Gallery onEdit={setEditing} />
    </div>
  );
}
