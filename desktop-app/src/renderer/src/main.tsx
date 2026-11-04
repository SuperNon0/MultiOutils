import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Language } from '../../common/types';
// Design « encre » : polices et briques du kit (copies conformes de design-encre/),
// puis les surcharges propres à l'appli (app.css).
import './encre/polices.css';
import './encre/encre.css';
import './app.css';
import { useAppearance } from './encre/appearance';
import { installSprites } from './encre/sprite';
import { EncreLayer } from './encre/ui';
import { App } from './host/App';
import { I18nProvider } from './i18n';
import { Eyedropper } from './windows/Eyedropper';
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
    /^#\/(region|quickbar|picker|eyedropper)(?:\/(.+))?$/
  );
  const [lang, setLang] = useState<Language | null>(null);

  // Couleur d'accent + thème (Réglages → Apparence) dans TOUTES les fenêtres.
  useAppearance();

  useEffect(() => {
    if (match) void window.api.settings.get().then((s) => setLang(s.language));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!match) return <App />;
  if (!lang) return null;

  const [, route, param] = match;
  document.body.dataset.fenetre = route;
  return (
    <I18nProvider lang={lang}>
      {route === 'region' && param ? (
        <RegionOverlay displayId={param} />
      ) : route === 'eyedropper' && param ? (
        <Eyedropper displayId={param} />
      ) : route === 'quickbar' && param ? (
        <QuickBar captureId={param} />
      ) : route === 'picker' ? (
        <WindowPicker />
      ) : null}
      <EncreLayer />
    </I18nProvider>
  );
}

installSprites();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
