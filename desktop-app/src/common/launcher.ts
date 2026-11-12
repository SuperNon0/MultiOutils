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
  /** Home Assistant : adresse (le jeton est chiffré à part, jamais ici) + liaison PC. */
  homeAssistant: HaSettings;
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

/* ───────────── Home Assistant : liaison PC ↔ HA ───────────── */

export type HaToastPosition =
  | 'bottom-right'
  | 'top-right'
  | 'bottom-left'
  | 'top-left'
  | 'top-center'
  | 'bottom-center'
  | 'center';

export const HA_TOAST_POSITIONS: HaToastPosition[] = [
  'bottom-right',
  'top-right',
  'bottom-left',
  'top-left',
  'top-center',
  'bottom-center',
  'center'
];

/** Taille d'une pop-up : petite, normale, grande. */
export type HaToastSize = 'small' | 'normal' | 'large';

/** Sons intégrés (joués sans fichier). */
export const HA_BUILTIN_SOUNDS = ['carillon', 'cloche', 'alerte', 'sonnette', 'bulle', 'douce'] as const;
export type HaBuiltinSound = (typeof HA_BUILTIN_SOUNDS)[number];

/**
 * Liaison avec Home Assistant : MultiOutils s'enregistre comme l'appli mobile
 * (intégration « mobile_app »). HA voit un appareil, ses capteurs, et un
 * service notify.mobile_app_<nom> qui arrive ici par WebSocket.
 */
export interface HaSettings {
  url: string;
  link: {
    /** Liaison active (enregistrement + connexion permanente). */
    enabled: boolean;
    /** Nom de l'appareil dans HA ('' = nom de l'ordinateur). */
    deviceName: string;
    /** Envoie les capteurs du PC à HA. */
    sensors: boolean;
    /** Intervalle d'envoi des capteurs, en secondes (15 à 600). */
    sensorInterval: number;
    /** Autorise les commandes envoyées par HA (veille, verrouiller, ouvrir une page…). */
    commands: boolean;
    /** Autorise aussi éteindre / redémarrer le PC depuis HA. */
    powerCommands: boolean;
    /** Crée dans HA les scripts-boutons Veille / Verrouiller / Éteindre / Redémarrer. */
    buttons: boolean;
  };
  notifications: {
    enabled: boolean;
    position: HaToastPosition;
    /** Durée d'affichage par défaut, en secondes (3 à 120). */
    duration: number;
    sound: boolean;
    /** Son par défaut : un son intégré ou le nom d'un fichier du dossier des sons. */
    soundName: string;
    /** Volume des sons, de 0 à 100. */
    volume: number;
    /** Ne pas déranger : seules les notifications « importantes » s'affichent. */
    doNotDisturb: boolean;
  };
  dashboard: {
    /** Raccourci global de la mini fenêtre ('' = aucun). */
    shortcut: string;
    /** Chemin du tableau de bord (ex. /lovelace/0 ou /dashboard-pc). */
    path: string;
    width: number;
    height: number;
    hideOnBlur: boolean;
  };
}

export const HA_DASHBOARD_LIMITS = { width: [320, 1600], height: [320, 1400] } as const;

/** Une notification reçue de Home Assistant, déjà nettoyée. */
export interface HaNotification {
  id: string;
  title: string;
  message: string;
  /** Image (data URL, déjà téléchargée côté main). */
  image?: string;
  /** Symbole du sprite « encre » ou emoji. */
  icon?: string;
  /** Accent (lavande, or, ambre, corail, menthe) ou couleur #rrggbb. */
  color?: string;
  /** Durée en secondes ; 0 = reste jusqu'à fermeture. */
  duration: number;
  important: boolean;
  sound: boolean;
  /** Son intégré à jouer (sinon le son par défaut). */
  soundName?: string;
  /** Son personnalisé (data URL, déjà chargée côté main). */
  soundSrc?: string;
  /** Volume de 0 à 100 (sinon celui des réglages). */
  volume?: number;
  /** Emplacement de cette pop-up (sinon celui des réglages). */
  position?: HaToastPosition;
  size?: HaToastSize;
  /** Même tag = remplace la notification précédente. */
  tag?: string;
  /** Lien ouvert au clic sur la notification. */
  url?: string;
  actions: HaNotificationAction[];
  receivedAt: number;
}

export interface HaNotificationAction {
  /** Identifiant renvoyé à HA (événement mobile_app_notification_action). */
  action: string;
  title: string;
  /** Lien à ouvrir au lieu de renvoyer l'action. */
  uri?: string;
  danger?: boolean;
}

export type HaLinkState = 'off' | 'not-configured' | 'registering' | 'connecting' | 'connected' | 'error';

export interface HaLinkStatus {
  state: HaLinkState;
  /** Nom du service notify à utiliser dans HA (ex. notify.mobile_app_connor_vii). */
  notifyService: string | null;
  deviceName: string | null;
  registered: boolean;
  error?: string;
  /** Nombre de capteurs envoyés. */
  sensors: number;
  /** Scripts-boutons créés dans HA (script.pc_veille…). */
  buttons: string[];
}

export interface HaToastMsg {
  toasts: HaNotification[];
  position: HaToastPosition;
  /** Volume par défaut (0 à 100). */
  volume: number;
}

/** Sons disponibles pour les notifications (réglages). */
export interface HaSoundList {
  builtin: string[];
  /** Fichiers du dossier des sons du PC. */
  files: string[];
  folder: string;
}

/** Patch partiel imbriqué (le renderer n'envoie que la sous-partie modifiée). */
export type HaSettingsPatch = Partial<{
  url: string;
  link: Partial<HaSettings['link']>;
  notifications: Partial<HaSettings['notifications']>;
  dashboard: Partial<HaSettings['dashboard']>;
}>;

/** Patch des réglages du lanceur (Home Assistant fusionné en profondeur). */
export type LauncherSettingsPatch = Omit<Partial<LauncherSettings>, 'homeAssistant'> & {
  homeAssistant?: HaSettingsPatch;
};
