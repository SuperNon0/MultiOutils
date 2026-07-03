/**
 * Types partagés entre l'app desktop et le serveur.
 * Réfère : docs/01-architecture.md §4 (modèle de données) et docs/04-api-serveur.md.
 */

/** État d'envoi d'une capture vers le serveur distant. */
export type RemoteState = 'none' | 'sent' | 'error';

/** Types de capture proposés par le module screenshot. */
export type CaptureType = 'fullscreen' | 'region' | 'window' | 'screen' | 'delayed';

/** Formats d'export supportés. WebP arrivera avec l'éditeur (voir docs/06). */
export type ImageFormat = 'png' | 'jpg' | 'webp';

/** Une capture telle que stockée dans la base locale (table `captures`). */
export interface Capture {
  id: string;
  filename: string;
  path: string;
  createdAt: string; // ISO 8601
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  folderId: string | null;
  favorite: boolean;
  /** JSON des objets d'annotation (ré-édition) — null tant que non annotée. */
  annotations: string | null;
  remoteState: RemoteState;
  remoteId: string | null;
  /** Non nul = dans la corbeille. */
  deletedAt: string | null;
}

/** Dossier utilisateur (table `folders`), imbrication via parentId. */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  createdAt: string;
}

/** Tag / étiquette (table `tags`). */
export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

/** Définition d'un raccourci global (accélérateur Electron). */
export interface ShortcutDef {
  id: string;
  accelerator: string;
}

/** Métadonnées envoyées avec une capture au serveur (champ `meta` du POST /api/captures). */
export interface CaptureUploadMeta {
  filename: string;
  createdAt: string;
  width: number | null;
  height: number | null;
  folder: string | null;
  tags: string[];
}

/** Réponse de GET /api/health. */
export interface HealthResponse {
  status: 'ok';
  version: string;
}
