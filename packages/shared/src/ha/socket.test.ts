import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { HaSocket, type WsCtor } from './socket';

interface FakeHa {
  url: string;
  calls: Array<Record<string, unknown>>;
  push(entity: string, state: string): void;
  dropAll(): void;
  close(): Promise<void>;
}

async function fakeHa(token = 'ok'): Promise<FakeHa> {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/api/websocket' });
  const calls: Array<Record<string, unknown>> = [];
  const subs = new Map<WebSocket, number>();
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      if (msg.type === 'auth') {
        ws.send(JSON.stringify({ type: msg.access_token === token ? 'auth_ok' : 'auth_invalid' }));
        return;
      }
      calls.push(msg);
      const reply = (result: unknown, success = true) => ws.send(JSON.stringify({ id: msg.id, type: 'result', success, result, ...(success ? {} : { error: { code: 'x', message: 'refusé' } }) }));
      if (msg.type === 'subscribe_events') {
        subs.set(ws, msg.id as number);
        reply(null);
      } else if (msg.type === 'get_states') reply([{ entity_id: 'light.a', state: 'off', attributes: {} }]);
      else if (msg.type === 'call_service') reply(msg.domain === 'bad' ? null : { context: {} }, msg.domain !== 'bad');
      else if (msg.type === 'render_template') {
        reply(null);
        ws.send(JSON.stringify({ id: msg.id, type: 'event', event: { result: `rendu:${msg.template}` } }));
      } else reply(null);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    push(entity, state) {
      for (const [ws, id] of subs) ws.send(JSON.stringify({ id, type: 'event', event: { data: { entity_id: entity, new_state: { entity_id: entity, state, attributes: {} } } } }));
    },
    dropAll() {
      for (const c of wss.clients) c.terminate();
    },
    close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); })
  };
}

const sockets: HaSocket[] = [];
const fakes: FakeHa[] = [];
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.stop());
  await Promise.all(fakes.splice(0).map((f) => f.close()));
});

const make = (urls: string[], token = 'ok'): HaSocket => {
  const s = new HaSocket({ urls: () => urls, token: () => token, WebSocket: WebSocket as unknown as WsCtor });
  sockets.push(s);
  return s;
};
const until = async (fn: () => boolean, ms = 3000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('délai dépassé');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('HaSocket', () => {
  it('se connecte, charge les états et suit les changements', async () => {
    const ha = await fakeHa();
    fakes.push(ha);
    const s = make([ha.url]);
    await s.ready();
    expect(s.getState('light.a')?.state).toBe('off');
    const v = s.version;
    ha.push('light.a', 'on');
    await until(() => s.getState('light.a')?.state === 'on');
    expect(s.version).toBeGreaterThan(v);
  });

  it('appelle un service, signale les erreurs et rend un modèle', async () => {
    const ha = await fakeHa();
    fakes.push(ha);
    const s = make([ha.url]);
    await s.callService('light', 'turn_on', { brightness_pct: 40 }, { entity_id: 'light.a' });
    expect(ha.calls.find((c) => c.type === 'call_service')).toMatchObject({ domain: 'light', service: 'turn_on', service_data: { brightness_pct: 40 }, target: { entity_id: 'light.a' } });
    await expect(s.callService('bad', 'x')).rejects.toThrow('refusé');
    expect(await s.renderTemplate('{{ 1 }}')).toBe('rendu:{{ 1 }}');
  });

  it('refuse un mauvais jeton', async () => {
    const ha = await fakeHa('bon');
    fakes.push(ha);
    const s = make([ha.url], 'mauvais');
    await expect(s.ready(3000)).rejects.toThrow('Jeton refusé');
    expect(s.state).toBe('auth_failed');
  });

  it('passe à l’adresse distante si la locale ne répond pas', async () => {
    const ha = await fakeHa();
    fakes.push(ha);
    const s = make(['http://127.0.0.1:1', ha.url]);
    await s.ready(6000);
    expect(s.base).toBe(ha.url);
  });

  it('se reconnecte après une coupure', async () => {
    const ha = await fakeHa();
    fakes.push(ha);
    const s = make([ha.url]);
    await s.ready();
    ha.dropAll();
    await until(() => s.state !== 'connected');
    await until(() => s.state === 'connected', 5000);
  });
});
