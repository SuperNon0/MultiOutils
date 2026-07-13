/**
 * Contrat de l'API exposée au renderer par le preload (window.api).
 * Implémentée dans src/preload/index.ts via contextBridge (docs/01 §5).
 */
import type { Capture, CaptureType, Folder, Tag } from '@multioutils/shared';
import type {
  AppSettings,
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
    extract(
      captureId: string,
      lang: 'fra' | 'eng'
    ): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
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
}
