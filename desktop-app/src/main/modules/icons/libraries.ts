/**
 * Bibliothèques de symboles de l'atelier d'icônes : Phosphor (proche du style
 * Apple, 6 graisses), Tabler (au trait), Material Design (celles de Home
 * Assistant) et les packs d'icônes installés dans le logiciel Stream Deck.
 *
 * Les catalogues sont lus une fois puis gardés en mémoire ; les tracés sont
 * lus à la demande.
 */
import { existsSync, promises as fs, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  StreamDeckPackIcon,
  StreamDeckPackInfo,
  SymbolArt,
  SymbolCatalog,
  SymbolEntry,
  SymbolLib,
  SymbolRef
} from '../../../common/icons';

/* eslint-disable @typescript-eslint/no-require-imports */

const PHOSPHOR_CATS: Record<string, string> = {
  arrows: 'Flèches',
  brands: 'Marques',
  commerce: 'Commerce',
  communications: 'Communication',
  design: 'Design',
  editor: 'Texte et édition',
  finances: 'Finances',
  games: 'Jeux',
  'health & wellness': 'Santé',
  'maps & travel': 'Cartes et voyages',
  media: 'Médias',
  nature: 'Nature',
  objects: 'Objets',
  office: 'Bureau',
  people: 'Personnes',
  system: 'Système',
  'technology & development': 'Technologie',
  weather: 'Météo'
};

const TABLER_CATS: Record<string, string> = {
  Animals: 'Animaux', Arrows: 'Flèches', Badges: 'Badges', Brand: 'Marques', Buildings: 'Bâtiments',
  Charts: 'Graphiques', Communication: 'Communication', Computers: 'Ordinateurs', Currencies: 'Monnaies',
  Database: 'Données', Design: 'Design', Development: 'Développement', Devices: 'Appareils',
  Document: 'Documents', 'E-commerce': 'Commerce', Electrical: 'Électricité', Extensions: 'Extensions',
  Food: 'Nourriture', Games: 'Jeux', Gender: 'Genre', Gestures: 'Gestes', Health: 'Santé',
  Laundry: 'Lessive', Letters: 'Lettres', Logic: 'Logique', Map: 'Cartes', Math: 'Maths',
  Media: 'Médias', Mood: 'Humeur', Nature: 'Nature', Numbers: 'Chiffres', Photography: 'Photo',
  Shapes: 'Formes', Sport: 'Sport', Symbols: 'Symboles', System: 'Système', Text: 'Texte',
  Vehicles: 'Véhicules', 'Version control': 'Versions', Weather: 'Météo', Zodiac: 'Zodiaque'
};

const MDI_CATS: Record<string, string> = {
  'Home Automation': 'Domotique', 'Files / Folders': 'Fichiers', 'Alpha / Numeric': 'Lettres et chiffres',
  'Date / Time': 'Date et heure', 'Brand / Logo': 'Marques', Arrow: 'Flèches', 'Food / Drink': 'Nourriture',
  Banking: 'Banque', 'Text / Content / Format': 'Texte', 'Gaming / RPG': 'Jeux', 'Account / User': 'Personnes',
  'Alert / Error': 'Alertes', Automotive: 'Voiture', Weather: 'Météo', Settings: 'Réglages', Lock: 'Verrous',
  'Cellphone / Phone': 'Téléphone', Sport: 'Sport', Math: 'Maths', Navigation: 'Navigation',
  Agriculture: 'Agriculture', Shopping: 'Achats', 'Geographic Information System': 'Cartes',
  'Developer / Languages': 'Développement', 'Video / Movie': 'Vidéo', 'Transportation + Road': 'Route',
  Battery: 'Batterie', Music: 'Musique', Photography: 'Photo', Shape: 'Formes', Database: 'Données',
  'People / Family': 'Famille', Nature: 'Nature', 'Medical / Hospital': 'Santé', Audio: 'Audio',
  'Transportation + Other': 'Transports', Places: 'Lieux', 'Device / Tech': 'Appareils',
  'Edit / Modify': 'Édition', Science: 'Science', Holiday: 'Fêtes', Form: 'Formulaires', Cloud: 'Cloud',
  Animal: 'Animaux', Printer: 'Imprimante', Currency: 'Monnaies', 'Hardware / Tools': 'Outils',
  'Transportation + Flying': 'Avion', View: 'Affichage', 'Drawing / Art': 'Dessin', Emoji: 'Émojis',
  Notification: 'Notifications', Vector: 'Vecteurs', Clothing: 'Vêtements', Religion: 'Religion',
  Color: 'Couleurs', Tooltip: 'Bulles', 'Health / Beauty': 'Beauté', 'Transportation + Water': 'Bateaux',
  Arrange: 'Disposition', 'Social Media': 'Réseaux sociaux'
};

const TAGS_MAX = 8;
const catalogs = new Map<string, SymbolCatalog>();
const artCache = new Map<string, SymbolArt | null>();

