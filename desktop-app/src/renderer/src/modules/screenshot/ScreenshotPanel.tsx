import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Capture, CaptureType } from '@multioutils/shared';
import type { AppSettings, DisplayInfo } from '../../../../common/types';
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
  const [screenMenuOpen, setScreenMenuOpen] = useState(false);
  const [editing, setEditing] = useState<Capture | null>(null);
  const screenMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void window.api.settings.get().then(setSettings);
    void window.api.system.displays().then(setDisplays);
    return window.api.settings.onChanged(setSettings);
  }, []);

  useEffect(() => {
    if (!screenMenuOpen) return;
    const close = (event: MouseEvent): void => {
      if (!screenMenuRef.current?.contains(event.target as Node)) {
        setScreenMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [screenMenuOpen]);

  const take = (type: CaptureType, displayId?: number): void => {
    setScreenMenuOpen(false);
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
      <header className="panel-header">
        <h2>{t('screenshot.title')}</h2>
        <div className="capture-bar">
          <button type="button" className="btn btn-primary" onClick={() => take('fullscreen')}>
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
            <div className="screen-menu-wrap" ref={screenMenuRef}>
              <button
                type="button"
                className="btn"
                aria-expanded={screenMenuOpen}
                onClick={() => setScreenMenuOpen((open) => !open)}
              >
                <Icon name="screen" />
                {t('screenshot.actions.screen')}
                <Icon name="chevronDown" size={12} />
              </button>
              {screenMenuOpen && (
                <div className="screen-menu card">
                  {displays.map((display) => (
                    <button
                      key={display.id}
                      type="button"
                      className="screen-menu-item"
                      onClick={() => take('screen', display.id)}
                    >
                      {t('tray.capture.screenItem', {
                        n: display.index + 1,
                        w: display.width,
                        h: display.height
                      })}
                      {display.primary ? ' ★' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn" onClick={() => take('delayed')}>
            <Icon name="clock" />
            {t('screenshot.actions.delayed')}
            {settings ? ` (${settings.delayedSeconds}s)` : ''}
          </button>
        </div>
        {hint && <div className="capture-hint muted">{hint}</div>}
      </header>

      <Gallery onEdit={setEditing} />
    </div>
  );
}
