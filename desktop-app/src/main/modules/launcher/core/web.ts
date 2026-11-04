import type { LauncherWebEngine } from '../../../../common/launcher';

/** Moteurs de recherche par défaut (équivalent du plugin WebSearch de Flow). */
export const DEFAULT_WEB_ENGINES: LauncherWebEngine[] = [
  { id: 'google', name: 'Google', keyword: 'g', url: 'https://www.google.com/search?q={q}', enabled: true },
  { id: 'youtube', name: 'YouTube', keyword: 'yt', url: 'https://www.youtube.com/results?search_query={q}', enabled: true },
  { id: 'wikipedia', name: 'Wikipédia', keyword: 'w', url: 'https://fr.wikipedia.org/w/index.php?search={q}', enabled: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', keyword: 'd', url: 'https://duckduckgo.com/?q={q}', enabled: true },
  { id: 'bing', name: 'Bing', keyword: 'b', url: 'https://www.bing.com/search?q={q}', enabled: true },
  { id: 'github', name: 'GitHub', keyword: 'gh', url: 'https://github.com/search?q={q}', enabled: true },
  { id: 'maps', name: 'Google Maps', keyword: 'map', url: 'https://www.google.com/maps/search/{q}', enabled: true },
  { id: 'translate', name: 'Google Traduction', keyword: 'tr', url: 'https://translate.google.com/?sl=auto&tl=fr&text={q}', enabled: true },
  { id: 'images', name: 'Google Images', keyword: 'img', url: 'https://www.google.com/search?tbm=isch&q={q}', enabled: true },
  { id: 'wiktionary', name: 'Wiktionnaire', keyword: 'wk', url: 'https://fr.wiktionary.org/w/index.php?search={q}', enabled: false }
];

/** Remplace {q} par le texte encodé (ou ajoute-le à la fin si {q} manque). */
export function buildSearchUrl(template: string, search: string): string {
  const q = encodeURIComponent(search.trim());
  return template.includes('{q}') ? template.split('{q}').join(q) : template + q;
}

/** Page d'accueil d'un moteur (pour « g » tapé seul). */
export function engineHome(template: string): string {
  try {
    const u = new URL(template.replace(/\{q\}/g, ''));
    return `${u.protocol}//${u.host}/`;
  } catch {
    return template;
  }
}

const TLD = /\.[a-z]{2,24}$/i;

/**
 * Adresse tapée directement (plugin Url de Flow) : avec schéma, `www.`,
 * domaine.tld, localhost ou IPv4, avec port et chemin éventuels.
 * Renvoie l'URL normalisée à ouvrir, ou null.
 */
export function detectUrl(input: string): string | null {
  const s = input.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(s)) return s;
  const m = s.match(/^([^/?#:]+)(:\d{1,5})?([/?#].*)?$/);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const isIp = /^(\d{1,3})(\.\d{1,3}){3}$/.test(host) && host.split('.').every((n) => Number(n) <= 255);
  const isLocal = host === 'localhost';
  const isDomain =
    /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i.test(host) && TLD.test(host) && !/^\d+(\.\d+)+$/.test(host);
  if (!isIp && !isLocal && !isDomain) return null;
  // « 3.14 » ou un nom de fichier (« notes.txt ») ne sont pas des adresses
  if (isDomain && !m[2] && !m[3] && !host.startsWith('www.')) {
    const tld = host.split('.').pop() ?? '';
    if (FILE_LIKE_TLDS.has(tld)) return null;
  }
  return `${isIp || isLocal ? 'http' : 'https'}://${s}`;
}

/** Extensions de fichiers courantes qui ressemblent à des TLD. */
const FILE_LIKE_TLDS = new Set([
  'txt', 'exe', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'ppt',
  'pptx', 'zip', 'rar', 'mp3', 'mp4', 'mkv', 'avi', 'json', 'csv', 'lnk', 'bat', 'cmd',
  'ps1', 'js', 'ts', 'md', 'log', 'ini', 'dll', 'msi', 'iso', 'svg', 'webp', 'html', 'htm'
]);
