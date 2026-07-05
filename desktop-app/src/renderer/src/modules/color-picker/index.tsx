import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { ColorPickerPanel, ColorPickerSettings } from './ColorPickerPanel';

/** Module « Pipette de couleur » (docs/00 §9.2) — deuxième outil de l'hôte. */
export const colorPickerModule: ToolModule = {
  id: 'color-picker',
  name: 'colorpicker.title',
  icon: 'eyedropper',
  order: 2,

  activate(): void {
    // le prélèvement (overlay plein écran) est géré côté main
  },

  renderPanel(): ReactNode {
    return <ColorPickerPanel />;
  },

  settingsPanel(): ReactNode {
    return <ColorPickerSettings />;
  }
};
