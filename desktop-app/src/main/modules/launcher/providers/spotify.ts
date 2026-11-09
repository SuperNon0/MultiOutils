/**
 * Plugin « Spotify » (API Web de Spotify, comme le plugin de Flow Launcher) :
 * recherche de titres / artistes / albums / playlists, lecture, file
 * d'attente, pause, suivant, volume… Connexion OAuth PKCE avec le Client ID
 * de ta propre appli Spotify ; le jeton est chiffré (safeStorage) côté main.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type { LauncherAction, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import {
  authorizeUrl,
  isClientId,
  parseCommand,
  parsePlayer,
  parseSearch,
  pkcePair,
  SPOTIFY_PORT,
  SPOTIFY_REDIRECT,
  type NowPlaying,
  type SpotifyCommand,
  type SpotifyItem
} from '../core/spotify';
import type { LauncherEnv } from './env';

export interface SpotifyTokens {
  refresh: string;
  access?: string;
  /** Expiration du jeton d'accès (ms). */
  expires?: number;
}

export class SpotifyError extends Error {
  constructor(
    readonly code: 'notConfigured' | 'notConnected' | 'noDevice' | 'premium' | 'api',
    message?: string
  ) {
    super(message ?? code);
  }
}

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyClient {
  private tokens: SpotifyTokens | null;
  private pending: http.Server | null = null;

  constructor(
    private clientId: () => string,
    private store: { load(): SpotifyTokens | null; save(t: SpotifyTokens | null): void },
    private openBrowser: (url: string) => Promise<void>
  ) {
    this.tokens = store.load();
  }

  get connected(): boolean {
    return !!this.tokens?.refresh;
  }

  disconnect(): void {
    this.tokens = null;
    this.store.save(null);
  }

  private async tokenRequest(params: Record<string, string>): Promise<void> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId().trim(), ...params }).toString(),
      signal: AbortSignal.timeout(10_000)
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      if (body.error === 'invalid_grant') this.disconnect();
      throw new SpotifyError('api', body.error_description || body.error || `HTTP ${res.status}`);
    }
    this.tokens = {
      refresh: body.refresh_token ?? this.tokens?.refresh ?? '',
      access: body.access_token,
      expires: Date.now() + (body.expires_in ?? 3600) * 1000 - 60_000
    };
    this.store.save(this.tokens);
  }

  /**
   * Ouvre la page de connexion de Spotify dans le navigateur et attend le
   * retour sur http://127.0.0.1:4378/callback (3 minutes au plus).
   */
  connect(): Promise<void> {
    const clientId = this.clientId().trim();
    if (!isClientId(clientId)) return Promise.reject(new SpotifyError('notConfigured'));
    this.pending?.close();
    const { verifier, challenge } = pkcePair();
    const state = randomBytes(12).toString('hex');
    return new Promise<void>((resolve, reject) => {
      const page = (ok: boolean, text: string): string =>
        `<!doctype html><meta charset="utf-8"><title>MultiOutils</title><body style="font:16px system-ui;background:#16151a;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><p>${ok ? '✓' : '✗'} ${text}</p></body>`;
      const server = http.createServer((req, res) => {
        const u = new URL(req.url ?? '/', SPOTIFY_REDIRECT);
        if (u.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const finish = (ok: boolean, text: string, err?: Error): void => {
          res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(ok, text));
          clearTimeout(timer);
          server.close();
          if (this.pending === server) this.pending = null;
          if (err) reject(err);
          else resolve();
        };
        const code = u.searchParams.get('code');
        if (u.searchParams.get('state') !== state || !code) {
          finish(false, 'Connexion refusée ou annulée.', new SpotifyError('api', u.searchParams.get('error') ?? 'cancelled'));
          return;
        }
        this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT, code_verifier: verifier })
          .then(() => finish(true, 'Spotify est connecté à MultiOutils. Tu peux fermer cet onglet.'))
          .catch((e: Error) => finish(false, `Échec : ${e.message}`, e));
      });
      const timer = setTimeout(() => {
        server.close();
        reject(new SpotifyError('api', 'timeout'));
      }, 180_000);
      server.on('error', (e) => {
        clearTimeout(timer);
        reject(new SpotifyError('api', e.message));
      });
      server.listen(SPOTIFY_PORT, '127.0.0.1', () => {
        this.pending = server;
        void this.openBrowser(authorizeUrl(clientId, challenge, state));
      });
    });
  }

  private async accessToken(): Promise<string> {
    if (!isClientId(this.clientId())) throw new SpotifyError('notConfigured');
    if (!this.tokens?.refresh) throw new SpotifyError('notConnected');
    if (!this.tokens.access || !this.tokens.expires || Date.now() > this.tokens.expires) {
      await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh });
    }
    return this.tokens!.access!;
  }

  async api(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const call = async (): Promise<Response> =>
      fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: signal ?? AbortSignal.timeout(8000)
      });
    let res = await call();
    if (res.status === 401 && this.tokens) {
      this.tokens.access = undefined;
      res = await call();
    }
    if (res.status === 204 || res.status === 202) return null;
    const json = (await res.json().catch(() => null)) as { error?: { message?: string; reason?: string } } | null;
    if (res.ok) return json;
    const reason = json?.error?.reason ?? '';
    if (res.status === 404 && /NO_ACTIVE_DEVICE/.test(reason + (json?.error?.message ?? ''))) throw new SpotifyError('noDevice');
    if (res.status === 404 && /device/i.test(json?.error?.message ?? '')) throw new SpotifyError('noDevice');
    if (res.status === 403 && /PREMIUM/i.test(reason + (json?.error?.message ?? ''))) throw new SpotifyError('premium');
    throw new SpotifyError('api', json?.error?.message ?? `HTTP ${res.status}`);
  }

  async me(): Promise<string> {
    const b = (await this.api('GET', '/me')) as { display_name?: string; id?: string } | null;
    return b?.display_name || b?.id || '';
  }

  async player(): Promise<NowPlaying | null> {
    return parsePlayer(await this.api('GET', '/me/player'));
  }

  async search(q: string, signal: AbortSignal): Promise<SpotifyItem[]> {
    const p = new URLSearchParams({ q, type: 'track,artist,album,playlist', limit: '4' });
    return parseSearch(await this.api('GET', `/search?${p.toString()}`, undefined, signal));
  }

  play(item?: SpotifyItem): Promise<unknown> {
    if (!item) return this.api('PUT', '/me/player/play');
    return this.api('PUT', '/me/player/play', item.kind === 'track' ? { uris: [item.uri] } : { context_uri: item.uri });
  }

  queue(uri: string): Promise<unknown> {
    return this.api('POST', `/me/player/queue?uri=${encodeURIComponent(uri)}`);
  }

  async command(c: SpotifyCommand, now: NowPlaying | null): Promise<unknown> {
    switch (c.cmd) {
      case 'play':
        return this.api('PUT', '/me/player/play');
      case 'pause':
        return this.api('PUT', '/me/player/pause');
      case 'next':
        return this.api('POST', '/me/player/next');
      case 'prev':
        return this.api('POST', '/me/player/previous');
      case 'shuffle':
        return this.api('PUT', `/me/player/shuffle?state=${!(now?.shuffle ?? false)}`);
      case 'repeat': {
        const next = now?.repeat === 'off' ? 'context' : now?.repeat === 'context' ? 'track' : 'off';
        return this.api('PUT', `/me/player/repeat?state=${next}`);
      }
      case 'volume':
        return this.api('PUT', `/me/player/volume?volume_percent=${c.value}`);
    }
  }
}

