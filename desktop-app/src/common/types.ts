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

/** Couleurs d'accent du design « encre » (design-encre/LISEZMOI.md §3). */
export type AppearanceAccent = 'lavande' | 'or' | 'ambre' | 'corail' | 'menthe';
/** Thème : automatique (suit le système), sombre ou clair forcé. */
export type AppearanceTheme = 'auto' | 'sombre' | 'clair';

/** Apparence partagée par toutes les fenêtres (et lue par le module Lanceur). */
export interface AppearanceSettings {
  accent: AppearanceAccent;
  theme: AppearanceTheme;
}

export const APPEARANCE_ACCENTS: AppearanceAccent[] = ['lavande', 'or', 'ambre', 'corail', 'menthe'];
export const APPEARANCE_THEMES: AppearanceTheme[] = ['auto', 'sombre', 'clair'];
export const DEFAULT_APPEARANCE: AppearanceSettings = { accent: 'lavande', theme: 'auto' };

export interface AppSettings {
  language: Language;
  /** Ancien réglage (sombre seul) : remplacé par `appearance`, gardé pour la migration. */
  theme: 'dark';
  /** Apparence « encre » : couleur d'accent + thème. */
  appearance: { accent: 'lavande' | 'or' | 'ambre' | 'corail' | 'menthe'; theme: 'auto' | 'sombre' | 'clair' };
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
  /** Langue de l'OCR (« Extraire le texte » d'une capture, Tesseract). */
  ocrLang: OcrLang;
  /** Traduction IA : fournisseur choisi. */
  aiProvider: AiProviderId;
  /** Traduction IA : modèle retenu POUR CHAQUE fournisseur. */
  aiModels: Record<AiProviderId, string>;
  /** Traduction IA : langue cible (nom en clair, ex. « Français »). */
  aiTargetLang: string;
}

// ── Extraire le texte / Traduction IA ─────────────────────────────────────

export type OcrLang = 'fra' | 'eng' | 'fra+eng';
export const OCR_LANGS: OcrLang[] = ['fra', 'eng', 'fra+eng'];

export type AiProviderId = 'anthropic' | 'openai' | 'gemini';
export const AI_PROVIDERS: AiProviderId[] = ['anthropic', 'openai', 'gemini'];

/** Description d'un fournisseur, telle que l'affiche Réglages → Traduction IA. */
export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  /** Modèles proposés (id + clé i18n facultative d'un mot d'explication). */
  models: Array<{ id: string; hint?: string }>;
  defaultModel: string;
  /** true : liste fermée (sélecteur) ; false : champ libre + suggestions. */
  fixedModels: boolean;
  /** Page où créer une clé API. */
  keyUrl: string;
}

export interface AiConfig {
  providers: AiProviderInfo[];
  /** Une clé est-elle enregistrée pour ce fournisseur ? (jamais la clé elle-même) */
  hasKey: Record<AiProviderId, boolean>;
  /** safeStorage disponible (sinon on refuse d'enregistrer une clé). */
  encryptionAvailable: boolean;
}

export type AiErrorCode =
  | 'noKey'
  | 'invalidKey'
  | 'rateLimit'
  | 'network'
  | 'server'
  | 'refusal'
  | 'truncated'
  | 'badResponse'
  | 'image'
  | 'notFound'
  | 'encryptionUnavailable'
  | 'api';

export interface AiTranslation {
  sourceLanguage: string;
  original: string;
  translated: string;
  /** Modèle qui a répondu (peut différer du modèle demandé : repli serveur). */
  model: string;
}

/** Traduction enregistrée avec une capture (« Revoir la traduction »). */
export interface AiSavedTranslation extends AiTranslation {
  targetLang: string;
  createdAt: string;
}

export type AiTranslateResult =
  | ({ ok: true } & AiTranslation)
  | { ok: false; error: AiErrorCode; message?: string };

export type AiSimpleResult = { ok: true } | { ok: false; error: AiErrorCode; message?: string };

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
  | { action: 'export'; ids: string[] }
  | { action: 'send'; ids: string[] };

export type { Folder, Tag };

export type QuickbarAction = 'edit' | 'copy' | 'saveAs' | 'send' | 'delete' | 'translate';

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

