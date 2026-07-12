import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { Capture, CaptureType } from '@multioutils/shared';
import type { PreloadApi, Unsubscribe } from '../common/api';
import type {
  AppSettings,
  CaptureTakeOptions,
  LibraryAction,
  LibraryQuery,
  NavigateMsg,
  RegionRect
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
    list: (query: LibraryQuery) => ipcRenderer.invoke('library:list', query),
    update: (action: LibraryAction) => ipcRenderer.invoke('library:update', action),
    onChanged: (cb) => subscribe<void>('library:changed', cb),
    startDrag: (ids: string[]) => ipcRenderer.send('library:startDrag', ids),
    dropPaths: (paths: string[]) => ipcRenderer.invoke('library:dropPaths', paths)
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    create: (name, parentId, color) =>
      ipcRenderer.invoke('folders:create', name, parentId, color),
    update: (id, patch) => ipcRenderer.invoke('folders:update', id, patch),
    remove: (id) => ipcRenderer.invoke('folders:delete', id)
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (name, color) => ipcRenderer.invoke('tags:create', name, color),
    update: (id, patch) => ipcRenderer.invoke('tags:update', id, patch),
    remove: (id) => ipcRenderer.invoke('tags:delete', id)
  },
  files: {
    pathsFor: (files: File[]) => files.map((file) => webUtils.getPathForFile(file))
  },
  shortcuts: {
    set: (id: string, accelerator: string) =>
      ipcRenderer.invoke('shortcuts:set', id, accelerator),
    status: () => ipcRenderer.invoke('shortcuts:status')
  },
  system: {
    displays: () => ipcRenderer.invoke('system:displays'),
    version: () => ipcRenderer.invoke('app:version'),
    copyText: (text: string) => ipcRenderer.invoke('system:copyText', text)
  },
  colorpicker: {
    start: () => ipcRenderer.invoke('colorpicker:start'),
    cancel: () => ipcRenderer.send('colorpicker:cancel'),
    shot: (displayId: string) => ipcRenderer.invoke('colorpicker:shot', displayId),
    pick: (payload) => ipcRenderer.send('colorpicker:pick', payload),
    history: () => ipcRenderer.invoke('colorpicker:history'),
    clearHistory: () => ipcRenderer.invoke('colorpicker:clearHistory'),
    getFormat: () => ipcRenderer.invoke('colorpicker:getFormat'),
    setFormat: (format) => ipcRenderer.invoke('colorpicker:setFormat', format),
    onHistoryChanged: (cb) => subscribe('colorpicker:historyChanged', cb)
  },
  ocr: {
    extract: (captureId: string, lang: 'fra' | 'eng') =>
      ipcRenderer.invoke('ocr:extract', captureId, lang)
  },
  clips: {
    list: () => ipcRenderer.invoke('clips:list'),
    copy: (id: string) => ipcRenderer.invoke('clips:copy', id),
    pin: (id: string, pinned: boolean) => ipcRenderer.invoke('clips:pin', id, pinned),
    organize: (id, patch) => ipcRenderer.invoke('clips:organize', id, patch),
    remove: (id: string) => ipcRenderer.invoke('clips:delete', id),
    clearUnpinned: () => ipcRenderer.invoke('clips:clearUnpinned'),
    send: (id: string) => ipcRenderer.invoke('clips:send', id),
    syncNow: () => ipcRenderer.invoke('clips:syncNow'),
    getSettings: () => ipcRenderer.invoke('clips:getSettings'),
    setSettings: (patch) => ipcRenderer.invoke('clips:setSettings', patch),
    onChanged: (cb) => subscribe<void>('clips:changed', cb)
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
  remote: {
    getConfig: () => ipcRenderer.invoke('remote:getConfig'),
    setConfig: (url: string, token?: string) =>
      ipcRenderer.invoke('remote:setConfig', url, token),
    test: () => ipcRenderer.invoke('remote:test'),
    onConfigChanged: (cb) => subscribe('remote:configChanged', cb)
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    status: () => ipcRenderer.invoke('update:status'),
    onStatus: (cb) => subscribe('update:status', cb)
  },
  editor: {
    save: (payload) => ipcRenderer.invoke('editor:save', payload),
    exportAs: (payload) => ipcRenderer.invoke('editor:export', payload),
    copy: (dataUrl: string) => ipcRenderer.invoke('editor:copy', dataUrl)
  }
};

contextBridge.exposeInMainWorld('api', api);
