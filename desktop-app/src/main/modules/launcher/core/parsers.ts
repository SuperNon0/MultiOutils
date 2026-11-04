/**
 * Analyse des données externes (favoris, liste des processus, applis du
 * Store…) — fonctions pures, testées sans Windows.
 */

export interface Bookmark {
  title: string;
  url: string;
  /** Navigateur d'origine (« Chrome », « Edge », « Firefox »…). */
  source: string;
}

interface ChromiumNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromiumNode[];
}

const BOOKMARK_SCHEMES = /^(https?|ftp|file):/i;

/** Fichier « Bookmarks » (JSON) de Chrome / Edge / Brave / Vivaldi. */
export function parseChromiumBookmarks(json: string, source: string): Bookmark[] {
  let data: { roots?: Record<string, ChromiumNode> };
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const out: Bookmark[] = [];
  const walk = (node: ChromiumNode | undefined, depth: number): void => {
    if (!node || depth > 40) return;
    if (node.type === 'url' && node.url && BOOKMARK_SCHEMES.test(node.url)) {
      out.push({ title: node.name?.trim() || node.url, url: node.url, source });
    }
    if (Array.isArray(node.children)) for (const c of node.children) walk(c, depth + 1);
  };
  for (const root of Object.values(data.roots ?? {})) {
    if (root && typeof root === 'object') walk(root, 0);
  }
  return out;
}

/** Lignes de places.sqlite (Firefox) : `SELECT b.title, p.url …`. */
export function mapFirefoxRows(
  rows: Array<{ title: string | null; url: string | null }>,
  source = 'Firefox'
): Bookmark[] {
  return rows
    .filter((r): r is { title: string | null; url: string } => !!r.url && BOOKMARK_SCHEMES.test(r.url))
    .map((r) => ({ title: r.title?.trim() || r.url, url: r.url, source }));
}

/** Requête SQL lisant les favoris de Firefox (type 1 = marque-page). */
export const FIREFOX_BOOKMARKS_SQL =
  "SELECT b.title AS title, p.url AS url FROM moz_bookmarks b JOIN moz_places p ON b.fk = p.id WHERE b.type = 1 AND p.url NOT LIKE 'place:%' LIMIT 20000";

/** Dédoublonne par URL (on garde le premier titre rencontré). */
export function dedupeBookmarks(list: Bookmark[]): Bookmark[] {
  const seen = new Set<string>();
  return list.filter((b) => {
    const key = b.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Processus ─────────────────────────────────────────────────────────────

export interface ProcessInfo {
  name: string;
  pid: number;
  /** Mémoire en Ko. */
  memKb: number;
}

/** Découpe une ligne CSV avec guillemets (« "a","b,c" »). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** Sortie de `tasklist /fo csv /nh` (Windows, toutes langues). */
export function parseTasklistCsv(output: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line.trim());
    if (cells.length < 5) continue;
    const pid = Number.parseInt(cells[1], 10);
    if (!Number.isFinite(pid)) continue;
    const memKb = Number.parseInt(cells[4].replace(/[^\d]/g, ''), 10) || 0;
    out.push({ name: cells[0], pid, memKb });
  }
  return out;
}

/** Sortie de `ps -eo pid=,rss=,comm=` (Linux / macOS). */
export function parsePsOutput(output: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    out.push({ pid: Number(m[1]), memKb: Number(m[2]), name: m[3].split('/').pop() ?? m[3] });
  }
  return out;
}

export interface ProcessGroup {
  name: string;
  pids: number[];
  memKb: number;
}

/** Processus système qu'on ne propose jamais de tuer. */
export const PROTECTED_PROCESSES = new Set(
  [
    'system',
    'system idle process',
    'registry',
    'smss.exe',
    'csrss.exe',
    'wininit.exe',
    'winlogon.exe',
    'services.exe',
    'lsass.exe',
    'svchost.exe',
    'fontdrvhost.exe',
    'dwm.exe',
    'memory compression',
    'secure system',
    'lsaiso.exe',
    'conhost.exe',
    'kernel_task',
    'launchd',
    'systemd',
    'init',
    'kthreadd'
  ].map((n) => n.toLowerCase())
);

