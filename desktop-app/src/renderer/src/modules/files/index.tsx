import type { ReactNode } from 'react';
import type { ToolModule } from '../../host/types';
import { FilesPanel } from './FilesPanel';

/** Module « Fichiers » : gestionnaire de fichiers (dossier Bureau & Fichiers,
 *  étape 4). Les opérations sur le disque vivent côté main (modules/files). */
export const filesModule: ToolModule = {
  id: 'files',
  name: 'files.title',
  icon: 'folderopen',
  order: 8,

  activate(): void {
    // Rien côté renderer.
  },

  renderPanel(): ReactNode {
    return <FilesPanel />;
  }
};
