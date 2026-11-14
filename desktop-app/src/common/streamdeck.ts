import type { AppSettings } from './types';

/** Couleurs « encre » des accents : [thème sombre, thème clair]. */
export const ACCENT_HEX: Record<AppSettings['appearance']['accent'], [string, string]> = {
  lavande: ['#a99bff', '#5a48d0'],
  or: ['#e8c547', '#8a6400'],
  ambre: ['#f0a64a', '#995400'],
  corail: ['#ff7a59', '#b23c1d'],
  menthe: ['#4fd1b5', '#0b7562']
};

/** Ce que le plugin Stream Deck lit sur GET /theme pour dessiner ses touches. */
export interface StreamDeckTheme {
  theme: 'dark' | 'light';
  /** Accent de l'app pour ce thème. */
  accent: string;
  /** Fond des touches. */
  background: string;
  /** Teinte « en cours » (autoclic qui tourne). */
  live: string;
  /** Accents proposés dans le panneau de réglages d'une touche. */
  palette: Array<{ id: string; color: string }>;
}

export function streamDeckTheme(appearance: AppSettings['appearance'], systemDark: boolean): StreamDeckTheme {
  const dark = appearance.theme === 'auto' ? systemDark : appearance.theme === 'sombre';
  const i = dark ? 0 : 1;
  return {
    theme: dark ? 'dark' : 'light',
    accent: (ACCENT_HEX[appearance.accent] ?? ACCENT_HEX.lavande)[i],
    background: dark ? '#141b28' : '#f5f3ee',
    live: dark ? '#4fc0ad' : '#17725f',
    palette: Object.entries(ACCENT_HEX).map(([id, c]) => ({ id, color: c[i] }))
  };
}
