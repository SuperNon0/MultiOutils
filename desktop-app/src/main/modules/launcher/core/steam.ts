/**
 * Lecture des fichiers de Steam (format texte « KeyValues » de Valve) :
 * dossiers de bibliothèque (libraryfolders.vdf) et jeux installés
 * (appmanifest_<appid>.acf). Sans dépendance Electron : testé par vitest.
 */

export interface SteamGame {
  appId: string;
  name: string;
  /** Dossier du jeu (steamapps/common/<installdir>). */
  dir?: string;
}

/** Paires "clé" "valeur" d'un fichier KeyValues (les blocs { } sont aplatis). */
function pairs(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m[1].toLowerCase(), m[2].replace(/\\\\/g, '\\')]);
  return out;
}

/** libraryfolders.vdf → chemins des bibliothèques (ancien et nouveau format). */
export function parseLibraryFolders(text: string): string[] {
  const paths = new Set<string>();
  for (const [k, v] of pairs(text)) {
    // nouveau format : "path" "D:\\SteamLibrary" ; ancien : "1" "D:\\SteamLibrary"
    if (k === 'path' || (/^\d+$/.test(k) && /[\\/]/.test(v))) paths.add(v);
  }
  return [...paths];
}

/** Outils installés par Steam qui ne sont pas des jeux. */
const NOT_GAMES = /^(steamworks common redistributables|steam linux runtime|proton\b|steamvr\b|spacewar$)/i;
const NOT_GAME_IDS = new Set(['228980', '1070560', '1391110', '1628350', '250820']);

/** appmanifest_*.acf → jeu (null si incomplet ou si c'est un outil). */
export function parseAppManifest(text: string): SteamGame | null {
  const kv = new Map<string, string>();
  for (const [k, v] of pairs(text)) if (!kv.has(k)) kv.set(k, v);
  const appId = kv.get('appid');
  const name = kv.get('name');
  if (!appId || !/^\d+$/.test(appId) || !name) return null;
  if (NOT_GAME_IDS.has(appId) || NOT_GAMES.test(name)) return null;
  return { appId, name, dir: kv.get('installdir') };
}

/** Adresse qui lance le jeu par le client Steam. */
export const steamRunUrl = (appId: string): string => `steam://rungameid/${appId}`;
