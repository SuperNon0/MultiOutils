import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { ClipboardPanel, ClipboardSettings } from './ClipboardPanel';

/** Module « Presse-papiers » (docs/00 §9.4) — historique des copies + clips iPhone. */
export const clipboardModule: ToolModule = {
  id: 'clipboard',
  name: 'clips.title',
  icon: 'clipboard',
  order: 4,

  activate(): void {
    // la surveillance du presse-papiers vit côté main
  },

  renderPanel(): ReactNode {
    return <ClipboardPanel />;
  },

  settingsPanel(): ReactNode {
    return <ClipboardSettings />;
  }
};
