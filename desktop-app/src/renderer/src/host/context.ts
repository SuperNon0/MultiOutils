import { createContext, useContext } from 'react';
import type { NavAction } from '../../../common/types';

/** Services de l'hôte accessibles aux composants des modules. */
export interface HostServices {
  notify(msg: string): void;
  openTool(id: string): void;
  /** Ouvre les Réglages (éventuellement sur une section). */
  openSettings(section?: string): void;
  /** Capture à mettre en avant (navigation depuis le tray/notification). */
  navCaptureId: string | null;
  /** Intention associée : sélectionner, ouvrir l'éditeur, « Extraire le texte »
   * ou « Traduire (IA) » (captureId 'latest' = la plus récente). */
  navAction: NavAction;
  consumeNavCapture(): void;
}

export const HostServicesContext = createContext<HostServices>({
  notify: () => undefined,
  openTool: () => undefined,
  openSettings: () => undefined,
  navCaptureId: null,
  navAction: 'select',
  consumeNavCapture: () => undefined
});

export function useHost(): HostServices {
  return useContext(HostServicesContext);
}
