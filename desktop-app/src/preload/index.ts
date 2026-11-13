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
  desktop: {
    getState: () => ipcRenderer.invoke('desktop:getState'),
    setSettings: (patch) => ipcRenderer.invoke('desktop:setSettings', patch),
    createZone: (kind) => ipcRenderer.invoke('desktop:createZone', kind),
    draw: () => ipcRenderer.invoke('desktop:draw'),
    starter: () => ipcRenderer.invoke('desktop:starter'),
    updateZone: (id, patch) => ipcRenderer.invoke('desktop:updateZone', id, patch),
    deleteZone: (id) => ipcRenderer.invoke('desktop:deleteZone', id),
    restoreZone: (zone) => ipcRenderer.invoke('desktop:restoreZone', zone),
    icon: (p, size) => ipcRenderer.invoke('desktop:icon', p, size),
    onState: (cb) => subscribe('desktop:state', cb),
    onZoneDeleted: (cb) => subscribe('desktop:zoneDeleted', cb),
    zone: {
      hello: () => ipcRenderer.invoke('desktop:zone:hello'),
      onUpdate: (cb) => subscribe('desktop:zone', cb),
      onEdit: (cb) => subscribe('desktop:zone:edit', cb),
      bounds: (rect, final, mode) => ipcRenderer.send('desktop:zone:bounds', rect, final, mode),
      open: (p) => ipcRenderer.invoke('desktop:zone:open', p),
      up: () => ipcRenderer.invoke('desktop:zone:up'),
      home: () => ipcRenderer.invoke('desktop:zone:home'),
      drop: (paths, copy, before) => ipcRenderer.invoke('desktop:zone:drop', paths, copy, before),
      rename: (title) => ipcRenderer.invoke('desktop:zone:rename', title),
      renameItem: (p, name) => ipcRenderer.invoke('desktop:zone:renameItem', p, name),
      startDrag: (paths) => ipcRenderer.send('desktop:zone:startDrag', paths),
      menu: (target) => ipcRenderer.send('desktop:zone:menu', target)
    },
    drawDone: (payload) => ipcRenderer.send('desktop:draw:done', payload),
    drawCancel: () => ipcRenderer.send('desktop:draw:cancel')
  },
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
    extract: (captureId, lang) => ipcRenderer.invoke('ocr:extract', captureId, lang)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setKey: (provider, key) => ipcRenderer.invoke('ai:setKey', provider, key),
    testKey: (provider) => ipcRenderer.invoke('ai:testKey', provider),
    listModels: (provider) => ipcRenderer.invoke('ai:listModels', provider),
    getSaved: (captureId) => ipcRenderer.invoke('ai:getSaved', captureId),
    saveEdit: (captureId, original, translated) =>
      ipcRenderer.invoke('ai:saveEdit', captureId, original, translated),
    translate: (captureId, targetLang) => ipcRenderer.invoke('ai:translate', captureId, targetLang),
    getUsage: (provider) => ipcRenderer.invoke('ai:getUsage', provider),
    resetUsage: (provider) => ipcRenderer.invoke('ai:resetUsage', provider)
  },
  autoclicker: {
    getStore: () => ipcRenderer.invoke('autoclick:getStore'),
    getState: () => ipcRenderer.invoke('autoclick:getState'),
    createProfile: () => ipcRenderer.invoke('autoclick:createProfile'),
    updateProfile: (id, patch) => ipcRenderer.invoke('autoclick:updateProfile', id, patch),
    duplicateProfile: (id) => ipcRenderer.invoke('autoclick:duplicateProfile', id),
    deleteProfile: (id) => ipcRenderer.invoke('autoclick:deleteProfile', id),
    setSelected: (id) => ipcRenderer.invoke('autoclick:setSelected', id),
    setShortcut: (shortcut) => ipcRenderer.invoke('autoclick:setShortcut', shortcut),
    start: (id) => ipcRenderer.invoke('autoclick:start', id),
    stop: () => ipcRenderer.invoke('autoclick:stop'),
    toggle: (id) => ipcRenderer.invoke('autoclick:toggle', id),
    onState: (cb) => subscribe('autoclick:state', cb),
    onStore: (cb) => subscribe('autoclick:store', cb)
  },
  clips: {
    list: () => ipcRenderer.invoke('clips:list'),
    copy: (id: string) => ipcRenderer.invoke('clips:copy', id),
    pin: (id: string, pinned: boolean) => ipcRenderer.invoke('clips:pin', id, pinned),
    organize: (id, patch) => ipcRenderer.invoke('clips:organize', id, patch),
    folders: {
      list: () => ipcRenderer.invoke('clips:folders:list'),
      create: (name, parentId, color) =>
        ipcRenderer.invoke('clips:folders:create', name, parentId, color),
      update: (id, patch) => ipcRenderer.invoke('clips:folders:update', id, patch),
      remove: (id) => ipcRenderer.invoke('clips:folders:delete', id)
    },
    tags: {
      list: () => ipcRenderer.invoke('clips:tags:list'),
      create: (name, color) => ipcRenderer.invoke('clips:tags:create', name, color),
      update: (id, patch) => ipcRenderer.invoke('clips:tags:update', id, patch),
      remove: (id) => ipcRenderer.invoke('clips:tags:delete', id)
    },
    remove: (id: string) => ipcRenderer.invoke('clips:delete', id),
    clearUnpinned: () => ipcRenderer.invoke('clips:clearUnpinned'),
    send: (id: string) => ipcRenderer.invoke('clips:send', id),
    syncNow: () => ipcRenderer.invoke('clips:syncNow'),
    importFiles: () => ipcRenderer.invoke('clips:importFiles'),
    addPaths: (paths: string[]) => ipcRenderer.invoke('clips:addPaths', paths),
    open: (id: string) => ipcRenderer.invoke('clips:open', id),
    reveal: (id: string) => ipcRenderer.invoke('clips:reveal', id),
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
  },
  launcher: {
    getState: () => ipcRenderer.invoke('launcher:getState'),
    query: (text, queryId) => ipcRenderer.invoke('launcher:query', text, queryId),
    execute: (resultId, mode, query) => ipcRenderer.invoke('launcher:execute', resultId, mode, query),
    actions: (resultId) => ipcRenderer.invoke('launcher:actions', resultId),
    runAction: (resultId, actionId, query) =>
      ipcRenderer.invoke('launcher:runAction', resultId, actionId, query),
    icon: (path) => ipcRenderer.invoke('launcher:icon', path),
    hide: () => ipcRenderer.send('launcher:hide'),
    resize: (height) => ipcRenderer.send('launcher:resize', height),
    open: () => ipcRenderer.invoke('launcher:open'),
    getSettings: () => ipcRenderer.invoke('launcher:getSettings'),
    setSettings: (patch) => ipcRenderer.invoke('launcher:setSettings', patch),
    resetSettings: () => ipcRenderer.invoke('launcher:resetSettings'),
    reindex: () => ipcRenderer.invoke('launcher:reindex'),
    clearHistory: () => ipcRenderer.invoke('launcher:clearHistory'),
    clearUsage: () => ipcRenderer.invoke('launcher:clearUsage'),
    haStatus: () => ipcRenderer.invoke('launcher:haStatus'),
    haSetToken: (token) => ipcRenderer.invoke('launcher:haSetToken', token),
    haTest: () => ipcRenderer.invoke('launcher:haTest'),
    spotifyStatus: () => ipcRenderer.invoke('launcher:spotifyStatus'),
    spotifyConnect: () => ipcRenderer.invoke('launcher:spotifyConnect'),
    spotifyDisconnect: () => ipcRenderer.invoke('launcher:spotifyDisconnect'),
    onResults: (cb) => subscribe('launcher:results', cb),
    onShown: (cb) => subscribe<void>('launcher:shown', cb),
    onHidden: (cb) => subscribe<void>('launcher:hidden', cb),
    onState: (cb) => subscribe('launcher:state', cb)
  },
  ha: {
    status: () => ipcRenderer.invoke('ha:status'),
    onStatus: (cb) => subscribe('ha:status', cb),
    forget: () => ipcRenderer.invoke('ha:forget'),
    reconnect: () => ipcRenderer.invoke('ha:reconnect'),
    history: () => ipcRenderer.invoke('ha:history'),
    onHistory: (cb) => subscribe('ha:history', cb),
    clearHistory: () => ipcRenderer.invoke('ha:clearHistory'),
    testToast: () => ipcRenderer.invoke('ha:testToast'),
    openDashboard: (path) => ipcRenderer.invoke('ha:openDashboard', path),
    sounds: () => ipcRenderer.invoke('ha:sounds'),
    openSoundsFolder: () => ipcRenderer.invoke('ha:openSoundsFolder'),
    soundPreview: (name) => ipcRenderer.invoke('ha:soundPreview', name),
    toasts: () => ipcRenderer.invoke('ha:toasts'),
    onToasts: (cb) => subscribe('ha:toasts', cb),
    toastResize: (height) => ipcRenderer.send('ha:toastResize', height),
    toastDismiss: (id) => ipcRenderer.send('ha:toastDismiss', id),
    toastOpen: (id) => ipcRenderer.send('ha:toastOpen', id),
    toastAction: (id, action) => ipcRenderer.send('ha:toastAction', id, action),
    dash: {
      reload: () => ipcRenderer.send('ha:dash:reload'),
      back: () => ipcRenderer.send('ha:dash:back'),
      home: () => ipcRenderer.send('ha:dash:home'),
      external: () => ipcRenderer.send('ha:dash:external'),
      hide: () => ipcRenderer.send('ha:dash:hide'),
      pin: () => ipcRenderer.invoke('ha:dash:pin'),
      onTitle: (cb) => subscribe('ha:dash:title', cb),
      onError: (cb) => subscribe('ha:dash:error', cb)
    }
  }
};

contextBridge.exposeInMainWorld('api', api);