function finish(lib: SymbolLib, entries: SymbolEntry[], labels: Record<string, string>): SymbolCatalog {
  const count = new Map<string, number>();
  for (const e of entries) count.set(e.cat, (count.get(e.cat) ?? 0) + 1);
  const categories = [...count.entries()]
    .map(([id, n]) => ({ id, label: labels[id] ?? (id || 'Autres'), count: n }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return { lib, entries, categories };
}

/* ───────── Phosphor ───────── */

const phosphorAssets = (): string =>
  path.join(path.dirname(require.resolve('@phosphor-icons/core')), '..', 'assets');

function phosphorCatalog(): SymbolCatalog {
  const { icons } = require('@phosphor-icons/core') as {
    icons: Array<{ name: string; categories: string[]; tags: string[] }>;
  };
  const entries = icons.map((i) => ({
    name: i.name,
    cat: i.categories[0] ?? '',
    tags: i.tags.filter((t) => !t.startsWith('*')).slice(0, TAGS_MAX)
  }));
  return finish('phosphor', entries, PHOSPHOR_CATS);
}

const PHOSPHOR_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

/** Découpe un fichier SVG en viewBox + contenu intérieur. */
export function splitSvg(svg: string): { viewBox: string; body: string } | null {
  const open = /<svg\b[^>]*>/i.exec(svg);
  const close = svg.lastIndexOf('</svg>');
  if (!open || close < 0) return null;
  const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(open[0]);
  const w = /\bwidth\s*=\s*"([\d.]+)/i.exec(open[0]);
  const h = /\bheight\s*=\s*"([\d.]+)/i.exec(open[0]);
  const viewBox = vb?.[1] ?? `0 0 ${w?.[1] ?? 24} ${h?.[1] ?? 24}`;
  const body = svg
    .slice(open.index + open[0].length, close)
    // pas de script ni de gestionnaire d'événement dans un symbole
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  return { viewBox, body };
}

async function phosphorArt(ref: SymbolRef): Promise<SymbolArt | null> {
  const weight = PHOSPHOR_WEIGHTS.includes(ref.weight ?? '') ? (ref.weight as string) : 'regular';
  if (!/^[a-z0-9-]+$/.test(ref.name)) return null;
  const file = path.join(phosphorAssets(), weight, weight === 'regular' ? `${ref.name}.svg` : `${ref.name}-${weight}.svg`);
  try {
    const parts = splitSvg(await fs.readFile(file, 'utf8'));
    return parts ? { ...parts, paint: 'fill' } : null;
  } catch {
    return null;
  }
}

/* ───────── Tabler ───────── */

type TablerNode = [string, Record<string, string>];
let tablerNodes: { outline: Record<string, TablerNode[]>; filled: Record<string, TablerNode[]> } | null = null;

function tablerCatalog(): SymbolCatalog {
  const json = require('@tabler/icons/icons.json') as Record<
    string,
    { name: string; category: string; tags: string[]; styles: Record<string, unknown> }
  >;
  const entries = Object.values(json).map((i) => ({
    name: i.name,
    cat: i.category ?? '',
    tags: [...(i.styles.filled ? ['filled'] : []), ...(i.tags ?? []).map(String)].slice(0, TAGS_MAX)
  }));
  return finish('tabler', entries, TABLER_CATS);
}

const attrEsc = (v: string): string => v.replace(/[<>&"]/g, '');

function tablerArt(ref: SymbolRef): SymbolArt | null {
  tablerNodes ??= {
    outline: require('@tabler/icons/tabler-nodes-outline.json'),
    filled: require('@tabler/icons/tabler-nodes-filled.json')
  };
  const filled = ref.weight === 'filled' && tablerNodes.filled[ref.name];
  const nodes = filled ? tablerNodes.filled[ref.name] : tablerNodes.outline[ref.name];
  if (!nodes) return null;
  const body = nodes
    .filter(([tag]) => /^(path|circle|rect|line|polyline|polygon|ellipse)$/.test(tag))
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${attrEsc(String(v))}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return { viewBox: '0 0 24 24', body, paint: filled ? 'fill' : 'stroke' };
}

/* ───────── Material Design ───────── */

function mdiCatalog(): SymbolCatalog {
  const meta = require('@mdi/svg/meta.json') as Array<{ name: string; tags: string[]; aliases: string[]; deprecated?: boolean }>;
  const entries = meta
    .filter((i) => !i.deprecated)
    .map((i) => ({ name: i.name, cat: i.tags[0] ?? '', tags: [...i.aliases, ...i.tags.slice(1)].slice(0, TAGS_MAX) }));
  return finish('mdi', entries, MDI_CATS);
}

export function mdiExport(name: string): string {
  return 'mdi' + name.replace(/^mdi:/, '').split('-').map((p) => (p ? p[0].toUpperCase() + p.slice(1) : '')).join('');
}

function mdiArt(ref: SymbolRef): SymbolArt | null {
  const paths = require('@mdi/js') as Record<string, string>;
  const d = paths[mdiExport(ref.name)];
  return d ? { viewBox: '0 0 24 24', body: `<path d="${attrEsc(d)}"/>`, paint: 'fill' } : null;
}

/* ───────── packs Stream Deck ───────── */

/** Dossiers où le logiciel Stream Deck range les packs d'icônes installés. */
export function streamDeckPackDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'Elgato', 'StreamDeck', 'IconPacks'));
  dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'com.elgato.StreamDeck', 'IconPacks'));
  return dirs.filter((d) => existsSync(d));
}

