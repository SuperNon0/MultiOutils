/**
 * Types communs aux trois cibles de l'app (main / preload / renderer).
 * Les types partagés app ↔ serveur restent dans @multioutils/shared.
 */
import type { Capture } from '@multioutils/shared';

export type Language = 'fr' | 'en';

export type ShortcutId = 'fullscreen' | 'region' | 'window' | 'delayed';

/** Raccourcis par défaut (docs/00 §1.2). */
export const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = {
  fullscreen: 'PrintScreen',
  region: 'CommandOrControl+Shift+S',
  window: 'CommandOrControl+Shift+W',
  delayed: 'CommandOrControl+Shift+D'
};

export interface AppSettings {
  language: Language;
  /** Thème sombre uniquement pour l'instant (CDC.html) ; le clair viendra plus tard. */
  theme: 'dark';
  autostart: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  clipboardAuto: boolean;
  openEditorAfterCapture: boolean;
  /** Pas encore supporté par desktopCapturer — exposé mais grisé (docs/06). */
  includeCursor: boolean;
  defaultFormat: 'png' | 'jpg';
  jpgQuality: number;
  storageDir: string;
  filenameTemplate: string;
  captureAllScreens: boolean;
  delayedSeconds: number;
  /** Compteur pour la variable {counter} du modèle de nom. */
  counter: number;
  firstRunDone: boolean;
  shortcuts: Record<ShortcutId, string>;
}

export interface DisplayInfo {
  id: number;
  index: number;
  /** Dimensions physiques (px réels, DPI inclus). */
  width: number;
  height: number;
  primary: boolean;
}

export interface CaptureTakeOptions {
  displayId?: number;
}

export type LibraryView = 'library' | 'trash';
export type SortKey = 'date' | 'name' | 'size';

export type LibraryAction =
  | { action: 'rename'; id: string; name: string }
  | { action: 'trash'; id: string }
  | { action: 'restore'; id: string }
  | { action: 'destroy'; id: string }
  | { action: 'emptyTrash' }
  | { action: 'copy'; id: string }
  | { action: 'saveAs'; id: string }
  | { action: 'reveal'; id: string };

export type QuickbarAction = 'edit' | 'copy' | 'saveAs' | 'send' | 'delete';

export interface RegionShot {
  dataUrl: string;
  /** Ratio px physiques / px CSS de l'overlay (mise à l'échelle DPI). */
  scale: number;
  width: number;
  height: number;
}

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickerItem {
  id: string;
  name: string;
  thumbDataUrl: string;
  iconDataUrl: string | null;
}

export interface ShortcutStatus {
  id: string;
  accelerator: string;
  ok: boolean;
}

export type NavigateMsg =
  | { view: 'settings'; section?: string }
  | { view: 'tool'; toolId: string; captureId?: string };

export type { Capture };
