import { describe, expect, it } from 'vitest';
import { aliasUrl, matchAliases } from '../providers/aliases';
import { haBaseUrl, haService, isControllable, splitHaAction } from './homeassistant';
import { sanitizeAliases, sanitizeLauncherSettings } from './settings';
import { parseAppManifest, parseLibraryFolders, steamRunUrl } from './steam';

describe('raccourcis', () => {
  const aliases = sanitizeAliases([
    { id: 'a', keyword: 'yt', name: 'YouTube', target: 'https://www.youtube.com', enabled: true },
    { id: 'b', keyword: 'w', name: '', target: 'https://fr.wikipedia.org/wiki/{q}', enabled: true },
    { id: 'c', keyword: 'nas', name: '', target: '\\\\NAS\\partage', enabled: true },
    { id: 'd', keyword: 'off', name: '', target: 'https://x.y', enabled: false },
    { keyword: '', target: 'https://vide' }
  ]);

  it('nettoie la liste', () => {
    expect(aliases.map((a) => a.keyword)).toEqual(['yt', 'w', 'nas', 'off']);
    expect(sanitizeLauncherSettings({}).aliases).toEqual([]);
  });

  it('mot-clé exact en tête, préfixe en suggestion, désactivé ignoré', () => {
    expect(matchAliases(aliases, 'YT')).toEqual([expect.objectContaining({ open: 'https://www.youtube.com', exact: true })]);
    expect(matchAliases(aliases, 'y')[0]).toMatchObject({ exact: false });
    expect(matchAliases(aliases, 'off')).toEqual([]);
  });

  it('{q} reçoit le texte tapé après le mot-clé', () => {
    expect(matchAliases(aliases, 'w tour eiffel')[0].open).toBe('https://fr.wikipedia.org/wiki/tour%20eiffel');
  });

  it('distingue adresse et chemin', () => {
    expect(aliasUrl('https://a.b')).toBe('https://a.b');
    expect(aliasUrl('steam://rungameid/1')).toBe('steam://rungameid/1');
    expect(aliasUrl('youtube.com')).toBe('https://youtube.com');
    expect(aliasUrl('C:\\Jeux')).toBeNull();
    expect(aliasUrl('\\\\NAS\\partage')).toBeNull();
  });
});

describe('steam', () => {
  it('lit libraryfolders.vdf (nouveau et ancien format)', () => {
    const vdf = `"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "730" "123" } }
  "1" { "path" "D:\\\\SteamLibrary" }
}`;
    expect(parseLibraryFolders(vdf)).toEqual(['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);
    expect(parseLibraryFolders(`"LibraryFolders" { "TimeNextStatsReport" "1" "1" "E:\\\\Jeux" }`)).toEqual(['E:\\Jeux']);
  });

  it('lit un appmanifest et écarte les outils', () => {
    const acf = `"AppState" { "appid" "1245620" "name" "ELDEN RING" "installdir" "ELDEN RING" "StateFlags" "4" }`;
    expect(parseAppManifest(acf)).toEqual({ appId: '1245620', name: 'ELDEN RING', dir: 'ELDEN RING' });
    expect(parseAppManifest(`"AppState" { "appid" "228980" "name" "Steamworks Common Redistributables" }`)).toBeNull();
    expect(parseAppManifest(`"AppState" { "name" "x" }`)).toBeNull();
    expect(steamRunUrl('730')).toBe('steam://rungameid/730');
  });
});

describe('home assistant', () => {
  it('choisit le bon service', () => {
    expect(haService('light.salon', 'toggle', true)).toEqual(['light', 'turn_off']);
    expect(haService('light.salon', 'toggle', false)).toEqual(['light', 'turn_on']);
    expect(haService('cover.volet', 'on', false)).toEqual(['cover', 'open_cover']);
    expect(haService('scene.cinema', 'off', false)).toEqual(['scene', 'turn_on']);
    expect(haService('button.sonnette', 'toggle', false)).toEqual(['button', 'press']);
  });

  it('filtre les entités pilotables', () => {
    expect(isControllable({ entity_id: 'light.a', state: 'on' })).toBe(true);
    expect(isControllable({ entity_id: 'sensor.t', state: '21' })).toBe(false);
    expect(isControllable({ entity_id: 'switch.p', state: 'unavailable' })).toBe(false);
  });

  it('adresse et action en fin de requête', () => {
    expect(haBaseUrl('homeassistant.local:8123/')).toBe('http://homeassistant.local:8123');
    expect(haBaseUrl('')).toBeNull();
    expect(splitHaAction('lampe bureau off')).toEqual({ text: 'lampe bureau', action: 'off' });
    expect(splitHaAction('salon allumer')).toEqual({ text: 'salon', action: 'on' });
    expect(splitHaAction('salon')).toEqual({ text: 'salon', action: 'toggle' });
  });
});

import { authorizeUrl, isClientId, parseCommand, parsePlayer, parseSearch, pkcePair, SPOTIFY_REDIRECT } from './spotify';

describe('spotify', () => {
  it('PKCE et adresse de connexion', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const u = new URL(authorizeUrl('a'.repeat(32), challenge, 'xyz'));
    expect(u.searchParams.get('redirect_uri')).toBe(SPOTIFY_REDIRECT);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('scope')).toContain('user-modify-playback-state');
    expect(isClientId('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(true);
    expect(isClientId('nope')).toBe(false);
  });

  it('lit une recherche', () => {
    const items = parseSearch({
      tracks: { items: [{ name: 'One More Time', uri: 'spotify:track:1', artists: [{ name: 'Daft Punk' }], album: { name: 'Discovery' } }] },
      artists: { items: [{ name: 'Daft Punk', uri: 'spotify:artist:2' }] },
      playlists: { items: [null, { name: 'Mix', uri: 'spotify:playlist:3', owner: { display_name: 'Noë' } }] }
    });
    expect(items).toEqual([
      expect.objectContaining({ kind: 'track', detail: 'Daft Punk · Discovery' }),
      expect.objectContaining({ kind: 'artist', name: 'Daft Punk' }),
      expect.objectContaining({ kind: 'playlist', detail: 'Noë' })
    ]);
  });

  it('lit le lecteur et les commandes', () => {
    expect(parsePlayer(null)).toBeNull();
    expect(
      parsePlayer({ is_playing: true, item: { name: 'X', artists: [{ name: 'Y' }] }, device: { name: 'PC', volume_percent: 50 } })
    ).toMatchObject({ playing: true, name: 'X', detail: 'Y', device: 'PC', volume: 50 });
    expect(parseCommand('suivant')).toEqual({ cmd: 'next' });
    expect(parseCommand('vol 140')).toEqual({ cmd: 'volume', value: 100 });
    expect(parseCommand('daft punk')).toBeNull();
  });
});
