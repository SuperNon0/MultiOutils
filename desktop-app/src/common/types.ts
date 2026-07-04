/**
 * Types communs aux trois cibles de l'app (main / preload / renderer).
 * Les types partagés app ↔ serveur restent dans @multioutils/shared.
 */
import type { Capture, Folder, Tag } from '@multioutils/shared';

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
  /** Vidage auto de la corbeille après N jours (0 = jamais, docs/03 §7). */
  trashRetentionDays: number;
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

/** Requête de la bibliothèque : filtres orthogonaux et combinables (docs/03 §5). */
export interface LibraryQuery {
  view: LibraryView;
  sort: SortKey;
  search?: string;
  folderId?: string;
  favorites?: boolean;
  /** Dossier intelligent « Non triées » (aucun dossier). */
  unsorted?: boolean;
  /** Dossier intelligent « Récemment envoyées au serveur ». */
  sent?: boolean;
  /** Filtre de date : créées après cet instant (ISO). */
  dateFrom?: string;
  /** Toutes les étiquettes exigées (ET logique). */
  tagIds?: string[];
}

/** Capture + ses étiquettes, telle que rendue par library:list. */
export interface CaptureListItem extends Capture {
  tags: Tag[];
}

export type LibraryAction =
  | { action: 'rename'; id: string; name: string }
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'destroy'; ids: string[] }
  | { action: 'emptyTrash' }
  | { action: 'copy'; id: string }
  | { action: 'saveAs'; id: string }
  | { action: 'reveal'; id: string }
  | { action: 'setFolder'; ids: string[]; folderId: string | null }
  | { action: 'favorite'; ids: string[]; value: boolean }
  | { action: 'addTag'; ids: string[]; tagId: string }
  | { action: 'removeTag'; ids: string[]; tagId: string }
  | { action: 'export'; ids: string[] };

export type { Folder, Tag };

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
  | {
      view: 'tool';
      toolId: string;
      captureId?: string;
      /** 'edit' ouvre l'éditeur sur la capture, 'select' la met en avant. */
      action?: 'select' | 'edit';
    };

export type { Capture };
