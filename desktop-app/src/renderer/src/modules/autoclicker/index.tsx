import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { AutoclickerPanel } from './AutoclickerPanel';

/** Module « Autoclic » (docs/00 §9.5) : clics automatiques configurables,
 *  pilotables depuis l'app, un raccourci global et le Stream Deck. */
export const autoclickerModule: ToolModule = {
  id: 'autoclicker',
  name: 'autoclick.title',
  icon: 'mouse',
  order: 5,

  activate(): void {
    // La logique (clics système, boucle, raccourci) vit côté main.
  },

  renderPanel(): ReactNode {
    return <AutoclickerPanel />;
  }
};
