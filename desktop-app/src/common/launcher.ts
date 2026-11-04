/**
 * Types du module « Lanceur » partagés entre main, preload et renderer.
 * Équivalent des parties de base de Flow Launcher (licence MIT, voir
 * THIRD_PARTY_NOTICES.md) — sans le système de plugins tiers.
 */

/** Fournisseurs intégrés (équivalents des plugins inclus de Flow). */
export type LauncherProviderId =
  | 'programs'
  | 'files'
  | 'calculator'
  | 'websearch'
  | 'url'
  | 'shell'
  | 'system'
  | 'winsettings'
  | 'processes'
  | 'bookmarks'
  | 'tools'
  | 'aliases'
  | 'steam'
  | 'homeassistant'
  | 'spotify'
  | 'history';

export const LAUNCHER_PROVIDER_IDS: LauncherProviderId[] = [
  'programs',
  'files',
  'calculator',
  'websearch',
  'url',
  'shell',
  'system',
  'winsettings',
  'processes',
  'bookmarks',
  'tools',
  'aliases',
  'steam',
  'homeassistant',
  'spotify'
];

/** Icône d'un résultat : symbole du sprite « encre » ou icône de fichier. */
export type LauncherIcon =
  | { kind: 'sprite'; name: string }
  /** Icône système d'un fichier, demandée à la volée (launcher:icon). */
  | { kind: 'file'; path: string };

export interface LauncherResult {
  /** Identifiant unique dans la requête courante. */
  id: string;
  providerId: LauncherProviderId;
  title: string;
  subtitle?: string;
  icon: LauncherIcon;
  /** Positions des caractères correspondants dans le titre (surlignage). */
  titleHl?: number[];
  subtitleHl?: number[];
  /** Score final (correspondance + usage + priorité). */
  score: number;
  /** Texte proposé par Tab (autocomplétion, ex. un chemin). */
  autoComplete?: string;
  /** Confirmation demandée avant l'action principale (actions destructives). */
  confirm?: string;
  /** Le résultat propose des actions secondaires (menu contextuel). */
  hasContext: boolean;
  /** Ctrl+Entrée : libellé de l'action secondaire, s'il y en a une. */
  secondary?: string;
  /** Ctrl+Maj+Entrée possible (exécuter en administrateur). */
  canAdmin?: boolean;
}

export interface LauncherAction {
  id: string;
  title: string;
  icon: string;
  /** Raccourci affiché (purement informatif). */
  hint?: string;
  confirm?: string;
  danger?: boolean;
}

export type LauncherExecMode = 'primary' | 'secondary' | 'admin';

/** Ce que doit faire la fenêtre après une action. */
export type LauncherOutcome =
  | { kind: 'hide' }
  | { kind: 'keep' }
  /** Remplace le texte de la requête (ex. entrer dans un dossier). */
  | { kind: 'query'; text: string }
  | { kind: 'error'; message: string };

export interface LauncherResultsMsg {
  queryId: number;
  results: LauncherResult[];
  /** Tous les fournisseurs ont répondu. */
  done: boolean;
}

export interface LauncherProviderConfig {
  enabled: boolean;
  /** Mot-clé d'action ; '' = global (résultats mêlés à tous les autres). */
  keyword: string;
}

export interface LauncherWebEngine {
  id: string;
  name: string;
  keyword: string;
  /** Adresse avec {q} à la place du texte recherché. */
  url: string;
  enabled: boolean;
}

/**
 * Raccourci du lanceur : taper `keyword` puis Entrée ouvre directement `target`
 * (site, dossier, fichier ou programme). Avec {q} dans la cible,
 * « mot-clé texte » remplace {q} par le texte.
 */
export interface LauncherAlias {
  id: string;
  keyword: string;
  /** Nom affiché (facultatif ; sinon la cible). */
  name: string;
  target: string;
  enabled: boolean;
}

export type LauncherLastQuery = 'selected' | 'keep' | 'empty';

/** Accent propre à la barre, ou « app » pour suivre Réglages → Apparence. */
export type LauncherLookAccent = 'app' | 'lavande' | 'or' | 'ambre' | 'corail' | 'menthe';
export type LauncherLookPosition = 'top' | 'third' | 'center';

/**
 * Apparence de la barre du lanceur (comme les thèmes de Flow Launcher).
 * Traduite en variables CSS posées sur la fenêtre (voir renderer look.ts).
 */
export interface LauncherLook {
  /** Largeur de la barre, en px (560 à 1000). */
  width: number;
  /** Taille du texte (recherche et résultats), en % (85 à 130). */
  textSize: number;
  /** Lignes de résultats visibles avant défilement (3 à 12). */
  visibleRows: number;
  /** Opacité du fond en verre, en % (60 à 100). */
  opacity: number;
  /** Arrondi des coins de la barre, en px (4 à 32). */
  radius: number;
  position: LauncherLookPosition;
  showSubtitles: boolean;
  /** Numéros Alt+1…9 à droite des résultats. */
  showHotkeys: boolean;
  accent: LauncherLookAccent;
}

export const LAUNCHER_LOOK_LIMITS = {
  width: [560, 1000],
  textSize: [85, 130],
  visibleRows: [3, 12],
  opacity: [60, 100],
  radius: [4, 32]
} as const;

export const DEFAULT_LAUNCHER_LOOK: LauncherLook = {
  width: 720,
  textSize: 100,
  visibleRows: 8,
  opacity: 93,
  radius: 24,
  position: 'third',
  showSubtitles: true,
  showHotkeys: true,
  accent: 'app'
};
export type LauncherFileBackend = 'auto' | 'everything' | 'windows' | 'walk';

export interface LauncherSettings {
  /** Accélérateur Electron (défaut Alt+Space, comme Flow). */
  shortcut: string;
  lastQuery: LauncherLastQuery;
  maxResults: number;
  hideOnBlur: boolean;
  /** Affiche les recherches récentes quand la barre est vide. */
  showHistory: boolean;
  /** Délai avant la recherche (ms). */
  debounceMs: number;
  providers: Record<Exclude<LauncherProviderId, 'history'>, LauncherProviderConfig>;
  webEngines: LauncherWebEngine[];
  /** Raccourcis : mot-clé → site / dossier / programme. */
  aliases: LauncherAlias[];
  /** Home Assistant : adresse (le jeton est chiffré à part, jamais ici). */
  homeAssistant: { url: string };
  /** Spotify : Client ID de ta propre appli (le jeton est chiffré à part). */
  spotify: { clientId: string };
  /** Moteur proposé en dernier résultat de toute recherche ('' = aucun). */
  defaultEngine: string;
  shell: { kind: 'cmd' | 'powershell'; keepOpen: boolean };
  fileBackend: LauncherFileBackend;
  /** Dossiers supplémentaires indexés (programmes + fichiers). */
  indexedFolders: string[];
  /** Motifs exclus (sous-chaîne ou joker *), un par ligne. */
  excludes: string[];
  /** Apparence de la barre. */
  look: LauncherLook;
}

export interface LauncherState {
  settings: LauncherSettings;
  lang: 'fr' | 'en';
  /** Dernière requête (pour la réouverture). */
  lastQuery: string;
  shortcutOk: boolean;
}

export interface LauncherStats {
  programs: number;
  bookmarks: number;
  indexedAt: string | null;
  everything: boolean;
  /** Jeux Steam détectés. */
  steamGames: number;
}
