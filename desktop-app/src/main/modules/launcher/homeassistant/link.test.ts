/**
 * Liaison testée contre un faux Home Assistant (HTTP + WebSocket) : enregistrement,
 * abonnement « local push », confirmation, boutons, capteurs, reconnexion.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { HaRegistration } from '../core/ha-link';
import { HaLink, type HaLinkCoreStatus } from './link';

interface FakeHa {
  base: string;
  requests: Array<{ path: string; body: unknown }>;
  sockets: WebSocket[];
  confirms: string[];
  scripts: Set<string>;
  push(event: Record<string, unknown>): void;
  close(): Promise<void>;
}

async function fakeHa(): Promise<FakeHa> {
  const requests: FakeHa['requests'] = [];
  const sockets: WebSocket[] = [];
  const confirms: string[] = [];
  const scripts = new Set<string>(['pc_verrouiller']); // déjà présent : ne doit pas être écrasé
  const subs = new Map<WebSocket, number>();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: `${req.method} ${req.url}`, body });
      const authed = req.headers.authorization === 'Bearer jeton';
      if (req.url === '/api/mobile_app/registrations') {
        if (!authed) return void res.writeHead(401).end();
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ webhook_id: 'wh1', cloudhook_url: null }));
        return;
      }
      const script = req.url?.match(/^\/api\/config\/script\/config\/(\w+)$/);
      if (script) {
        if (!authed) return void res.writeHead(401).end();
        if (req.method === 'GET') return void res.writeHead(scripts.has(script[1]) ? 200 : 404).end('{}');
        scripts.add(script[1]);
        return void res.writeHead(200).end('{"result":"ok"}');
      }
      if (req.url === '/api/webhook/wh1') return void res.writeHead(200).end('{}');
      res.writeHead(404).end();
    });
  });
  const wss = new WebSocketServer({ server, path: '/api/websocket' });
  wss.on('connection', (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (m) => {
      const msg = JSON.parse(m.toString());
      if (msg.type === 'auth') {
        ws.send(JSON.stringify({ type: msg.access_token === 'jeton' ? 'auth_ok' : 'auth_invalid' }));
      } else if (msg.type === 'mobile_app/push_notification_channel') {
        subs.set(ws, msg.id);
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: msg.webhook_id === 'wh1', result: null }));
      } else if (msg.type === 'mobile_app/push_notification_confirm') {
        confirms.push(msg.confirm_id);
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true }));
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ id: msg.id, type: 'pong' }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    sockets,
    confirms,
    scripts,
    push(event) {
      for (const [ws, id] of subs) if (ws.readyState === 1) ws.send(JSON.stringify({ id, type: 'event', event }));
    },
    close: () =>
      new Promise((r) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        server.close(() => r());
      })
  };
}

const waitFor = async (fn: () => boolean, ms = 5000): Promise<void> => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé');
    await new Promise((r) => setTimeout(r, 20));
  }
};

let cleanup: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanup.reverse()) await c();
  cleanup = [];
});

function makeLink(ha: FakeHa, token = 'jeton') {
  let reg: HaRegistration | null = null;
  const pushes: unknown[] = [];
  const statuses: HaLinkCoreStatus[] = [];
  const link = new HaLink({
    url: () => ha.base,
    token: () => token,
    device: () => ({
      deviceId: 'dev',
      deviceName: 'PC',
      appVersion: '0.8.0',
      manufacturer: 'MultiOutils',
      model: 'PC Windows',
      osName: 'Windows',
      osVersion: '10'
    }),
    loadRegistration: () => reg,
    saveRegistration: (r) => (reg = r),
    sensors: () => Promise.resolve({ cpu_usage: 12, active: true }),
    sensorInterval: () => 600,
    buttons: () => ({ powerCommands: true }),
    onPush: (m) => pushes.push(m),
    onStatus: (s) => statuses.push(s),
    log: () => undefined
  });
  cleanup.push(() => link.stop(false));
  return { link, pushes, statuses, reg: () => reg };
}

describe('HaLink contre un faux Home Assistant', () => {
  it('s\'enregistre, reçoit et confirme les notifications, crée les boutons', async () => {
    const ha = await fakeHa();
    cleanup.push(() => ha.close());
    const { link, pushes, reg } = makeLink(ha);
    link.start();
    await waitFor(() => link.status().state === 'connected');
    expect(reg()?.webhook_id).toBe('wh1');
    expect(link.status().notifyService).toBe('notify.mobile_app_pc');

    ha.push({ message: 'Le linge est prêt', title: 'Lessive', hass_confirm_id: 'c1' });
    await waitFor(() => pushes.length === 1 && ha.confirms.includes('c1'));
    expect(pushes[0]).toMatchObject({ title: 'Lessive' });

    // boutons : 3 créés, celui qui existait gardé tel quel
    await waitFor(() => link.buttonIds().length === 4);
    const posted = ha.requests.filter((r) => r.path.startsWith('POST /api/config/script/config/')).map((r) => r.path);
    expect(posted).toEqual([
      'POST /api/config/script/config/pc_veille',
      'POST /api/config/script/config/pc_eteindre',
      'POST /api/config/script/config/pc_redemarrer'
    ]);

    // capteurs enregistrés puis envoyés
    await waitFor(() => ha.requests.some((r) => (r.body as { type?: string })?.type === 'update_sensor_states'));
    const regs = ha.requests.filter((r) => (r.body as { type?: string })?.type === 'register_sensor');
    expect(regs.length).toBeGreaterThan(0);

    // bouton d'une pop-up → événement HA
    await link.fireAction('LESSIVE_VUE', { tag: 'lessive' });
    const fired = ha.requests.find((r) => (r.body as { type?: string })?.type === 'fire_event');
    expect(fired?.body).toEqual({
      type: 'fire_event',
      data: { event_type: 'mobile_app_notification_action', event_data: { action: 'LESSIVE_VUE', tag: 'lessive' } }
    });
  });

  it('se reconnecte tout seul quand la connexion tombe', async () => {
    const ha = await fakeHa();
    cleanup.push(() => ha.close());
    const { link } = makeLink(ha);
    link.start();
    await waitFor(() => link.status().state === 'connected');
    ha.sockets[0].terminate();
    await waitFor(() => link.status().state === 'error');
    await waitFor(() => link.status().state === 'connected', 6000);
    expect(ha.sockets.length).toBe(2);
    // un seul enregistrement malgré la reconnexion
    expect(ha.requests.filter((r) => r.path === 'POST /api/mobile_app/registrations')).toHaveLength(1);
  }, 10_000);

  it('jeton refusé : erreur claire, pas de boucle', async () => {
    const ha = await fakeHa();
    cleanup.push(() => ha.close());
    const { link } = makeLink(ha, 'mauvais');
    link.start();
    await waitFor(() => link.status().state === 'error');
    expect(link.status().error).toBe('unauthorized');
    await new Promise((r) => setTimeout(r, 2300));
    expect(ha.requests.filter((r) => r.path === 'POST /api/mobile_app/registrations')).toHaveLength(1);
  }, 6000);
});
