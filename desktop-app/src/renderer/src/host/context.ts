import { createContext, useContext } from 'react';

/** Services de l'hôte accessibles aux composants des modules. */
export interface HostServices {
  notify(msg: string): void;
  openTool(id: string): void;
  /** Capture à mettre en avant (navigation depuis le tray/notification). */
  navCaptureId: string | null;
  consumeNavCapture(): void;
}

export const HostServicesContext = createContext<HostServices>({
  notify: () => undefined,
  openTool: () => undefined,
  navCaptureId: null,
  consumeNavCapture: () => undefined
});

export function useHost(): HostServices {
  return useContext(HostServicesContext);
}
