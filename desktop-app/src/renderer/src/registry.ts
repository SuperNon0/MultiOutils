/**
 * Registre des modules (docs/01 §2) : ajouter un outil = créer un dossier
 * `modules/<mon-outil>/`, exporter un ToolModule, et l'ajouter ICI.
 * Rien d'autre à modifier.
 */
import type { ToolModule } from './host/types';
import { clipboardModule } from './modules/clipboard';
import { colorPickerModule } from './modules/color-picker';
import { ocrModule } from './modules/ocr';
import { screenshotModule } from './modules/screenshot';

export const modules: ToolModule[] = [
  screenshotModule,
  colorPickerModule,
  ocrModule,
  clipboardModule
].sort((a, b) => a.order - b.order);
