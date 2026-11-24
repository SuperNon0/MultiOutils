import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedQuery } from '../core/query';
import type { KeywordTarget, ProviderItem } from '../core/engine';
import { createSpotifyProvider, SpotifyClient, type SpotifyTokens } from './spotify';
import type { LauncherEnv } from './env';

/** Faux Spotify : répond selon le chemin appelé, note les appels. */
function fakeSpotify(routes: Record<string, (url: URL, init?: RequestInit) => { status?: number; body?: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    const key = Object.keys(routes).find((k) => `${init?.method ?? 'GET'} ${url.pathname}`.startsWith(k));
    const r = key ? routes[key](url, init) : { status: 404, body: { error: { message: 'not found' } } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return calls;
}

const env = {
  t: (k: string, v?: Record<string, string | number>) => (v ? `${k} ${JSON.stringify(v)}` : k),
  settings: () => ({ spotify: { clientId: 'a'.repeat(32) } }),
  openExternal: vi.fn(async () => undefined),
  showMainWindow: vi.fn(),
  copyText: vi.fn()
} as unknown as LauncherEnv;

const tokens = (scope?: string): SpotifyTokens => ({ refresh: 'r', access: 'a', expires: Date.now() + 3600_000, scope });

function setup(scope = 'user-read-private playlist-read-private playlist-read-collaborative') {
  const client = new SpotifyClient(
    () => 'a'.repeat(32),
    { load: () => tokens(scope), save: () => undefined },
    async () => undefined
  );
  const provider = createSpotifyProvider(env, client);
  const query = (search: string): Promise<ProviderItem[]> =>
    provider.query({
      parsed: { keyword: 'sp', search } as unknown as ParsedQuery<KeywordTarget>,
      byKeyword: true,
      signal: new AbortController().signal
    }) as Promise<ProviderItem[]>;
  return { client, provider, query };
}

const page = (offset: number, names: string[], next: boolean) => ({
  items: names.map((n, i) => ({ name: n, uri: `spotify:playlist:${offset + i}`, owner: { display_name: 'Noë' }, tracks: { total: 10 } })),
  next: next ? 'more' : null
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Spotify : playlists dans le lanceur', () => {
  it('« sp pl » liste Titres likés puis toutes les pages de playlists, une seule fois', async () => {
    const calls = fakeSpotify({
      'GET /v1/me/playlists': (u) =>
        u.searchParams.get('offset') === '0'
          ? { body: page(0, ['Chill du soir', 'Sport'], true) }
          : { body: page(50, ['Rap FR'], false) },
      'GET /v1/me': () => ({ body: { id: 'noe', display_name: 'Noë' } })
    });
    const { query } = setup();
    const res = await query('pl');
    expect(res.map((r) => r.title)).toEqual(['launcher.spotify.liked', 'Chill du soir', 'Sport', 'Rap FR']);
    expect((res[0].data as { item: { uri: string } }).item.uri).toBe('spotify:user:noe:collection');
    await query('pl sport');
    expect(calls.filter((c) => c.startsWith('GET /v1/me/playlists'))).toHaveLength(2); // gardées en cache
  });

  it('filtre les playlists par nom', async () => {
    fakeSpotify({
      'GET /v1/me/playlists': () => ({ body: page(0, ['Chill du soir', 'Sport', 'Rap FR'], false) }),
      'GET /v1/me': () => ({ body: { id: 'noe' } })
    });
    const { query } = setup();
    const res = await query('pl chill');
    expect(res[0].title).toBe('Chill du soir');
    expect(res.map((r) => r.title)).not.toContain('Sport');
    const none = await query('pl zzzz');
    expect(none[0].title).toContain('launcher.spotify.noPlaylist');
  });

  it('une recherche met tes playlists en tête, sans doublon', async () => {
    fakeSpotify({
      'GET /v1/me/playlists': () => ({ body: page(0, ['Daft Punk best of', 'Sport'], false) }),
      'GET /v1/search': () => ({
        body: {
          tracks: { items: [{ name: 'One More Time', uri: 'spotify:track:9', artists: [{ name: 'Daft Punk' }] }] },
          playlists: { items: [{ name: 'Daft Punk best of', uri: 'spotify:playlist:0', owner: { display_name: 'Noë' } }] }
        }
      })
    });
    const { query } = setup();
    const res = await query('daft punk');
    expect(res.map((r) => r.title)).toEqual(['Daft Punk best of', 'One More Time']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
    expect(res[0].subtitle).toContain('launcher.spotify.kind.myPlaylist');
  });

  it("connexion d'avant 0.17 : demande de se reconnecter", async () => {
    const calls = fakeSpotify({});
    const { query, client } = setup('user-read-private user-modify-playback-state');
    expect(client.canListPlaylists).toBe(false);
    const res = await query('pl');
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('launcher.spotify.err.scope');
    expect(calls.filter((c) => c.includes('/playlists'))).toHaveLength(0);
  });

  it('« sp » seul propose Mes playlists', async () => {
    fakeSpotify({ 'GET /v1/me/player': () => ({ status: 204 }) });
    const { query, provider } = setup();
    const res = await query('');
    const it0 = res.find((r) => r.title === 'launcher.spotify.myPlaylists')!;
    expect(it0).toBeDefined();
    expect(await provider.execute(it0, 'primary' as never, '')).toEqual({ kind: 'query', text: 'sp pl ' });
  });

  it('Ctrl Entrée sur une playlist : aléatoire puis lecture', async () => {
    const calls = fakeSpotify({
      'GET /v1/me/playlists': () => ({ body: page(0, ['Sport'], false) }),
      'GET /v1/me': () => ({ body: { id: 'noe' } }),
      'PUT /v1/me/player/shuffle': () => ({ status: 204 }),
      'PUT /v1/me/player/play': () => ({ status: 204 })
    });
    const { query, provider } = setup();
    const res = await query('pl sport');
    const sport = res.find((r) => r.title === 'Sport')!;
    expect(await provider.execute(sport, 'secondary' as never, 'pl sport')).toEqual({ kind: 'hide' });
    expect(calls.slice(-2)).toEqual(['PUT /v1/me/player/shuffle?state=true', 'PUT /v1/me/player/play']);
  });
});
