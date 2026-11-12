/**
 * Contrat de l'API exposée au renderer par le preload (window.api).
 * Implémentée dans src/preload/index.ts via contextBridge (docs/01 §5).
 */
import type { Capture, CaptureType, Folder, Tag } from '@multioutils/shared';
import type {
  AppSettings,
  AutoclickProfile,
  AutoclickState,
  AutoclickStore,
  CaptureListItem,
  CaptureTakeOptions,
  DisplayInfo,
  LibraryAction,
  LibraryQuery,
  NavigateMsg,
  PickerItem,
  QuickbarAction,
  RegionRect,
  RegionShot,
  ShortcutStatus
} from './types';

export type Unsubscribe = () => void;

export interface PreloadApi {
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
    chooseFolder(): Promise<string | null>;
    onChanged(cb: (settings: AppSettings) => void): Unsubscribe;
  };
  capture: {
    take(type: CaptureType, opts?: CaptureTakeOptions): Promise<void>;
    onDone(cb: (capture: Capture) => void): Unsubscribe;
  };
  library: {
    list(query: LibraryQuery): Promise<CaptureListItem[]>;
    update(action: LibraryAction): Promise<void>;
    onChanged(cb: () => void): Unsubscribe;
    /** Drag natif : fichiers réels, déposables sur un dossier interne ou une autre app. */
    startDrag(ids: string[]): void;
    /** Retrouve les ids de captures depuis des chemins déposés. */
    dropPaths(paths: string[]): Promise<string[]>;
  };
  folders: {
    list(): Promise<Folder[]>;
    create(name: string, parentId: string | null, color: string | null): Promise<Folder>;
    update(id: string, patch: { name?: string; color?: string | null }): Promise<void>;
    remove(id: string): Promise<void>;
  };
  tags: {
    list(): Promise<Tag[]>;
    create(name: string, color: string | null): Promise<Tag>;
    update(id: string, patch: { name?: string; color?: string | null }): Promise<void>;
    remove(id: string): Promise<void>;
  };
  files: {
    /** Chemins réels de fichiers déposés (webUtils.getPathForFile). */
    pathsFor(files: File[]): string[];
  };
  shortcuts: {
    set(id: string, accelerator: string): Promise<ShortcutStatus | null>;
    status(): Promise<ShortcutStatus[]>;
  };
  system: {
    displays(): Promise<DisplayInfo[]>;
    version(): Promise<string>;
    copyText(text: string): Promise<void>;
  };
  colorpicker: {
    start(): Promise<void>;
    cancel(): void;
    shot(displayId: string): Promise<RegionShot | null>;
    pick(payload: {
      r: number;
      g: number;
      b: number;
      hex: string;
      formatted: string;
    }): void;
    history(): Promise<
      Array<{ r: number; g: number; b: number; hex: string; formatted: string; pickedAt: string }>
    >;
    clearHistory(): Promise<void>;
    getFormat(): Promise<'hex' | 'rgb' | 'hsl'>;
    setFormat(format: 'hex' | 'rgb' | 'hsl'): Promise<void>;
    onHistoryChanged(cb: () => void): Unsubscribe;
  };
  ocr: {
    /** lang absent = langue des Réglages. */
    extract(
      captureId: string,
      lang?: import('./types').OcrLang
    ): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  };
  /** Traduction IA d'une capture (la clé API ne quitte jamais le process main). */
  ai: {
    getConfig(): Promise<import('./types').AiConfig>;
    /** '' efface la clé ; refusé si le chiffrement du système est indisponible. */
    setKey(provider: import('./types').AiProviderId, key: string): Promise<import('./types').AiSimpleResult>;
    /** Petit appel avec la clé enregistrée du fournisseur. */
    testKey(provider: import('./types').AiProviderId): Promise<import('./types').AiSimpleResult>;
    /** Modèles proposés par le fournisseur pour la clé enregistrée ([] si inconnu). */
    listModels(provider: import('./types').AiProviderId): Promise<string[]>;
    /** Traduction déjà enregistrée pour cette capture (null s'il n'y en a pas). */
    getSaved(captureId: string): Promise<import('./types').AiSavedTranslation | null>;
    /** Enregistre les textes corrigés à la main dans la traduction de la capture. */
    saveEdit(captureId: string, original: string, translated: string): Promise<void>;
    /** Fournisseur et modèle des Réglages ; targetLang absent = langue des Réglages. */
    translate(captureId: string, targetLang?: string): Promise<import('./types').AiTranslateResult>;
    /** Suivi local des dépenses : résumé du mois, total et dernières traductions. */
    getUsage(provider?: import('./types').AiProviderId): Promise<import('./types').AiUsageSummary>;
    /** Remet le compteur à zéro (provider absent = tous les fournisseurs). */
    resetUsage(provider?: import('./types').AiProviderId): Promise<void>;
  };
  autoclicker: {
    getStore(): Promise<AutoclickStore>;
    getState(): Promise<AutoclickState>;
    createProfile(): Promise<{ store: AutoclickStore; createdId: string }>;
    updateProfile(id: string, patch: Partial<AutoclickProfile>): Promise<AutoclickStore>;
    duplicateProfile(
      id: string
    ): Promise<{ store: AutoclickStore; createdId: string | null }>;
    deleteProfile(id: string): Promise<AutoclickStore>;
    setSelected(id: string): Promise<AutoclickStore>;
    setShortcut(shortcut: string): Promise<AutoclickStore>;
    start(id: string): Promise<void>;
    stop(): Promise<void>;
    toggle(id: string): Promise<void>;
    onState(cb: (state: AutoclickState) => void): Unsubscribe;
    onStore(cb: (store: AutoclickStore) => void): Unsubscribe;
  };
  clips: {
    list(): Promise<import('./types').ClipItem[]>;
    copy(id: string): Promise<void>;
    pin(id: string, pinned: boolean): Promise<void>;
    /** Dossier + tags — taxonomie PROPRE au presse-papiers (clip_folders/clip_tags). */
    organize(
      id: string,
      patch: { folderId?: string | null; tagIds?: string[] }
    ): Promise<void>;
    folders: {
      list(): Promise<Folder[]>;
      create(name: string, parentId: string | null, color: string | null): Promise<Folder>;
      update(id: string, patch: { name?: string; color?: string | null }): Promise<void>;
      remove(id: string): Promise<void>;
    };
    tags: {
      list(): Promise<Tag[]>;
      create(name: string, color: string | null): Promise<Tag>;
      update(id: string, patch: { name?: string; color?: string | null }): Promise<void>;
      remove(id: string): Promise<void>;
    };
    remove(id: string): Promise<void>;
    clearUnpinned(): Promise<void>;
    /** Envoi explicite d'un élément au serveur (local-first, docs/00 §6). */
    send(id: string): Promise<{ ok: boolean; error?: string }>;
    /** Force une récupération des clips du serveur (iPhone/iPad). */
    syncNow(): Promise<number>;
    /** Ouvre le sélecteur de fichiers OS et ajoute les fichiers choisis (PDF, docs, zip…). */
    importFiles(): Promise<void>;
    /** Ajoute des fichiers depuis leurs chemins réels (glisser-déposer). */
    addPaths(paths: string[]): Promise<void>;
    /** Ouvre le fichier d'un clip (kind='file'/'image' importé) avec l'app par défaut. */
    open(id: string): Promise<void>;
    /** Révèle le fichier d'un clip dans l'explorateur. */
    reveal(id: string): Promise<void>;
    getSettings(): Promise<import('./types').ClipsSettings>;
    setSettings(
      patch: Partial<import('./types').ClipsSettings>
    ): Promise<import('./types').ClipsSettings>;
    onChanged(cb: () => void): Unsubscribe;
  };
  host: {
    onNavigate(cb: (nav: NavigateMsg) => void): Unsubscribe;
  };
  region: {
    shot(displayId: string): Promise<RegionShot | null>;
    select(displayId: string, rect: RegionRect): void;
    cancel(): void;
  };
  picker: {
    list(): Promise<PickerItem[]>;
    pick(sourceId: string): void;
    cancel(): void;
  };
  quickbar: {
    action(captureId: string, action: QuickbarAction): Promise<void>;
    hover(hovering: boolean): void;
  };
  remote: {
    getConfig(): Promise<import('./types').RemoteConfig>;
    /** token : undefined = inchangé · '' = effacé · sinon remplacé. */
    setConfig(url: string, token?: string): Promise<import('./types').RemoteConfig>;
    test(): Promise<import('./types').RemoteTestResult>;
    onConfigChanged(
      cb: (config: import('./types').RemoteConfig) => void
    ): Unsubscribe;
  };
  update: {
    check(): Promise<import('./types').UpdateStatus>;
    download(): Promise<void>;
    install(): Promise<void>;
    status(): Promise<import('./types').UpdateStatus>;
    onStatus(cb: (status: import('./types').UpdateStatus) => void): Unsubscribe;
  };
  editor: {
    /** Annotations (JSON) + éventuel écrasement du fichier aplati. */
    save(payload: {
      id: string;
      annotations: string | null;
      dataUrl?: string;
    }): Promise<boolean>;
    /** « Enregistrer sous… » / « Exporter » (PNG/JPG/WebP). */
    exportAs(payload: {
      id: string;
      dataUrl: string;
      ext: 'png' | 'jpg' | 'webp';
    }): Promise<boolean>;
    copy(dataUrl: string): Promise<void>;
  };
  /** Module « Lanceur » (recréation de Flow Launcher, docs/07-lanceur.md). */
  launcher: {
    getState(): Promise<import('./launcher').LauncherState>;
    /** Les résultats arrivent par onResults (au fil des fournisseurs). */
    query(text: string, queryId: number): Promise<void>;
    execute(
      resultId: string,
      mode: import('./launcher').LauncherExecMode,
      query: string
    ): Promise<import('./launcher').LauncherOutcome>;
    actions(resultId: string): Promise<import('./launcher').LauncherAction[]>;
    runAction(
      resultId: string,
      actionId: string,
      query: string
    ): Promise<import('./launcher').LauncherOutcome>;
    /** Icône système d'un fichier (data URL) ou null. */
    icon(path: string): Promise<string | null>;
    hide(): void;
    resize(height: number): void;
    open(): Promise<void>;
    getSettings(): Promise<LauncherSettingsInfo>;
    setSettings(patch: import('./launcher').LauncherSettingsPatch): Promise<LauncherSettingsInfo>;
    resetSettings(): Promise<LauncherSettingsInfo>;
    reindex(): Promise<import('./launcher').LauncherStats>;
    clearHistory(): Promise<void>;
    clearUsage(): Promise<void>;
    /** Home Assistant : jeton chiffré côté main (jamais relu par le renderer). */
    haStatus(): Promise<{ hasToken: boolean }>;
    haSetToken(token: string): Promise<{ hasToken: boolean }>;
    haTest(): Promise<{ ok: true; count: number } | { ok: false; error: string }>;
    /** Spotify : connexion OAuth par le navigateur, jeton chiffré côté main. */
    spotifyStatus(): Promise<{ connected: boolean; user?: string }>;
    spotifyConnect(): Promise<{ ok: true; user: string } | { ok: false; error: string }>;
    spotifyDisconnect(): Promise<{ connected: boolean }>;
    onResults(cb: (msg: import('./launcher').LauncherResultsMsg) => void): Unsubscribe;
    onShown(cb: () => void): Unsubscribe;
    onHidden(cb: () => void): Unsubscribe;
    onState(cb: (state: import('./launcher').LauncherState) => void): Unsubscribe;
  };
  /** Liaison PC ↔ Home Assistant (pop-ups, mini tableau de bord, capteurs). */
  ha: {
    status(): Promise<import('./launcher').HaLinkStatus>;
    onStatus(cb: (status: import('./launcher').HaLinkStatus) => void): Unsubscribe;
    /** Oublie l'enregistrement et se réenregistre (si la liaison est active). */
    forget(): Promise<import('./launcher').HaLinkStatus>;
    reconnect(): Promise<import('./launcher').HaLinkStatus>;
    history(): Promise<import('./launcher').HaNotification[]>;
    onHistory(cb: (list: import('./launcher').HaNotification[]) => void): Unsubscribe;
    clearHistory(): Promise<void>;
    testToast(): Promise<void>;
    openDashboard(path?: string): Promise<void>;
    /** Sons intégrés et fichiers du dossier des sons. */
    sounds(): Promise<import('./launcher').HaSoundList>;
    openSoundsFolder(): Promise<string>;
    soundPreview(name: string): Promise<{ soundName?: string; soundSrc?: string; volume: number } | null>;
    /* fenêtre des pop-ups */
    toasts(): Promise<import('./launcher').HaToastMsg | null>;
    onToasts(cb: (msg: import('./launcher').HaToastMsg) => void): Unsubscribe;
    toastResize(height: number): void;
    toastDismiss(id: string): void;
    toastOpen(id: string): void;
    toastAction(id: string, action: string): void;
    /* barre de la mini fenêtre */
    dash: {
      reload(): void;
      back(): void;
      home(): void;
      external(): void;
      hide(): void;
      pin(): Promise<boolean>;
      onTitle(cb: (title: string) => void): Unsubscribe;
      onError(cb: (error: string | null) => void): Unsubscribe;
    };
  };
}

export interface LauncherSettingsInfo {
  settings: import('./launcher').LauncherSettings;
  shortcutOk: boolean;
  /** Raccourci de la mini fenêtre Home Assistant enregistré (ou vide). */
  haShortcutOk?: boolean;
  stats: import('./launcher').LauncherStats;
}
