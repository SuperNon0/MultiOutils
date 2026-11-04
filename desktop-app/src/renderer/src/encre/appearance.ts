/**
 * Apparence « encre » côté renderer : pose data-accent / data-theme sur <html>
 * (toutes les fenêtres : principale et satellites) d'après AppSettings.appearance,
 * et suit le thème du système en mode automatique.
 *
 * Même contrat que design-encre/encre.js (Apparence.appliquer) : en automatique,
 * data-theme suit quand même l'appareil, avec data-encre-auto.
 * Une copie est gardée dans localStorage (« encre-apparence », clé du kit) pour
 * que le petit script de index.html l'applique avant le premier affichage.
 */
import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../common/types';
import { DEFAULT_APPEARANCE } from '../../../common/types';

export type Appearance = AppSettings['appearance'];

const STORAGE_KEY = 'encre-apparence';
const lightQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: light)');

let current: Appearance = readCached();

function readCached(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Appearance>;
    return { ...DEFAULT_APPEARANCE, ...raw };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** Thème effectivement affiché (« auto » résolu d'après le système). */
export function resolvedTheme(appearance: Appearance = current): 'sombre' | 'clair' {
  if (appearance.theme === 'auto') return lightQuery().matches ? 'clair' : 'sombre';
  return appearance.theme;
}

export function applyAppearance(appearance: Appearance): void {
  current = { ...DEFAULT_APPEARANCE, ...appearance };
  const h = document.documentElement;
  h.dataset.accent = current.accent;
  h.dataset.theme = resolvedTheme(current) === 'clair' ? 'light' : 'dark';
  if (current.theme === 'auto') h.dataset.encreAuto = '';
  else delete h.dataset.encreAuto;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // stockage indisponible : le réglage reste appliqué pour cette fenêtre
  }
  window.dispatchEvent(new CustomEvent('encre:apparence', { detail: { ...current } }));
}

/** Lit l'apparence dans les réglages, l'applique et la suit (système + réglages). */
export function useAppearance(): void {
  useEffect(() => {
    let alive = true;
    void window.api.settings.get().then((s) => {
      if (alive && s.appearance) applyAppearance(s.appearance);
    });
    const off = window.api.settings.onChanged((s) => {
      if (s.appearance) applyAppearance(s.appearance);
    });
    const mq = lightQuery();
    const onSystem = (): void => {
      if (current.theme === 'auto') applyAppearance(current);
    };
    mq.addEventListener('change', onSystem);
    return () => {
      alive = false;
      off();
      mq.removeEventListener('change', onSystem);
    };
  }, []);
}

/** Valeur d'un jeton CSS (pour les canvas, qui ne lisent pas var(--…)). */
export function cssToken(name: string, fallback = ''): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface InkColors {
  accent: string;
  surface: string;
  bg: string;
  text: string;
  scrim: string;
}

/** Couleurs « encre » pour les canvas (Konva, 2D) ; suivent les changements d'apparence. */
export function useInkColors(): InkColors {
  const read = (): InkColors => ({
    accent: cssToken('--accent', '#a99bff'),
    surface: cssToken('--surface', '#0f1520'),
    bg: cssToken('--bg', '#0b0f17'),
    text: cssToken('--text', '#e7ebf3'),
    scrim: cssToken('--scrim', 'rgba(3, 5, 9, .62)')
  });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    // relu au cadre suivant, une fois les attributs de <html> posés
    const onChange = (): void => void requestAnimationFrame(() => setColors(read()));
    window.addEventListener('encre:apparence', onChange);
    onChange();
    return () => window.removeEventListener('encre:apparence', onChange);
  }, []);
  return colors;
}