export function groupProcesses(list: ProcessInfo[], excludePids: number[] = []): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>();
  const skip = new Set(excludePids);
  for (const p of list) {
    if (skip.has(p.pid) || p.pid === 0) continue;
    if (PROTECTED_PROCESSES.has(p.name.toLowerCase())) continue;
    const key = p.name.toLowerCase();
    const g = groups.get(key) ?? { name: p.name, pids: [], memKb: 0 };
    g.pids.push(p.pid);
    g.memKb += p.memKb;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.memKb - a.memKb);
}

// ── Applis du Store (Get-StartApps) ───────────────────────────────────────

export interface StartApp {
  name: string;
  appId: string;
}

/**
 * Sortie de `Get-StartApps | ConvertTo-Json`. On ne garde que les vraies
 * applis empaquetées (AUMID « Famille!App ») : les raccourcis classiques sont
 * déjà trouvés dans le menu Démarrer.
 */
export function parseStartApps(json: string): StartApp[] {
  let data: unknown;
  try {
    data = JSON.parse(json.replace(/^﻿/, ''));
  } catch {
    return [];
  }
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  const out: StartApp[] = [];
  for (const item of arr) {
    const name = (item as { Name?: unknown }).Name;
    const appId = (item as { AppID?: unknown }).AppID;
    if (typeof name !== 'string' || typeof appId !== 'string') continue;
    if (!appId.includes('!')) continue;
    out.push({ name: name.trim(), appId });
  }
  return out;
}

// ── Raccourcis Internet (.url) ────────────────────────────────────────────

/** Adresse d'un fichier .url (format INI : `URL=https://…`). */
export function parseUrlShortcut(content: string): string | null {
  const m = content.match(/^\s*URL\s*=\s*(.+?)\s*$/im);
  return m ? m[1] : null;
}

// ── Sorties de recherche de fichiers ──────────────────────────────────────

/** Une ligne = un chemin (es.exe, PowerShell). Lignes vides ignorées. */
export function parsePathLines(output: string, max = 200): string[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (/^[a-zA-Z]:[\\/]/.test(l) || l.startsWith('\\\\') || l.startsWith('/')))
    .slice(0, max);
}

/** Échappe une chaîne pour un littéral SQL du Windows Search (LIKE). */
export function escapeWindowsSearch(text: string): string {
  return text.replace(/'/g, "''").replace(/[%_[\]]/g, (c) => `[${c}]`);
}

/** Script PowerShell interrogeant l'index Windows Search (OLE DB, SystemIndex). */
export function windowsSearchScript(search: string, max: number, scopes: string[] = []): string {
  const like = escapeWindowsSearch(search);
  const scope = scopes.length
    ? `(${scopes.map((s) => `SCOPE='file:${escapeWindowsSearch(s).replace(/\\/g, '/')}'`).join(' OR ')}) AND `
    : '';
  const sql =
    `SELECT TOP ${Math.max(1, Math.min(200, max))} System.ItemPathDisplay FROM SystemIndex ` +
    `WHERE ${scope}System.FileName LIKE '%${like}%' ORDER BY System.Search.Rank DESC`;
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$c = New-Object -ComObject ADODB.Connection',
    `$c.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")`,
    `$r = $c.Execute("${sql.replace(/"/g, '`"')}")`,
    "while (-not $r.EOF) { $r.Fields.Item('System.ItemPathDisplay').Value; $r.MoveNext() }",
    '$r.Close(); $c.Close()'
  ].join('; ');
}

/** Encodage attendu par `powershell -EncodedCommand` (UTF-16LE + base64). */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}
