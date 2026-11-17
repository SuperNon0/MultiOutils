import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { IconsPanel } from './IconsPanel';

/** Module « Icônes » : atelier d'icônes pour le Stream Deck (symboles, couleurs, thèmes). */
export const iconsModule: ToolModule = {
  id: 'icons',
  name: 'icons.title',
  icon: 'palette',
  order: 9,

  activate(): void {
    // bibliothèque et fichiers gérés côté main
  },

  renderPanel(): ReactNode {
    return <IconsPanel />;
  }
};
