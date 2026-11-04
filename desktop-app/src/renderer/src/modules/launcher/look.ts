/**
 * Apparence de la barre du lanceur → variables CSS (lues par launcher.css).
 * Partagé par la fenêtre du lanceur et l'aperçu des réglages : aucune
 * couleur en dur, l'accent propre au lanceur reprend les jetons du kit
 * (--sw-<couleur>, déjà adaptés au thème clair).
 */
import type { CSSProperties } from 'react';
import { DEFAULT_LAUNCHER_LOOK, type LauncherLook } from '../../../../common/launcher';

export function lookVars(look: LauncherLook = DEFAULT_LAUNCHER_LOOK): CSSProperties {
  const vars: Record<string, string> = {
    '--lz-w': `${look.width}px`,
    '--lz-scale': String(look.textSize / 100),
    '--lz-rows': String(look.visibleRows),
    '--lz-verre': `${look.opacity}%`,
    '--lz-r': `${look.radius}px`
  };
  if (look.accent !== 'app') {
    vars['--accent'] = `var(--sw-${look.accent})`;
    vars['--acc-dim'] = 'color-mix(in srgb, var(--accent) 14%, transparent)';
    vars['--acc-line'] = 'color-mix(in srgb, var(--accent) 45%, transparent)';
  }
  return vars as CSSProperties;
}

/** Classes de la palette selon les options d'affichage. */
export function lookClass(look: LauncherLook = DEFAULT_LAUNCHER_LOOK): string {
  return `${look.showSubtitles ? '' : ' lz-sans-sous'}${look.showHotkeys ? '' : ' lz-sans-alt'}`;
}
