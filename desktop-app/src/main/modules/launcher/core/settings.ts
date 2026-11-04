import {
  DEFAULT_LAUNCHER_LOOK,
  LAUNCHER_LOOK_LIMITS,
  LAUNCHER_PROVIDER_IDS,
  type LauncherAlias,
  type LauncherLook,
  type LauncherProviderConfig,
  type LauncherSettings,
  type LauncherWebEngine
} from '../../../../common/launcher';
import { DEFAULT_WEB_ENGINES } from './web';

type ProviderKey = keyof LauncherSettings['providers'];

/** Mots-clés par défaut (Flow : la plupart des plugins inclus sont globaux). */
export const DEFAULT_PROVIDERS: Record<ProviderKey, LauncherProviderConfig> = {
  programs: { enabled: true, keyword: '' },
  files: { enabled: true, keyword: 'f' },
  calculator: { enabled: true, keyword: '' },
  websearch: { enabled: true, keyword: '' },
  url: { enabled: true, keyword: '' },
  shell: { enabled: true, keyword: '>' },
  system: { enabled: true, keyword: '' },
  winsettings: { enabled: true, keyword: '' },
  processes: { enabled: true, keyword: 'kill' },
  bookmarks: { enabled: true, keyword: '' },
  tools: { enabled: true, keyword: '' },
  aliases: { enabled: true, keyword: '' },
  steam: { enabled: true, keyword: '' },
  homeassistant: { enabled: true, keyword: 'ha' },
  spotify: { enabled: true, keyword: 'sp' }
};

