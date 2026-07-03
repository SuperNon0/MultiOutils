import { contextBridge, ipcRenderer } from 'electron';
import type { Capture, CaptureType } from '@multioutils/shared';
import type { PreloadApi, Unsubscribe } from '../common/api';
import type {
  AppSettings,
  CaptureTakeOptions,
  LibraryAction,
  LibraryView,
  NavigateMsg,
  RegionRect,
  SortKey
} from '../common/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void =>
    cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: PreloadApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', patch),
    chooseFolder: () => ipcRenderer.invoke('settings:chooseFolder'),
    onChanged: (cb) => subscribe<AppSettings>('settings:changed', cb)
  },
  capture: {
    take: (type: CaptureType, opts?: CaptureTakeOptions) =>
      ipcRenderer.invoke('capture:take', type, opts),
    onDone: (cb) => subscribe<Capture>('capture:done', cb)
  },
  library: {
    list: (view: LibraryView, sort: SortKey) =>
      ipcRenderer.invoke('library:list', view, sort),
    update: (action: LibraryAction) => ipcRenderer.invoke('library:update', action),
    onChanged: (cb) => subscribe<void>('library:changed', cb)
  },
  shortcuts: {
    set: (id: string, accelerator: string) =>
      ipcRenderer.invoke('shortcuts:set', id, accelerator),
    status: () => ipcRenderer.invoke('shortcuts:status')
  },
  system: {
    displays: () => ipcRenderer.invoke('system:displays'),
    version: () => ipcRenderer.invoke('app:version')
  },
  host: {
    onNavigate: (cb) => subscribe<NavigateMsg>('host:navigate', cb)
  },
  region: {
    shot: (displayId: string) => ipcRenderer.invoke('region:shot', displayId),
    select: (displayId: string, rect: RegionRect) =>
      ipcRenderer.send('region:select', displayId, rect),
    cancel: () => ipcRenderer.send('region:cancel')
  },
  picker: {
    list: () => ipcRenderer.invoke('picker:list'),
    pick: (sourceId: string) => ipcRenderer.send('picker:pick', sourceId),
    cancel: () => ipcRenderer.send('picker:cancel')
  },
  quickbar: {
    action: (captureId, action) =>
      ipcRenderer.invoke('quickbar:action', captureId, action),
    hover: (hovering: boolean) => ipcRenderer.send('quickbar:hover', hovering)
  },
  editor: {
    save: (payload) => ipcRenderer.invoke('editor:save', payload),
    exportAs: (payload) => ipcRenderer.invoke('editor:export', payload),
    copy: (dataUrl: string) => ipcRenderer.invoke('editor:copy', dataUrl)
  }
};

contextBridge.exposeInMainWorld('api', api);