const KIND_ICON: Record<SpotifyItem['kind'], string> = { track: 'play', artist: 'user', album: 'layers', playlist: 'list' };

type Data =
  | { type: 'item'; item: SpotifyItem }
  | { type: 'cmd'; cmd: SpotifyCommand }
  | { type: 'toggle'; playing: boolean }
  | { type: 'setup' };

export function createSpotifyProvider(env: LauncherEnv, client: SpotifyClient): Provider {
  const errMsg = (e: unknown): string => {
    if (e instanceof SpotifyError && e.code !== 'api') return env.t(`launcher.spotify.err.${e.code}`);
    return `Spotify : ${e instanceof Error ? e.message : String(e)}`;
  };

  /** Lecture ; sans appareil actif (ou sans Premium) : ouvre dans l'appli Spotify. */
  const playItem = async (item: SpotifyItem): Promise<LauncherOutcome> => {
    try {
      await client.play(item);
    } catch (e) {
      if (e instanceof SpotifyError && (e.code === 'noDevice' || e.code === 'premium')) {
        await env.openExternal(item.uri);
        return { kind: 'hide' };
      }
      return { kind: 'error', message: errMsg(e) };
    }
    return { kind: 'hide' };
  };

  const runCmd = async (cmd: SpotifyCommand): Promise<LauncherOutcome> => {
    try {
      const now = cmd.cmd === 'shuffle' || cmd.cmd === 'repeat' ? await client.player() : null;
      await client.command(cmd, now);
      return { kind: 'hide' };
    } catch (e) {
      return { kind: 'error', message: errMsg(e) };
    }
  };

  const queueItem = async (item: SpotifyItem): Promise<LauncherOutcome> => {
    try {
      await client.queue(item.uri);
      return { kind: 'hide' };
    } catch (e) {
      return { kind: 'error', message: errMsg(e) };
    }
  };

  const setupItem = (e: unknown): ProviderItem => ({
    title: errMsg(e),
    subtitle: env.t('launcher.spotify.setupSub'),
    icon: { kind: 'sprite', name: 'alert' },
    score: 100,
    noRecord: true,
    data: { type: 'setup' } satisfies Data
  });

  const cmdItem = (cmd: SpotifyCommand, icon: string, score = 300): ProviderItem => ({
    title: cmd.cmd === 'volume' ? env.t('launcher.spotify.cmd.volume', { n: cmd.value }) : env.t(`launcher.spotify.cmd.${cmd.cmd}`),
    subtitle: 'Spotify',
    icon: { kind: 'sprite', name: icon },
    score,
    noRecord: true,
    data: { type: 'cmd', cmd } satisfies Data
  });

  return {
    id: 'spotify',
    global: false,
    async query({ parsed, signal }: ProviderQuery): Promise<ProviderItem[]> {
      const text = parsed.search;
      if (!client.connected) return [setupItem(new SpotifyError(isClientId(env.settings().spotify.clientId) ? 'notConnected' : 'notConfigured'))];
      try {
        // « sp » seul : ce qui joue + les commandes
        if (!text) {
          const now = await client.player().catch(() => null);
          const out: ProviderItem[] = [];
          if (now) {
            out.push({
              title: now.name,
              subtitle: `${now.detail}${now.device ? ` · ${now.device}` : ''} — ${env.t(now.playing ? 'launcher.spotify.cmd.pause' : 'launcher.spotify.cmd.play')}`,
              icon: { kind: 'sprite', name: now.playing ? 'play' : 'clock' },
              score: 1000,
              noRecord: true,
              data: { type: 'toggle', playing: now.playing } satisfies Data
            });
          }
          out.push(
            cmdItem({ cmd: 'next' }, 'chev', 500),
            cmdItem({ cmd: 'prev' }, 'chevl', 490),
            cmdItem({ cmd: 'shuffle' }, 'dice', 480),
            cmdItem({ cmd: 'repeat' }, 'refresh', 470)
          );
          return out;
        }
        const cmd = parseCommand(text);
        if (cmd) return [cmdItem(cmd, cmd.cmd === 'pause' ? 'clock' : 'play', 2000)];
        const items = await client.search(text, signal);
        return items.map((item, i) => ({
          title: item.name,
          subtitle: [env.t(`launcher.spotify.kind.${item.kind}`), item.detail].filter(Boolean).join(' · '),
          icon: { kind: 'sprite', name: KIND_ICON[item.kind] },
          // l'ordre de Spotify est déjà le bon (pertinence)
          score: 900 - i,
          recordKey: item.uri,
          secondary: item.kind === 'track' ? env.t('launcher.spotify.queue') : undefined,
          data: { type: 'item', item } satisfies Data
        }));
      } catch (e) {
        if (signal.aborted) return [];
        return [setupItem(e)];
      }
    },
    async execute(it, mode): Promise<LauncherOutcome> {
      const d = it.data as Data;
      if (d.type === 'setup') {
        env.showMainWindow({ view: 'settings', section: 'launcher' });
        return { kind: 'hide' };
      }
      if (d.type === 'cmd') return runCmd(d.cmd);
      if (d.type === 'toggle') return runCmd({ cmd: d.playing ? 'pause' : 'play' });
      if (mode === 'secondary' && d.item.kind === 'track') return queueItem(d.item);
      return playItem(d.item);
    },
    actions(it): LauncherAction[] {
      const d = it.data as Data;
      if (d.type !== 'item') return [];
      const list: LauncherAction[] = [{ id: 'play', title: env.t('launcher.spotify.play'), icon: 'play', hint: 'Entrée' }];
      if (d.item.kind === 'track') list.push({ id: 'queue', title: env.t('launcher.spotify.queue'), icon: 'listplus', hint: 'Ctrl Entrée' });
      list.push({ id: 'open', title: env.t('launcher.spotify.open'), icon: 'external' });
      if (d.item.url) list.push({ id: 'copy', title: env.t('launcher.action.copyUrl'), icon: 'copy' });
      return list;
    },
    async runAction(it, actionId): Promise<LauncherOutcome> {
      const d = it.data as Data;
      if (d.type !== 'item') return { kind: 'hide' };
      if (actionId === 'queue') return queueItem(d.item);
      if (actionId === 'open') {
        await env.openExternal(d.item.uri);
        return { kind: 'hide' };
      }
      if (actionId === 'copy' && d.item.url) {
        env.copyText(d.item.url);
        return { kind: 'hide' };
      }
      return playItem(d.item);
    }
  };
}
