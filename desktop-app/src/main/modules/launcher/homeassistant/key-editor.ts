/** Grand éditeur HA : mêmes contrôles que le Stream Deck, même touche et mêmes réglages. */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { MainHostContext } from '../../../module-registry';
import { preloadPath } from '../../../windows';

type Message = { event: 'setSettings' | 'sendToPlugin'; payload: Record<string, unknown> };
interface Session {
  token: string; context: string; action: string; settings: Record<string, unknown>;
  win: BrowserWindow; senderId: number; queue: Message[]; closed?: boolean;
}
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
export function setupHaKeyEditor(ctx: MainHostContext): () => void {
  const sessions = new Map<string, Session>();
  const sender = (id: number, allowClosed = false): Session | undefined => [...sessions.values()].find((s) => s.senderId === id && (allowClosed || !s.closed));
  const close = (s: Session): void => { sessions.delete(s.token); if (!s.win.isDestroyed()) s.win.close(); };
  ipcMain.handle('ha-key-editor:init', (event) => {
    const s = sender(event.sender.id);
    if (!s) throw new Error('Fenêtre non autorisée');
    return { action: s.action, settings: s.settings };
  });
  const send = (event: Electron.IpcMainEvent, raw: unknown): void => {
    const s = sender(event.sender.id, true), msg = object(raw);
    if (!s || !msg || !['setSettings', 'sendToPlugin'].includes(String(msg.event))) return;
    const payload = object(msg.payload);
    if (!payload || JSON.stringify(payload).length > 100_000) return;
    // Pas de perte du dernier réglage si le formulaire est modifié rapidement.
    if (msg.event === 'setSettings' && s.queue.at(-1)?.event === 'setSettings') s.queue.pop();
    if (s.queue.length < 100) s.queue.push({ event: msg.event as Message['event'], payload });
  };
  ipcMain.on('ha-key-editor:send', send);
  ctx.registerLocalRoute('POST', /^\/ha\/editor\/open$/, async (_url, raw) => {
    const body = object(raw);
    const context = typeof body?.context === 'string' ? body.context.slice(0, 200) : '';
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!context || !/^com\.supernon0\.multioutils\.ha(?:\.[a-z]+)?$/.test(action)) throw new Error('Touche invalide');
    const existing = [...sessions.values()].find((s) => s.context === context && !s.closed);
    if (existing) { existing.win.show(); existing.win.focus(); return { token: existing.token }; }
    const area = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({ width: Math.min(1160, area.width), height: Math.min(880, area.height),
      minWidth: 540, minHeight: 480, title: 'Home Assistant — paramètres de la touche', show: false,
      backgroundColor: '#0e0f11', webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false } });
    const token = randomUUID();
    const s: Session = { token, context, action, settings: object(body?.settings) ?? {}, win, senderId: win.webContents.id, queue: [] };
    sessions.set(token, s);
    win.on('closed', () => { s.closed = true; setTimeout(() => sessions.delete(token), 30_000).unref(); });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    const dir = app.isPackaged ? join(process.resourcesPath, 'streamdeck', 'editor') : join(app.getAppPath(), '..', 'streamdeck-plugin', 'com.supernon0.multioutils.sdPlugin', 'ui');
    try { await win.loadFile(join(dir, 'ha.html'), { query: { largeEditor: '1' } }); }
    catch (error) { close(s); throw error; }
    win.show();
    return { token };
  });
  ctx.registerLocalRoute('GET', /^\/ha\/editor\/messages$/, (url) => {
    const s = sessions.get(url.searchParams.get('token') ?? '');
    if (!s) return { closed: true, messages: [] };
    const messages = s.queue.splice(0);
    if (s.closed) sessions.delete(s.token);
    return { messages, closed: !!s.closed };
  });
  ctx.registerLocalRoute('POST', /^\/ha\/editor\/reply$/, (_url, raw) => {
    const body = object(raw), s = sessions.get(String(body?.token ?? ''));
    if (!s || s.win.isDestroyed()) return { closed: true };
    if (body?.settings && object(body.settings)) {
      s.settings = object(body.settings)!;
      s.win.webContents.send('ha-key-editor:message', { event: 'didReceiveSettings', settings: s.settings });
    }
    if (body?.payload && object(body.payload)) s.win.webContents.send('ha-key-editor:message', { event: 'sendToPropertyInspector', payload: body.payload });
    return { ok: true };
  });
  ctx.registerLocalRoute('POST', /^\/ha\/editor\/close$/, (_url, raw) => {
    const s = sessions.get(String(object(raw)?.token ?? ''));
    if (s) close(s);
    return { ok: true };
  });
  return () => {
    for (const s of sessions.values()) if (!s.win.isDestroyed()) s.win.destroy();
    sessions.clear(); ipcMain.removeHandler('ha-key-editor:init'); ipcMain.removeListener('ha-key-editor:send', send);
  };
}
