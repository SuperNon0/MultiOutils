/**
 * Spotify (Web API) : connexion OAuth « PKCE » (aucun secret à saisir), et
 * lecture des réponses de recherche. Sans dépendance Electron : testé par vitest.
 */
import { createHash, randomBytes } from 'node:crypto';

/** Port fixe : l'adresse de retour doit être déclarée telle quelle chez Spotify. */
export const SPOTIFY_PORT = 4378;
export const SPOTIFY_REDIRECT = `http://127.0.0.1:${SPOTIFY_PORT}/callback`;
export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private'
];

const b64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function authorizeUrl(clientId: string, challenge: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES.join(' '),
    state
  });
  return `https://accounts.spotify.com/authorize?${p.toString()}`;
}

/** Client ID d'une appli Spotify : 32 caractères hexadécimaux. */
export const isClientId = (v: string): boolean => /^[0-9a-f]{32}$/i.test(v.trim());

export type SpotifyKind = 'track' | 'artist' | 'album' | 'playlist';

export interface SpotifyItem {
  kind: SpotifyKind;
  uri: string;
  name: string;
  /** Artistes, propriétaire de la playlist… */
  detail: string;
  url?: string;
}

interface Named {
  name?: string;
  uri?: string;
  external_urls?: { spotify?: string };
  artists?: Array<{ name?: string }>;
  owner?: { display_name?: string };
  album?: { name?: string };
}

const artists = (x: Named): string => (x.artists ?? []).map((a) => a.name).filter(Boolean).join(', ');

/** Réponse de GET /v1/search → éléments, dans l'ordre titres, artistes, albums, playlists. */
export function parseSearch(body: unknown): SpotifyItem[] {
  const b = (body ?? {}) as Record<string, { items?: Array<Named | null> } | undefined>;
  const out: SpotifyItem[] = [];
  const add = (kind: SpotifyKind, key: string, detail: (x: Named) => string): void => {
    for (const x of b[key]?.items ?? []) {
      if (!x || !x.uri || !x.name) continue;
      out.push({ kind, uri: x.uri, name: x.name, detail: detail(x), url: x.external_urls?.spotify });
    }
  };
  add('track', 'tracks', (x) => [artists(x), x.album?.name].filter(Boolean).join(' · '));
  add('artist', 'artists', () => '');
  add('album', 'albums', artists);
  add('playlist', 'playlists', (x) => x.owner?.display_name ?? '');
  return out;
}

export interface NowPlaying {
  playing: boolean;
  name: string;
  detail: string;
  shuffle?: boolean;
  repeat?: string;
  volume?: number;
  device?: string;
}

/** Réponse de GET /v1/me/player (204 = rien en cours → null). */
export function parsePlayer(body: unknown): NowPlaying | null {
  const b = body as {
    is_playing?: boolean;
    item?: Named & { show?: { name?: string } };
    shuffle_state?: boolean;
    repeat_state?: string;
    device?: { name?: string; volume_percent?: number | null };
  } | null;
  if (!b || !b.item?.name) return null;
  return {
    playing: !!b.is_playing,
    name: b.item.name,
    detail: artists(b.item) || b.item.show?.name || '',
    shuffle: b.shuffle_state,
    repeat: b.repeat_state,
    volume: b.device?.volume_percent ?? undefined,
    device: b.device?.name
  };
}

export type SpotifyCommand =
  | { cmd: 'play' | 'pause' | 'next' | 'prev' | 'shuffle' | 'repeat' }
  | { cmd: 'volume'; value: number };

/** Commandes tapées après le mot-clé (« sp pause », « sp vol 40 »…). */
export function parseCommand(text: string): SpotifyCommand | null {
  const t = text.trim().toLowerCase();
  const vol = /^(?:vol|volume|son)\s+(\d{1,3})%?$/.exec(t);
  if (vol) return { cmd: 'volume', value: Math.min(100, Number(vol[1])) };
  const words: Record<string, SpotifyCommand['cmd']> = {
    play: 'play', lecture: 'play', reprendre: 'play',
    pause: 'pause', stop: 'pause',
    next: 'next', suivant: 'next', suivante: 'next', skip: 'next',
    prev: 'prev', previous: 'prev', précédent: 'prev', precedent: 'prev', précédente: 'prev',
    shuffle: 'shuffle', aléatoire: 'shuffle', aleatoire: 'shuffle',
    repeat: 'repeat', répéter: 'repeat', repeter: 'repeat', boucle: 'repeat'
  };
  const c = words[t];
  return c ? ({ cmd: c } as SpotifyCommand) : null;
}
