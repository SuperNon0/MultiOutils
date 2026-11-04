import type { ReactNode } from 'react';

/**
 * Icônes au trait du design « encre » : sprite du kit (encre/icones.svg) +
 * quelques icônes propres aux outils (encre/icones-app.svg), insérés une fois
 * dans la page (encre/sprite.ts).
 *
 * Les anciens noms (jeu interne d'avant « encre ») restent acceptés : ils sont
 * traduits vers les symboles du sprite.
 */
const ALIASES: Record<string, string> = {
  screenshot: 'camera',
  settings: 'gear',
  fullscreen: 'fullscreen',
  region: 'region',
  window: 'window',
  screen: 'monitor',
  clock: 'clock',
  trash: 'trash',
  copy: 'copy',
  save: 'download',
  edit: 'edit',
  send: 'send',
  reveal: 'folderopen',
  restore: 'undo',
  close: 'x',
  check: 'check',
  star: 'star',
  starFilled: 'staron',
  chevronDown: 'chevd',
  chevronRight: 'chev',
  image: 'image',
  keyboard: 'keyboard',
  cursor: 'cursor',
  mouse: 'mouse',
  rectTool: 'rect',
  ellipseTool: 'ellipse',
  triangleTool: 'triangle',
  lineTool: 'line',
  arrowTool: 'arrowtool',
  textTool: 'type',
  penTool: 'pen',
  highlightTool: 'highlight',
  blurTool: 'blur',
  stepsTool: 'steps',
  cropTool: 'crop',
  eraserTool: 'eraser',
  undo: 'undo',
  redo: 'redo',
  zoomIn: 'zoomin',
  zoomOut: 'zoomout',
  back: 'chevl',
  next: 'chev',
  eyedropper: 'eyedropper',
  textScan: 'textscan',
  folder: 'folder',
  clipboard: 'clipboard',
  file: 'file',
  phone: 'phone',
  pin: 'pin',
  expand: 'expand',
  plus: 'plus',
  more: 'dots',
  tag: 'tag',
  grid: 'grid',
  list: 'rows',
  export: 'share',
  sync: 'refresh',
  rename: 'edit'
};

/** Nom de symbole du sprite (sans « i- ») pour un nom d'icône de l'appli. */
export function iconId(name: string): string {
  return ALIASES[name] ?? name;
}

export function Icon({
  name,
  size = 18,
  className
}: {
  name: string;
  size?: number;
  className?: string;
}): ReactNode {
  return (
    <svg
      className={`i${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <use href={`#i-${iconId(name)}`} />
    </svg>
  );
}
