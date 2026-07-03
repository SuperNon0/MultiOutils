/**
 * Registre des modules (docs/01 §2) : ajouter un outil = créer un dossier
 * `modules/<mon-outil>/`, exporter un ToolModule, et l'ajouter ICI.
 * Rien d'autre à modifier.
 */
import type { ToolModule } from './host/types';
import { screenshotModule } from './modules/screenshot';

export const modules: ToolModule[] = [screenshotModule].sort(
  (a, b) => a.order - b.order
);
