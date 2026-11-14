/** Lecture des raccourcis Windows (sans Electron, testable). */

/** Développe %VAR% (chemins d'icônes des raccourcis Windows). */
export function expandEnv(p: string, env: Record<string, string | undefined>): string {
  return p.replace(/%([^%]+)%/g, (m, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? (env[key] ?? m) : m;
  });
}

/** Lit IconFile= (et URL=) d'un raccourci Internet .url. */
export function parseUrlShortcut(text: string): { iconFile: string | null; url: string | null } {
  let iconFile: string | null = null;
  let url: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^(IconFile|URL)\s*=\s*(.+)$/i.exec(line);
    if (!m) continue;
    if (m[1].toLowerCase() === 'iconfile' && !iconFile) iconFile = m[2].trim().replace(/^"|"$/g, '');
    if (m[1].toLowerCase() === 'url' && !url) url = m[2].trim();
  }
  return { iconFile, url };
}
