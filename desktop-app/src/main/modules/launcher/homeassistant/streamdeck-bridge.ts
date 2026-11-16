/**
 * Pont Home Assistant pour le plugin Stream Deck : l'app garde UNE connexion
 * WebSocket à HA (adresse + jeton chiffré déjà réglés dans MultiOutils) et la
 * met à disposition du plugin par le service local (127.0.0.1:41320). Le
 * jeton ne quitte jamais l'app.
 *
 *   GET  /ha/status             état de la connexion
 *   GET  /ha/catalog            entités (nom, pièce, étage), pièces, étages
 *   GET  /ha/services           services et leurs champs (en français si HA les a)
 *   GET  /ha/states?ids=a,b     états courants
 *   GET  /ha/wait?since=n&ids=  attente longue d'un changement (25 s max)
 *   GET  /ha/icons?names=mdi:a  tracés SVG des icônes Material Design
 *   GET  /ha/image?src=…        image HA (caméra, pochette) réduite, en data URL
 *   POST /ha/call               { domain, service, data?, target? }
 *   POST /ha/event              { type, data? }
 *   POST /ha/template           { template }
 *   POST /ha/camera/open        { id } : la caméra en grand dans une fenêtre
 */
import { BrowserWindow, nativeImage } from 'electron';
import WebSocket from 'ws';
import * as mdi from '@mdi/js';
import { HaSocket, cleanHaUrl, type WsCtor } from '@multioutils/shared/src/ha/socket';
import { buildCatalog, mdiExportName, normalizeServices, type HaCatalog, type HaServiceInfo } from '@multioutils/shared/src/ha/model';
import type { MainHostContext } from '../../../module-registry';
import type { HaSettings } from '../../../../common/launcher';

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const WAIT_MAX_MS = 25_000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export interface HaCallLog {
  at: number;
  what: string;
  ok: boolean;
  error?: string;
}

export interface StreamDeckBridge {
  /** Adresse ou jeton changés : on se reconnecte. */
  restart(): void;
  /** Sortie de veille. */
  nudge(): void;
  log(): HaCallLog[];
  dispose(): void;
}

interface Deps {
  ctx: MainHostContext;
  settings(): HaSettings;
  token(): string | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export function createStreamDeckBridge(deps: Deps): StreamDeckBridge {
  const urls = (): string[] => [deps.settings().url, deps.settings().remoteUrl].filter((u) => !!cleanHaUrl(u));
  const socket = new HaSocket({ urls, token: deps.token, WebSocket: WebSocket as unknown as WsCtor });
  const calls: HaCallLog[] = [];
  let catalogCache: { at: number; value: HaCatalog } | null = null;
  let servicesCache: { at: number; value: HaServiceInfo[] } | null = null;
  const waiters = new Set<() => void>();
  let cameraWin: BrowserWindow | null = null;

  socket.onChange(() => {
    for (const w of [...waiters]) w();
  });
  socket.onStatus(() => {
    for (const w of [...waiters]) w();
  });

  const configured = (): boolean => urls().length > 0 && !!deps.token();

  const remember = (what: string, ok: boolean, error?: string): void => {
    calls.unshift({ at: Date.now(), what, ok, error });
    calls.length = Math.min(calls.length, 100);
  };

  const status = () => ({
    configured: configured(),
    state: socket.state,
    base: socket.base,
    version: socket.version
  });

  const pick = (ids: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const id of ids) {
      const s = socket.getState(id);
      if (s) out[id] = s;
    }
    return out;
  };
  const idsOf = (url: URL): string[] =>
    str(url.searchParams.get('ids'))
      .split(',')
      .map((x) => x.trim())
      .filter((x) => ENTITY_ID.test(x))
      .slice(0, 200);

