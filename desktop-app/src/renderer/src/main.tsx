import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Language } from '../../common/types';
import './fonts.css';
import './theme.css';
import './app.css';
import { App } from './host/App';
import { I18nProvider } from './i18n';
import { QuickBar } from './windows/QuickBar';
import { RegionOverlay } from './windows/RegionOverlay';
import { WindowPicker } from './windows/WindowPicker';

/**
 * Une seule entrée renderer, plusieurs fenêtres : la fenêtre principale (App)
 * et les fenêtres satellites routées par hash (#/region/…, #/quickbar/…,
 * #/picker) — voir src/main/windows.ts (loadRenderer).
 */
function Root(): ReactNode {
  const match = window.location.hash.match(
    /^#\/(region|quickbar|picker)(?:\/(.+))?$/
  );
  const [lang, setLang] = useState<Language | null>(null);

  useEffect(() => {
    if (match) void window.api.settings.get().then((s) => setLang(s.language));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!match) return <App />;
  if (!lang) return null;

  const [, route, param] = match;
  return (
    <I18nProvider lang={lang}>
      {route === 'region' && param ? (
        <RegionOverlay displayId={param} />
      ) : route === 'quickbar' && param ? (
        <QuickBar captureId={param} />
      ) : route === 'picker' ? (
        <WindowPicker />
      ) : null}
    </I18nProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