interface PackData {
  info: StreamDeckPackInfo;
  dir: string;
  icons: StreamDeckPackIcon[];
}
let packCache: { at: number; packs: PackData[] } | null = null;

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
};

const IMG_EXT = /\.(png|svg|jpe?g|gif|webp)$/i;

function scanPacks(): PackData[] {
  if (packCache && Date.now() - packCache.at < 30_000) return packCache.packs;
  const packs: PackData[] = [];
  for (const root of streamDeckPackDirs()) {
    let names: string[] = [];
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const id of names) {
      const dir = path.join(root, id);
      const manifest = (readJson(path.join(dir, 'manifest.json')) ?? {}) as Record<string, unknown>;
      const list = readJson(path.join(dir, 'icons.json'));
      let icons: StreamDeckPackIcon[] = [];
      if (Array.isArray(list)) {
        icons = list
          .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && typeof (i as { path?: unknown }).path === 'string')
          .map((i) => ({
            path: String(i.path),
            name: typeof i.name === 'string' && i.name ? i.name : String(i.path).replace(IMG_EXT, ''),
            tags: Array.isArray(i.tags) ? i.tags.map(String).slice(0, TAGS_MAX) : []
          }));
      } else {
        // pas de icons.json : on prend les images du dossier icons/
        try {
          icons = readdirSync(path.join(dir, 'icons'))
            .filter((f) => IMG_EXT.test(f))
            .map((f) => ({ path: f, name: f.replace(IMG_EXT, ''), tags: [] }));
        } catch {
          icons = [];
        }
      }
      if (!icons.length) continue;
      packs.push({
        dir,
        icons,
        info: {
          id,
          name: typeof manifest.Name === 'string' ? manifest.Name : id.replace(/\.sdIconPack$/i, ''),
          ...(typeof manifest.Author === 'string' ? { author: manifest.Author } : {}),
          count: icons.length
        }
      });
    }
  }
  packCache = { at: Date.now(), packs };
  return packs;
}

export function listPacks(): StreamDeckPackInfo[] {
  return scanPacks().map((p) => p.info);
}

function packCatalog(packId: string): SymbolCatalog {
  const pack = scanPacks().find((p) => p.info.id === packId);
  const entries = (pack?.icons ?? []).map((i) => ({
    name: i.path,
    // le premier dossier du chemin sert de catégorie (« Maison/lampe.png »)
    cat: i.path.includes('/') ? i.path.split('/')[0] : i.tags[0] ?? '',
    tags: [i.name, ...i.tags].slice(0, TAGS_MAX)
  }));
  return finish('pack', entries, {});
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

async function packArt(ref: SymbolRef): Promise<SymbolArt | null> {
  const pack = scanPacks().find((p) => p.info.id === ref.pack);
  if (!pack) return null;
  const base = path.resolve(pack.dir, 'icons');
  const file = path.resolve(base, ref.name);
  if (!file.startsWith(base + path.sep)) return null;
  try {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (ext === 'svg') {
      const parts = splitSvg(await fs.readFile(file, 'utf8'));
      return parts ? { ...parts, paint: 'fill' } : null;
    }
    const mime = MIME[ext];
    if (!mime) return null;
    const data = await fs.readFile(file);
    if (data.length > 2_000_000) return null;
    return { viewBox: '0 0 144 144', body: '', paint: 'fill', image: `data:${mime};base64,${data.toString('base64')}` };
  } catch {
    return null;
  }
}

/* ───────── API ───────── */

export function getCatalog(lib: SymbolLib, pack?: string): SymbolCatalog {
  const key = lib === 'pack' ? `pack:${pack}` : lib;
  const hit = catalogs.get(key);
  if (hit) return hit;
  const cat =
    lib === 'phosphor' ? phosphorCatalog() : lib === 'tabler' ? tablerCatalog() : lib === 'mdi' ? mdiCatalog() : packCatalog(pack ?? '');
  // les packs peuvent changer (installation) : pas de cache long pour eux
  if (lib !== 'pack') catalogs.set(key, cat);
  return cat;
}

export async function getArt(ref: SymbolRef): Promise<SymbolArt | null> {
  const key = `${ref.lib}:${ref.pack ?? ''}/${ref.name}@${ref.weight ?? ''}`;
  if (artCache.has(key)) return artCache.get(key) ?? null;
  let art: SymbolArt | null = null;
  try {
    art =
      ref.lib === 'phosphor' ? await phosphorArt(ref) : ref.lib === 'tabler' ? tablerArt(ref) : ref.lib === 'mdi' ? mdiArt(ref) : await packArt(ref);
  } catch {
    art = null;
  }
  if (artCache.size > 4000) artCache.clear();
  artCache.set(key, art);
  return art;
}