/** Configuration du serveur distant (le jeton n'est jamais relu en clair). */
export interface RemoteConfig {
  url: string;
  hasToken: boolean;
}

export type RemoteTestResult =
  | { ok: true; version: string }
  | { ok: false; error: 'unreachable' | 'badToken'; version?: string };

/** État du flux de mise à jour à la demande (docs/00 §5.3). */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'dev' }
  | { state: 'checking' }
  | { state: 'none'; version: string }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'installing'; version: string }
  | { state: 'error'; message: string };

export type NavAction = 'select' | 'edit' | 'ocr' | 'translate';

export type NavigateMsg =
  | { view: 'settings'; section?: string }
  | {
      view: 'tool';
      toolId: string;
      captureId?: string;
      /** 'edit' ouvre l'éditeur sur la capture, 'select' la met en avant,
       * 'ocr' / 'translate' ouvrent la feuille « Extraire le texte » /
       * « Traduire (IA) » (captureId 'latest' = la plus récente). */
      action?: NavAction;
    };

/** Élément du presse-papiers (module clipboard, docs/00 §9.4). */
export interface ClipItem {
  id: string;
  kind: 'text' | 'image' | 'file';
  /** Texte complet (kind=text). */
  content: string | null;
  /** Aperçu : texte tronqué, data URL de miniature (kind=image), ou nom du fichier (kind=file). */
  preview: string;
  pinned: boolean;
  /** 'local' = copié/ajouté sur ce PC · 'remote' = reçu du serveur (iPhone/iPad…). */
  source: 'local' | 'remote';
  /** Id serveur si l'élément a été envoyé ou importé. */
  remoteId: string | null;
  /** Dossier (taxonomie propre au presse-papiers). */
  folderId: string | null;
  /** Tags (ids de la taxonomie propre au presse-papiers). */
  tagIds: string[];
  /** Nom d'origine (kind=file, et kind=image importée depuis un fichier). */
  filename: string | null;
  /** Taille en octets (kind=file / image). */
  sizeBytes: number | null;
  createdAt: string;
}

/** Réglages du module presse-papiers (persistés en base). */
export interface ClipsSettings {
  /** Surveillance du presse-papiers active. */
  enabled: boolean;
  /** Heures avant purge des éléments non épinglés (0 = jamais). */
  retentionHours: number;
  /** Récupération auto des clips du serveur (iPhone) quand configuré. */
  sync: boolean;
}

// ── Autoclic (docs/00 §9.5) ───────────────────────────────────────────────

export type AutoclickButton = 'left' | 'right' | 'middle';
export type AutoclickClick = 'single' | 'double';
export type AutoclickRepeat = 'infinite' | 'count';

/** Réglages d'un clic (indépendants du nom/id de profil). */
export interface AutoclickConfig {
  /** Intervalle entre deux clics : décomposé pour l'UI (h/m/s/ms). */
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  button: AutoclickButton;
  clickType: AutoclickClick;
  repeat: AutoclickRepeat;
  /** Nombre de clics quand repeat = 'count'. */
  repeatCount: number;
  /** Délai avant le tout premier clic (ms). */
  startDelayMs: number;
}

/** Un profil d'autoclic nommé : des réglages + une identité. */
export interface AutoclickProfile extends AutoclickConfig {
  id: string;
  name: string;
}

/** Magasin persistant de l'autoclic (clé `autoclick.store`). */
export interface AutoclickStore {
  profiles: AutoclickProfile[];
  /** Profil ciblé par le raccourci global / dernier profil choisi. */
  selectedId: string | null;
  /** Raccourci global de bascule (accélérateur Electron) ; '' = aucun. */
  shortcut: string;
}

export const DEFAULT_AUTOCLICK: AutoclickConfig = {
  hours: 0,
  minutes: 0,
  seconds: 0,
  milliseconds: 100,
  button: 'left',
  clickType: 'single',
  repeat: 'infinite',
  repeatCount: 50,
  startDelayMs: 0
};

export interface AutoclickState {
  /** Profil en cours d'exécution (null = arrêté). */
  runningProfileId: string | null;
  /** Clics restants (null = illimité). */
  remaining: number | null;
  /** Clics déjà effectués dans la série courante. */
  done: number;
  /** Clic système disponible (faux hors Windows ou si le natif manque). */
  available: boolean;
}

export type { Capture };
