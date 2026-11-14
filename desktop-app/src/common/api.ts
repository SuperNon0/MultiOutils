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
  backup: {
    create(): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
    restore(): Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
    status(): Promise<{ automaticFolder: string; latest: string | null; retention: number }>;
  };
  /** Module Fichiers : gestionnaire de fichiers (common/files.ts). */
  fm: {
    places(): Promise<{ places: import('./files').FilePlace[]; zones: import('./files').FilePlace[] }>;
    setFavorites(paths: string[]): Promise<void>;
    list(dir: string): Promise<import('./files').FolderListing>;
    children(dir: string): Promise<import('./files').FileEntry[]>;
    open(path: string): Promise<string | null>;
    reveal(path: string): Promise<void>;
    copyPaths(paths: string[]): Promise<void>;
    rename(path: string, name: string): Promise<boolean>;
    batchRename(paths: string[], names: string[]): Promise<boolean[]>;
    mkdir(dir: string, name: string): Promise<string | null>;
    trash(paths: string[]): Promise<number>;
    transfer(paths: string[], dest: string, copy: boolean): Promise<string>;
    jobs(): Promise<import('./files').FileJob[]>;
    job(id: string, action: 'pause' | 'resume' | 'cancel' | 'clear'): Promise<void>;
    onJobs(cb: (jobs: import('./files').FileJob[]) => void): Unsubscribe;
    search(text: string, scope: string | null): Promise<import('./files').FileEntry[]>;
    preview(path: string): Promise<{ kind: 'image' | 'text' | 'thumb' | 'none'; data: string | null; text: string | null; truncated: boolean }>;
    ocr(path: string): Promise<{ ok: boolean; text?: string; error?: string }>;
    tags(): Promise<Record<string, string[]>>;
    setTag(paths: string[], color: string, on: boolean): Promise<Record<string, string[]>>;
    duplicates(root: string): Promise<import('./files').DupGroup[]>;
    usage(root: string): Promise<import('./files').UsageItem[]>;
    stopScan(): Promise<void>;
    onProgress(cb: (p: { task: 'dups' | 'usage'; done: number; total: number; phase?: 'scan' | 'hash' }) => void): Unsubscribe;
    trashList(): Promise<Array<{ id: string; name: string; from: string; size: number; deletedAt: string }>>;
    trashRestore(ids: string[]): Promise<boolean>;
    emptyTrash(): Promise<boolean>;
    action(kind: 'zip' | 'unzip' | 'terminal' | 'png' | 'jpg', paths: string[], extra?: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    startDrag(paths: string[]): void;
    cleanGet(): Promise<{ rules: import('./files').CleanRule[]; last: number }>;
    cleanSet(rules: import('./files').CleanRule[]): Promise<import('./files').CleanRule[]>;
    cleanPreview(rule: import('./files').CleanRule): Promise<string[]>;
    cleanRun(id?: string): Promise<number>;
  };
  /** Module Bureau : zones sur le bureau Windows (common/desktop.ts). */
  desktop: {
    getState(): Promise<import('./desktop').DesktopState>;
    setSettings(patch: Partial<import('./desktop').DesktopSettings>): Promise<import('./desktop').DesktopState>;
    /** Crée une zone à un emplacement libre (zone-dossier : choix du dossier). */
    createZone(kind: import('./desktop').ZoneKind | import('./desktop').ZonePreset): Promise<import('./desktop').Zone | null>;
    /** Ouvre le calque pour dessiner une zone sur l'écran. */
    draw(): Promise<void>;
    /** Rangement de départ (Programmes, Dossiers, Documents, Images, À trier). */
    starter(): Promise<void>;
    /** Rangement proposé par l'IA (clé IA des Réglages), puis appliqué. */
    aiPlan(): Promise<{ ok: true; plan: import('./desktop').AiPlanZone[] } | { ok: false; error: string }>;
    aiApply(plan: import('./desktop').AiPlanZone[]): Promise<void>;
    updateZone(id: string, patch: Partial<import('./desktop').Zone>): Promise<import('./desktop').DesktopState>;
    deleteZone(id: string): Promise<void>;
    restoreZone(zone: import('./desktop').Zone): Promise<import('./desktop').DesktopState>;
    icon(path: string, size: 'small' | 'normal' | 'large'): Promise<string | null>;
    onState(cb: (state: import('./desktop').DesktopState) => void): Unsubscribe;
    onZoneDeleted(cb: (zone: import('./desktop').Zone) => void): Unsubscribe;
    /** Aperçu au-dessus des fenêtres, masquage, « Afficher le bureau ». */
    peek(): Promise<void>;
    peekStop(): void;
    toggleHide(): Promise<void>;
    showDesktop(): Promise<void>;
    shortcutStatus(): Promise<Array<{ id: string; accelerator: string; ok: boolean }>>;
    /** Pages du bureau. */
    page: {
      switch(id: string): Promise<void>;
      add(name: string): Promise<import('./desktop').DesktopPage>;
      rename(id: string, name: string): Promise<void>;
      move(id: string, dir: -1 | 1): Promise<void>;
      delete(id: string): Promise<void>;
    };
    /** Pipette : couleur prise à l'écran pour une zone (null = style par défaut). */
    pickColor(zoneId: string | null, field: 'bg' | 'titleColor' | 'iconTint' | 'color'): Promise<boolean>;
    saveStyle(name: string, style: Partial<import('./desktop').ZoneStyle>): Promise<import('./desktop').SavedStyle>;
    /** Dispositions : écrans, instantanés, sauvegardes, fichier. */
    layout: {
      swapScreens(): Promise<void>;
      list(): Promise<Array<{ id: string; name: string; at: number; type: 'manual' | 'daily'; zones: number }>>;
      save(name: string): Promise<{ id: string; name: string; at: number; type: 'manual' | 'daily'; zones: number }>;
      rename(id: string, name: string): Promise<void>;
      delete(id: string): Promise<void>;
      restore(id: string): Promise<boolean>;
      undo(): Promise<boolean>;
      exportFile(withRules: boolean): Promise<string | null>;
      importFile(): Promise<'ok' | 'cancel' | 'invalid'>;
    };
    pickFolder(): Promise<string | null>;
    dropToZone(zoneId: string, paths: string[], copy: boolean): Promise<boolean>;
    /** Règles de rangement et journal. */
    rules: {
      get(): Promise<{ rules: import('./desktop').Rule[]; log: import('./desktop').RuleLogEntry[] }>;
      set(rules: import('./desktop').Rule[]): Promise<import('./desktop').Rule[]>;
      preview(rule: import('./desktop').Rule): Promise<{ count: number; names: string[] }>;
      apply(id: string): Promise<number>;
      applyAll(): Promise<number>;
      undo(logId: string): Promise<boolean>;
      clearLog(): Promise<void>;
      onChange(cb: (data: { rules: import('./desktop').Rule[]; log: import('./desktop').RuleLogEntry[] }) => void): Unsubscribe;
    };
    /** Fenêtre d'une zone. */
    zone: {
      hello(): Promise<import('./desktop').ZoneWindowMsg | null>;
      onUpdate(cb: (msg: import('./desktop').ZoneWindowMsg) => void): Unsubscribe;
      onEdit(cb: (msg: { type: 'title' | 'item' | 'tab'; path?: string; id?: string }) => void): Unsubscribe;
      onFade(cb: (hidden: boolean) => void): Unsubscribe;
      onMergeHint(cb: (on: boolean) => void): Unsubscribe;
      expand(on: boolean): void;
      roll(): void;
      activity(): void;
      tab(id: string): void;
      tabMenu(id: string): void;
      bounds(rect: import('./desktop').Rect, final: boolean, mode: 'move' | 'resize'): void;
      open(path: string): Promise<void>;
      up(): Promise<void>;
      home(): Promise<void>;
      drop(paths: string[], copy: boolean, before?: string, tabId?: string): Promise<void>;
      rename(title: string, tabId?: string): Promise<void>;
      renameItem(path: string, name: string): Promise<boolean>;
      startDrag(paths: string[]): void;
      menu(target: { path?: string } | null): void;
      /** Zone « Notes » : enregistre le texte. */
      note(text: string): void;
    };
    /** Calque de dessin. */
    drawDone(payload: { displayId: string; rect: import('./desktop').Rect; kind: import('./desktop').ZoneKind }): void;
    drawCancel(): void;
  };
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
  streamdeck: {
    info(): Promise<import('./types').StreamDeckPluginInfo>;
    /** Ouvre le paquet .streamDeckPlugin : Stream Deck installe / remplace le plugin. */
    install(): Promise<import('./types').StreamDeckInstallResult>;
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
    /** Entités pilotables (zone Home Assistant du bureau). */
    entities(): Promise<{ ok: true; list: import('./desktop').HaEntity[] } | { ok: false; error: string }>;
    toggle(entityId: string): Promise<boolean>;
    series(entityId: string, hours: 24 | 168): Promise<{ ok: true; points: Array<{ at: number; value: number }> } | { ok: false; error: string }>;
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