  const catalog = async (): Promise<HaCatalog> => {
    if (catalogCache && Date.now() - catalogCache.at < 60_000 && catalogCache.value.entities.length) return catalogCache.value;
    await socket.ready();
    const soft = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined);
    const [entities, devices, areas, floors] = await Promise.all([
      soft(socket.command<unknown[]>({ type: 'config/entity_registry/list' })),
      soft(socket.command<unknown[]>({ type: 'config/device_registry/list' })),
      soft(socket.command<unknown[]>({ type: 'config/area_registry/list' })),
      soft(socket.command<unknown[]>({ type: 'config/floor_registry/list' }))
    ]);
    const value = buildCatalog(socket.allStates(), {
      entities: Array.isArray(entities) ? (entities as never) : [],
      devices: Array.isArray(devices) ? (devices as never) : [],
      areas: Array.isArray(areas) ? (areas as never) : [],
      floors: Array.isArray(floors) ? (floors as never) : []
    });
    catalogCache = { at: Date.now(), value };
    return value;
  };

  const services = async (): Promise<HaServiceInfo[]> => {
    if (servicesCache && Date.now() - servicesCache.at < 5 * 60_000) return servicesCache.value;
    const raw = await socket.command<unknown>({ type: 'get_services' });
    const list = normalizeServices(raw);
    // noms et descriptions en français quand HA les fournit
    try {
      const tr = await socket.command<{ resources?: Record<string, string> }>({
        type: 'frontend/get_translations',
        language: deps.ctx.i18n.language,
        category: 'services'
      });
      const r = tr?.resources ?? {};
      for (const s of list) {
        const k = `component.${s.domain}.services.${s.service}`;
        if (r[`${k}.name`]) s.name = r[`${k}.name`];
        if (r[`${k}.description`]) s.description = r[`${k}.description`];
        for (const f of s.fields) {
          if (r[`${k}.fields.${f.key}.name`]) f.name = r[`${k}.fields.${f.key}.name`];
          if (r[`${k}.fields.${f.key}.description`]) f.description = r[`${k}.fields.${f.key}.description`];
        }
      }
    } catch {
      /* anciennes versions de HA : noms anglais */
    }
    servicesCache = { at: Date.now(), value: list };
    return list;
  };

  const wait = (url: URL): Promise<unknown> => {
    socket.start();
    const since = Number(url.searchParams.get('since') ?? '-1');
    const ids = idsOf(url);
    const reply = () => ({ ...status(), states: pick(ids) });
    if (socket.version !== since && socket.state === 'connected') return Promise.resolve(reply());
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        waiters.delete(check);
        resolve(reply());
      };
      const check = (): void => {
        if (socket.version !== since || socket.state !== 'connected') finish();
      };
      const timer = setTimeout(finish, WAIT_MAX_MS);
      waiters.add(check);
    });
  };

  const icons = (url: URL): Record<string, string> => {
    const out: Record<string, string> = {};
    const lib = mdi as unknown as Record<string, string>;
    for (const name of str(url.searchParams.get('names')).split(',').slice(0, 100)) {
      const key = mdiExportName(name);
      if (key && typeof lib[key] === 'string') out[name] = lib[key];
    }
    return out;
  };

  /** Image HA (chemin /api/… ou camera.x) → data URL réduite. */
  const image = async (url: URL): Promise<{ image: string } | { error: string }> => {
    await socket.ready();
    const base = socket.base;
    const token = deps.token();
    if (!base || !token) return { error: 'non configuré' };
    const src = str(url.searchParams.get('src'));
    let path: string;
    if (ENTITY_ID.test(src) && src.startsWith('camera.')) path = `/api/camera_proxy/${src}`;
    else if (src.startsWith('/api/') && !src.includes('..')) path = src;
    else return { error: 'image refusée' };
    const size = Math.max(32, Math.min(400, Number(url.searchParams.get('size')) || 144));
    const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > IMAGE_MAX_BYTES) return { error: 'image trop lourde' };
    let img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { error: 'image illisible' };
    // recadrage carré centré, puis réduction
    const { width, height } = img.getSize();
    const side = Math.min(width, height);
    img = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: size, height: size, quality: 'good' });
    return { image: `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}` };
  };

  const openCamera = async (body: unknown): Promise<unknown> => {
    const id = str(obj(body)?.id);
    if (!ENTITY_ID.test(id) || !id.startsWith('camera.')) throw new Error('caméra inconnue');
    await socket.ready();
    const st = socket.getState(id);
    const accessToken = str(st?.attributes?.access_token);
    if (!socket.base || !accessToken) throw new Error('caméra indisponible');
    const name = str(st?.attributes?.friendly_name) || id;
    const stream = `${socket.base}/api/camera_proxy_stream/${id}?token=${encodeURIComponent(accessToken)}`;
    const html =
      `<!doctype html><meta charset="utf-8"><title>${name.replace(/[<&]/g, '')}</title>` +
      `<style>html,body{margin:0;height:100%;background:#000;display:grid;place-items:center}img{max-width:100%;max-height:100%}</style>` +
      `<img src="${stream.replace(/"/g, '&quot;')}" alt="">`;
    if (!cameraWin || cameraWin.isDestroyed()) {
      cameraWin = new BrowserWindow({ width: 960, height: 560, backgroundColor: '#000000', autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
      cameraWin.on('closed', () => (cameraWin = null));
    }
    await cameraWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    cameraWin.show();
    cameraWin.focus();
    return { ok: true };
  };

  const call = async (body: unknown): Promise<unknown> => {
    const b = obj(body) ?? {};
    const domain = str(b.domain);
    const service = str(b.service);
    if (!/^[a-z0-9_]+$/.test(domain) || !/^[a-z0-9_]+$/.test(service)) throw new Error('service invalide');
    const what = `${domain}.${service}${obj(b.target)?.entity_id ? ` → ${String(obj(b.target)?.entity_id)}` : ''}`;
    try {
      await socket.callService(domain, service, obj(b.data), obj(b.target));
      remember(what, true);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      remember(what, false, msg);
      throw e;
    }
  };

  const { ctx } = deps;
  const route = ctx.registerLocalRoute;
  route('GET', /^\/ha\/status$/, () => {
    if (configured()) socket.start();
    return status();
  });
  route('GET', /^\/ha\/catalog$/, () => catalog());
  route('GET', /^\/ha\/services$/, () => services());
  route('GET', /^\/ha\/states$/, async (url) => {
    await socket.ready().catch(() => undefined);
    return { ...status(), states: pick(idsOf(url)) };
  });
  route('GET', /^\/ha\/wait$/, (url) => wait(url));
  route('GET', /^\/ha\/icons$/, (url) => icons(url));
  route('GET', /^\/ha\/image$/, (url) => image(url));
  route('POST', /^\/ha\/call$/, (_u, body) => call(body));
  route('POST', /^\/ha\/event$/, async (_u, body) => {
    const b = obj(body) ?? {};
    const type = str(b.type);
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(type)) throw new Error('événement invalide');
    try {
      await socket.fireEvent(type, obj(b.data));
      remember(`événement ${type}`, true);
    } catch (e) {
      remember(`événement ${type}`, false, e instanceof Error ? e.message : String(e));
      throw e;
    }
    return { ok: true };
  });
  route('POST', /^\/ha\/template$/, async (_u, body) => {
    const template = str(obj(body)?.template).slice(0, 4000);
    if (!template.trim()) return { result: '' };
    return { result: await socket.renderTemplate(template) };
  });
  route('POST', /^\/ha\/camera\/open$/, (_u, body) => openCamera(body));

  return {
    restart() {
      catalogCache = null;
      servicesCache = null;
      const was = socket.state !== 'off';
      socket.stop();
      if (was && configured()) socket.start();
    },
    nudge: () => socket.nudge(),
    log: () => calls,
    dispose() {
      socket.stop();
      for (const w of [...waiters]) w();
      if (cameraWin && !cameraWin.isDestroyed()) cameraWin.destroy();
    }
  };
}
