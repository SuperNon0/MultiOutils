import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { CaptureSettings } from './CaptureSettings';
import { ScreenshotPanel } from './ScreenshotPanel';

/**
 * Module « Capture d'écran » côté renderer (galerie, actions, réglages).
 * Les raccourcis globaux et le menu du tray de ce module vivent côté main
 * (src/main/modules/screenshot) — voir docs/06-decisions-techniques.md.
 */
export const screenshotModule: ToolModule = {
  id: 'screenshot',
  name: 'screenshot.title',
  icon: 'screenshot',
  order: 1,

  activate(): void {
    // Rien à faire côté renderer pour l'instant : la capture native, les
    // raccourcis et le tray sont gérés par la partie main du module.
  },

  renderPanel(): ReactNode {
    return <ScreenshotPanel />;
  },

  settingsPanel(): ReactNode {
    return <CaptureSettings />;
  }
};
