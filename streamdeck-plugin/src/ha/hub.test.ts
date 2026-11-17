import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { HaHub } from './hub';

// Pas d'app MultiOutils dans les tests : le port 41320 ne répond pas, le hub
// passe donc en connexion directe.
const servers: Array<() => void> = [];
afterEach(() => servers.splice(0).forEach((c) => c()));

async function fakeHa(): Promise<{ url: string; calls: Array<Record<string, unknown>> }> {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/api/websocket' });
  const calls: Array<Record<string, unknown>> = [];
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'auth') return ws.send(JSON.stringify({ type: 'auth_ok' }));
      calls.push(msg);
      const result = msg.type === 'get_states' ? [{ entity_id: 'light.a', state: 'on', attributes: { friendly_name: 'Lampe' } }] : null;
      ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(() => {
    for (const c of wss.clients) c.terminate();
    wss.close();
    server.close();
  });
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, calls };
}

describe('HaHub en connexion directe', () => {
  it('suit une entité et appelle un service sans l’app', async () => {
    const ha = await fakeHa();
    const hub = new HaHub();
    hub.setDirect({ url: ha.url, token: 'x' });
    const seen: Array<string[] | null> = [];
    hub.onChange((ids) => seen.push(ids));
    hub.watch('light.a');
    const t = Date.now();
    while (hub.get('light.a')?.state !== 'on') {
      if (Date.now() - t > 8000) throw new Error('pas d’état');
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(hub.status.mode).toBe('direct');
    await hub.call('light', 'turn_off', undefined, { entity_id: 'light.a' });
    expect(ha.calls.find((c) => c.type === 'call_service')).toMatchObject({ domain: 'light', service: 'turn_off' });
    const cat = await hub.catalog();
    expect(cat.entities[0]).toMatchObject({ id: 'light.a', name: 'Lampe' });
  }, 15000);
});
