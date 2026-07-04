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
