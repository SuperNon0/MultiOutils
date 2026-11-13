import { lazy, StrictMode, Suspense, useEffect, useState, type ReactNode } from 'react';
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

// Home Assistant (pop-ups, barre de la mini fenêtre) : chargés à part aussi.
const HaToasts = lazy(() => import('./modules/launcher/ha/HaToasts').then((m) => ({ default: m.HaToasts })));
const HaDashboardBar = lazy(() =>
  import('./modules/launcher/ha/HaDashboardBar').then((m) => ({ default: m.HaDashboardBar }))
);

// Lanceur : chargé à part (son code et launcher.css ne pèsent pas sur la fenêtre principale).
const Launcher = lazy(() => import('./windows/Launcher'));

// Module Bureau : fenêtres des zones et calque de dessin, chargés à part.
const ZoneWindow = lazy(() => import('./modules/desktop/ZoneWindow').then((m) => ({ default: m.ZoneWindow })));
const ZoneDraw = lazy(() => import('./modules/desktop/ZoneDraw').then((m) => ({ default: m.ZoneDraw })));
const ZonePeek = lazy(() => import('./modules/desktop/ZonePeek').then((m) => ({ default: m.ZonePeek })));

/**
 * Une seule entrée renderer, plusieurs fenêtres : la fenêtre principale (App)
 * et les fenêtres satellites routées par hash (#/region/…, #/quickbar/…,
 * #/picker) — voir src/main/windows.ts (loadRenderer).
 */
function Root(): ReactNode {
  if (window.location.hash.startsWith('#/launcher')) {
    document.body.dataset.fenetre = 'launcher'; // fond transparent dès le premier rendu
    return (
      <Suspense fallback={null}>
        <Launcher />
      </Suspense>
    );
  }
  return <SatelliteOrApp />;
}

function SatelliteOrApp(): ReactNode {
  const match = window.location.hash.match(
    /^#\/(region|quickbar|picker|eyedropper|ha-toasts|ha-dashboard|zone|zone-draw|zone-peek)(?:\/(.+))?$/
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
      ) : route === 'ha-toasts' ? (
        <Suspense fallback={null}>
          <HaToasts />
        </Suspense>
      ) : route === 'zone' ? (
        <Suspense fallback={null}>
          <ZoneWindow />
        </Suspense>
      ) : route === 'zone-draw' && param ? (
        <Suspense fallback={null}>
          <ZoneDraw displayId={param} />
        </Suspense>
      ) : route === 'zone-peek' ? (
        <Suspense fallback={null}>
          <ZonePeek />
        </Suspense>
      ) : route === 'ha-dashboard' ? (
        <Suspense fallback={null}>
          <HaDashboardBar />
        </Suspense>
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
