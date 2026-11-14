import { app, nativeImage, shell } from 'electron';
import fs from 'node:fs';
import { shellIcon } from './shell-icons';
import path from 'node:path';
import { expandEnv, parseUrlShortcut } from '../../../common/shortcut-files';

/**
 * Icônes des éléments des zones.
 *
 * - Raccourcis .lnk : l'icône choisie dans le raccourci, sinon celle de la
 *   cible (app.getFileIcon sur le .lnk donne souvent l'icône générique).
 * - Raccourcis Internet .url (Steam, Epic, sites) : IconFile= du fichier.
 * - Cache disque (userData/desktop-icons.json) : les icônes restent après un
 *   redémarrage, même si l'Explorateur n'est pas encore prêt à l'ouverture de
 *   session. Clé = taille + chemin + date de modification.
 * - Un échec n'est pas gardé : on réessaie à la demande suivante (après 30 s).
 */
export type IconSize = 'small' | 'normal' | 'large';

const MAX_DISK = 1500;
const RETRY_MS = 30_000;

const exists = (p: string | null | undefined): p is string => !!p && fs.existsSync(p);

/** Fichier dont il faut prendre l'icône (le raccourci lui-même à défaut). */
function iconSource(p: string): string {
  const ext = path.extname(p).toLowerCase();
  try {
    if (ext === '.lnk' && process.platform === 'win32') {
      const link = shell.readShortcutLink(p);
      const icon = link.icon ? expandEnv(link.icon, process.env) : null;
      const target = link.target ? expandEnv(link.target, process.env) : null;
      // Icône dédiée (.ico, ou .exe dont l'icône principale est la bonne) ;
      // une .dll à index (shell32…) donnerait l'icône générique : la cible.
      if (exists(icon) && /\.(ico|exe)$/i.test(icon) && !link.iconIndex) return icon;
      if (exists(target)) return target;
      if (exists(icon)) return icon;
    } else if (ext === '.url') {
      const { iconFile } = parseUrlShortcut(fs.readFileSync(p, 'utf8'));
      const icon = iconFile ? expandEnv(iconFile, process.env) : null;
      if (exists(icon)) return icon;
    }
  } catch {
    // raccourci illisible : icône du fichier lui-même
  }
  return p;
}

async function load(p: string, size: IconSize): Promise<string | null> {
  const src = iconSource(p);
  if (size === 'large' && src === p && fs.statSync(p).isFile() && !/\.(lnk|url)$/i.test(p)) {
    const thumb = await nativeImage.createThumbnailFromPath(p, { width: 96, height: 96 }).catch(() => null);
    if (thumb && !thumb.isEmpty()) return thumb.toDataURL();
  }
  if (process.platform === 'win32') {
    let source = p;
    let index: number | null = null;
    try {
      if (path.extname(p).toLowerCase() === '.lnk') {
        const link = shell.readShortcutLink(p);
        const explicit = link.icon ? expandEnv(link.icon, process.env).replace(/^"|"$/g, '') : null;
        if (exists(explicit)) { source = explicit; index = link.iconIndex ?? 0; }
      } else if (path.extname(p).toLowerCase() === '.url') {
        const text = fs.readFileSync(p, 'utf8');
        const explicit = parseUrlShortcut(text).iconFile;
        const expanded = explicit ? expandEnv(explicit, process.env) : null;
        if (exists(expanded)) {
          source = expanded;
          index = Number(/^IconIndex\s*=\s*(-?\d+)/im.exec(text)?.[1] ?? 0);
        }
      }
      const url = await shellIcon({ path: source, index, size: size === 'small' ? 16 : size === 'large' ? 64 : 32 });
      if (url) return url;
    } catch { /* Electron fallback below */ }
  }
  if (/\.(ico|png)$/i.test(src)) {
    const img = nativeImage.createFromPath(src);
    if (!img.isEmpty()) return img.resize({ width: size === 'small' ? 16 : size === 'large' ? 64 : 32, quality: 'best' }).toDataURL();
  }
  const img = await app.getFileIcon(src, { size: size === 'small' ? 'small' : 'large' });
  return img.isEmpty() ? null : img.toDataURL();
}

export class IconStore {
  private mem = new Map<string, string>();
  private failed = new Map<string, number>();
  private disk: Record<string, string> = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly file = path.join(app.getPath('userData'), 'desktop-icons-v2.json');

  constructor() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
      if (raw && typeof raw === 'object') this.disk = raw as Record<string, string>;
    } catch {
      this.disk = {};
    }
  }

  private keyOf(p: string, size: IconSize): string {
    let stamp = 0;
    try {
      stamp = Math.round(fs.statSync(p).mtimeMs);
    } catch {
      // fichier absent : clé sans date
    }
    return `${size}|${p.toLowerCase()}|${stamp}`;
  }

  /** Dernière icône connue pour ce chemin (pour l'image du glisser). */
  peek(p: string): string | null {
    for (const size of ['large', 'normal', 'small'] as const) {
      for (const [k, v] of this.mem) if (k.startsWith(`${size}|${p.toLowerCase()}|`)) return v;
    }
    return null;
  }

  async get(p: string, size: IconSize): Promise<string | null> {
    const key = this.keyOf(p, size);
    const hit = this.mem.get(key) ?? this.disk[key];
    if (hit) {
      this.mem.set(key, hit);
      return hit;
    }
    const lastFail = this.failed.get(key);
    if (lastFail && Date.now() - lastFail < RETRY_MS) return null;
    let url: string | null = null;
    try {
      url = await load(p, size);
    } catch {
      url = null;
    }
    if (!url) {
      this.failed.set(key, Date.now());
      return null;
    }
    this.failed.delete(key);
    if (this.mem.size > 3000) this.mem.clear();
    this.mem.set(key, url);
    // Vignettes d'images : pas sur le disque (lourdes, faciles à refaire).
    if (url.length < 40_000) {
      this.disk[key] = url;
      this.scheduleSave();
    }
    return url;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 2000);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const keys = Object.keys(this.disk);
    if (keys.length > MAX_DISK) for (const k of keys.slice(0, keys.length - MAX_DISK)) delete this.disk[k];
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.disk));
    } catch {
      // disque indisponible : le cache mémoire suffit
    }
  }
}
