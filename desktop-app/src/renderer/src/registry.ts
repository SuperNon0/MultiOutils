/**
 * Registre des modules (docs/01 §2) : ajouter un outil = créer un dossier
 * `modules/<mon-outil>/`, exporter un ToolModule, et l'ajouter ICI.
 * Rien d'autre à modifier.
 */
import type { ToolModule } from './host/types';
import { autoclickerModule } from './modules/autoclicker';
import { clipboardModule } from './modules/clipboard';
import { colorPickerModule } from './modules/color-picker';
import { desktopModule } from './modules/desktop';
import { launcherModule } from './modules/launcher';
import { screenshotModule } from './modules/screenshot';

export const modules: ToolModule[] = [
  screenshotModule,
  colorPickerModule,
  clipboardModule,
  autoclickerModule,
  launcherModule,
  desktopModule
].sort((a, b) => a.order - b.order);
