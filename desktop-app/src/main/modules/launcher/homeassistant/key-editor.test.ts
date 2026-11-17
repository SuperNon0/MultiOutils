import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { windows, ipc, handlers } = vi.hoisted(() => ({ windows: [] as any[], ipc: new Map<string, any>(), handlers: new Map<string, any>() }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    app: { isPackaged: false, getAppPath: () => '/workspace/MultiOutils/desktop-app' },
    screen: { getPrimaryDisplay: () => ({ workArea: { width: 1920, height: 1080 } }) },
    ipcMain: { handle: (name: string, fn: unknown) => handlers.set(name, fn), on: (name: string, fn: unknown) => ipc.set(name, fn), removeHandler: (name: string) => handlers.delete(name), removeListener: (name: string) => ipc.delete(name) },
    BrowserWindow: class extends EventEmitter {
      dead = false;
      webContents = Object.assign(new EventEmitter(), { id: windows.length + 1, send: vi.fn(), setWindowOpenHandler: vi.fn() });
      constructor() { super(); windows.push(this); }
      isDestroyed() { return this.dead; }
      show = vi.fn(); focus = vi.fn(); loadFile = vi.fn(async () => {});
      close() { this.dead = true; this.emit('closed'); }
      destroy() { this.close(); }
    }
  };
});
vi.mock('../../../windows', () => ({ preloadPath: () => '/preload.js' }));
import { setupHaKeyEditor } from './key-editor';
const routes = new Map<string, any>();
const route = (method: string, path: string, body?: unknown) => {
  const [p] = path.split('?');
  return routes.get(`${method} ${p}`)(new URL(path, 'http://127.0.0.1'), body);
};
let dispose: () => void;
beforeEach(() => {
  vi.useFakeTimers(); windows.length = 0; ipc.clear(); handlers.clear(); routes.clear();
  dispose = setupHaKeyEditor({ registerLocalRoute: (method: string, pattern: RegExp, fn: unknown) => {
    for (const path of ['open', 'messages', 'reply', 'close']) if (pattern.test(`/ha/editor/${path}`)) routes.set(`${method} /ha/editor/${path}`, fn);
  } } as never);
});
afterEach(() => { dispose(); vi.clearAllTimers(); vi.useRealTimers(); });
const open = (context = 'a') => route('POST', '/ha/editor/open', { context, action: 'com.supernon0.multioutils.ha.light', settings: { entity: 'light.salon' } });
describe('grand éditeur Home Assistant', () => {
  it('réutilise la fenêtre de la même touche et isole les réglages de deux touches', async () => {
    const a = await open('a'), again = await open('a'), b = await open('b');
    expect(a.token).toBe(again.token); expect(a.token).not.toBe(b.token); expect(windows.length).toBe(2);
    ipc.get('ha-key-editor:send')({ sender: { id: windows[0].webContents.id } }, { event: 'setSettings', payload: { entity: 'light.cuisine' } });
    expect(route('GET', `/ha/editor/messages?token=${a.token}`).messages).toEqual([{ event: 'setSettings', payload: { entity: 'light.cuisine' } }]);
    expect(route('GET', `/ha/editor/messages?token=${b.token}`).messages).toEqual([]);
  });
  it('transmet les réponses et réglages uniquement à la fenêtre concernée', async () => {
    const a = await open('a'); await open('b');
    route('POST', '/ha/editor/reply', { token: a.token, settings: { titleText: 'Salon' }, payload: { cmd: 'preview', image: 'image' } });
    expect(windows[0].webContents.send).toHaveBeenCalledWith('ha-key-editor:message', { event: 'didReceiveSettings', settings: { titleText: 'Salon' } });
    expect(windows[1].webContents.send).not.toHaveBeenCalled();
  });
  it('garde le dernier réglage en attente lors de la fermeture', async () => {
    const a = await open();
    const send = ipc.get('ha-key-editor:send'), event = { sender: { id: windows[0].webContents.id } };
    send(event, { event: 'setSettings', payload: { titleText: 'Premier' } });
    send(event, { event: 'setSettings', payload: { titleText: 'Dernier' } });
    windows[0].close();
    send(event, { event: 'setSettings', payload: { titleText: 'Dernier, fermeture' } });
    const result = route('GET', `/ha/editor/messages?token=${a.token}`);
    expect(result.closed).toBe(true); expect(result.messages[0].payload.titleText).toBe('Dernier, fermeture');
  });
  it('refuse les messages provenant d’une autre fenêtre et les actions inconnues', async () => {
    const a = await open();
    ipc.get('ha-key-editor:send')({ sender: { id: 999 } }, { event: 'setSettings', payload: { titleText: 'Intrus' } });
    expect(route('GET', `/ha/editor/messages?token=${a.token}`).messages).toEqual([]);
    expect(() => handlers.get('ha-key-editor:init')({ sender: { id: 999 } })).toThrow();
    await expect(route('POST', '/ha/editor/open', { context: 'x', action: 'other' })).rejects.toThrow();
  });
});
