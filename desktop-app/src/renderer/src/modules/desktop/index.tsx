import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { DesktopPanel, DesktopSettingsPanel } from './DesktopPanel';

/** Module « Bureau » : zones sur le bureau Windows (dossier Bureau & Fichiers,
 *  étape 1). Les fenêtres des zones et la logique vivent côté main. */
export const desktopModule: ToolModule = {
  id: 'desktop',
  name: 'desktop.title',
  icon: 'grid',
  order: 7,

  activate(): void {
    // Rien côté renderer : les zones sont des fenêtres gérées par le main.
  },

  renderPanel(): ReactNode {
    return <DesktopPanel />;
  },

  settingsPanel(): ReactNode {
    return <DesktopSettingsPanel />;
  }
};