export function defaultLauncherSettings(): LauncherSettings {
  return {
    shortcut: 'Alt+Space',
    lastQuery: 'selected',
    maxResults: 8,
    hideOnBlur: true,
    showHistory: true,
    debounceMs: 60,
    providers: structuredClone(DEFAULT_PROVIDERS),
    webEngines: DEFAULT_WEB_ENGINES.map((e) => ({ ...e })),
    aliases: [],
    homeAssistant: { url: '' },
    spotify: { clientId: '' },
    defaultEngine: 'google',
    shell: { kind: 'cmd', keepOpen: true },
    fileBackend: 'auto',
    indexedFolders: [],
    excludes: ['\\node_modules\\', '\\.git\\', '\\AppData\\Local\\Temp\\'],
    look: { ...DEFAULT_LAUNCHER_LOOK }
  };
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

const strList = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : fallback;

const LOOK_ACCENTS: LauncherLook['accent'][] = ['app', 'lavande', 'or', 'ambre', 'corail', 'menthe'];

/** Apparence de la barre : chaque valeur bornée, sinon celle par défaut. */
export function sanitizeLauncherLook(raw: unknown): LauncherLook {
  const d = DEFAULT_LAUNCHER_LOOK;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Partial<LauncherLook>;
  const num = (k: keyof typeof LAUNCHER_LOOK_LIMITS): number =>
    clampInt(r[k], LAUNCHER_LOOK_LIMITS[k][0], LAUNCHER_LOOK_LIMITS[k][1], d[k]);
  return {
    width: num('width'),
    textSize: num('textSize'),
    visibleRows: num('visibleRows'),
    opacity: num('opacity'),
    radius: num('radius'),
    position: r.position === 'top' || r.position === 'center' ? r.position : 'third',
    showSubtitles: typeof r.showSubtitles === 'boolean' ? r.showSubtitles : d.showSubtitles,
    showHotkeys: typeof r.showHotkeys === 'boolean' ? r.showHotkeys : d.showHotkeys,
    accent: LOOK_ACCENTS.includes(r.accent as LauncherLook['accent']) ? (r.accent as LauncherLook['accent']) : d.accent
  };
}

/** Raccourcis : mot-clé sans espace (24 car. max), cible non vide, ids uniques. */
export function sanitizeAliases(raw: unknown): LauncherAlias[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LauncherAlias[] = [];
  raw.forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    const r = a as Partial<LauncherAlias>;
    const keyword = str(r.keyword, '').replace(/\s+/g, '').slice(0, 24);
    const target = str(r.target, '').trim().slice(0, 2000);
    if (!keyword || !target) return;
    let id = str(r.id, '').slice(0, 64) || `alias-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({ id, keyword, name: str(r.name, '').trim().slice(0, 60), target, enabled: r.enabled !== false });
  });
  return out.slice(0, 500);
}

/** Nettoie une valeur lue en base (ou reçue du renderer) : toujours complète et valide. */
export function sanitizeLauncherSettings(raw: unknown): LauncherSettings {
  const d = defaultLauncherSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<LauncherSettings>;
  const providers = { ...d.providers };
  for (const id of LAUNCHER_PROVIDER_IDS as ProviderKey[]) {
    const p = (r.providers as Record<string, Partial<LauncherProviderConfig>> | undefined)?.[id];
    if (p && typeof p === 'object') {
      providers[id] = {
        enabled: typeof p.enabled === 'boolean' ? p.enabled : d.providers[id].enabled,
        keyword: typeof p.keyword === 'string' ? p.keyword.trim().slice(0, 16) : d.providers[id].keyword
      };
    }
  }
  // Spotify n'interroge l'API qu'avec son mot-clé : jamais vide
  if (!providers.spotify.keyword) providers.spotify = { ...providers.spotify, keyword: 'sp' };
  const engines: LauncherWebEngine[] = Array.isArray(r.webEngines)
    ? r.webEngines
        .filter((e): e is LauncherWebEngine => !!e && typeof e === 'object' && typeof e.url === 'string')
        .map((e, i) => ({
          id: str(e.id, `engine-${i}`) || `engine-${i}`,
          name: str(e.name, '').slice(0, 60),
          keyword: str(e.keyword, '').trim().slice(0, 16),
          url: e.url.trim(),
          enabled: e.enabled !== false
        }))
    : d.webEngines;
  return {
    shortcut: str(r.shortcut, d.shortcut),
    lastQuery: r.lastQuery === 'keep' || r.lastQuery === 'empty' ? r.lastQuery : 'selected',
    maxResults: clampInt(r.maxResults, 3, 30, d.maxResults),
    hideOnBlur: typeof r.hideOnBlur === 'boolean' ? r.hideOnBlur : d.hideOnBlur,
    showHistory: typeof r.showHistory === 'boolean' ? r.showHistory : d.showHistory,
    debounceMs: clampInt(r.debounceMs, 0, 500, d.debounceMs),
    providers,
    webEngines: engines,
    aliases: sanitizeAliases(r.aliases),
    homeAssistant: { url: str(r.homeAssistant?.url, '').trim().slice(0, 300) },
    spotify: { clientId: str(r.spotify?.clientId, '').trim().slice(0, 64) },
    defaultEngine: str(r.defaultEngine, d.defaultEngine),
    shell: {
      kind: r.shell?.kind === 'powershell' ? 'powershell' : 'cmd',
      keepOpen: typeof r.shell?.keepOpen === 'boolean' ? r.shell.keepOpen : true
    },
    fileBackend:
      r.fileBackend === 'everything' || r.fileBackend === 'windows' || r.fileBackend === 'walk'
        ? r.fileBackend
        : 'auto',
    indexedFolders: strList(r.indexedFolders, d.indexedFolders),
    excludes: strList(r.excludes, d.excludes),
    look: sanitizeLauncherLook(r.look)
  };
}

/** Fusion d'un patch partiel (le renderer n'envoie que ce qui change). */
export function mergeLauncherSettings(
  current: LauncherSettings,
  patch: Partial<LauncherSettings>
): LauncherSettings {
  return sanitizeLauncherSettings({
    ...current,
    ...patch,
    providers: { ...current.providers, ...(patch.providers ?? {}) },
    shell: { ...current.shell, ...(patch.shell ?? {}) },
    homeAssistant: { ...current.homeAssistant, ...(patch.homeAssistant ?? {}) },
    spotify: { ...current.spotify, ...(patch.spotify ?? {}) },
    look: { ...current.look, ...(patch.look ?? {}) }
  });
}
