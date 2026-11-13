/** Petits outils de chemins côté page (Windows d'abord, POSIX pour le dev). */
export const sepOf = (p: string): string => (p.includes('\\') || /^[a-zA-Z]:/.test(p) ? '\\' : '/');

export function joinPath(dir: string, name: string): string {
  if (/[\\/]$/.test(dir)) return dir + name;
  return `${dir}${sepOf(dir)}${name}`;
}

/** Dossier parent, ou null à la racine (C:\, /, \\serveur\partage). */
export function parentPath(p: string): string | null {
  const clean = p.replace(/[\\/]+$/, '');
  if (!clean || /^[a-zA-Z]:$/.test(clean)) return null;
  if (/^\\\\[^\\]+\\[^\\]+$/.test(clean)) return null;
  const i = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'));
  if (i < 0) return null;
  const up = clean.slice(0, i);
  if (/^[a-zA-Z]:$/.test(up)) return `${up}\\`;
  if (up === '') return '/';
  return up;
}

export const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** Segments du fil d'Ariane, chacun avec son chemin complet. */
export function crumbs(p: string): Array<{ label: string; path: string }> {
  const out: Array<{ label: string; path: string }> = [];
  let cur: string | null = p;
  while (cur) {
    const name = baseName(cur);
    out.unshift({ label: /^[a-zA-Z]:\\?$/.test(cur) ? cur.slice(0, 2) : cur === '/' ? '/' : name, path: cur });
    cur = parentPath(cur);
  }
  return out;
}

/** Nom libre dans un dossier : « Nouveau dossier », « Nouveau dossier (2) »… */
export function freeName(wanted: string, taken: string[]): string {
  const low = new Set(taken.map((n) => n.toLowerCase()));
  if (!low.has(wanted.toLowerCase())) return wanted;
  for (let i = 2; i < 1000; i++) {
    const n = `${wanted} (${i})`;
    if (!low.has(n.toLowerCase())) return n;
  }
  return `${wanted} ${Date.now()}`;
}
