import { describe, expect, it } from 'vitest';
import {
  assignItems,
  applyLayout,
  autoPage,
  clampToArea,
  detachTab,
  effectiveStyle,
  layoutOf,
  nextPage,
  onActivePage,
  parseBundle,
  pruneDaily,
  screensKey,
  swapScreens,
  displayName,
  firstZoneRule,
  groupOf,
  hostIdOf,
  matchCondition,
  matchRule,
  mergeTab,
  moveTab,
  normalizeRule,
  distribute,
  formatSize,
  freeSpot,
  kindOf,
  newZone,
  normalizeSettings,
  normalizeZone,
  renameItem,
  snapRect,
  sortEntries,
  ZONE_MIN_WIDTH,
  type DesktopEntry,
  type Rule
} from './desktop';

const entry = (name: string, extra: Partial<DesktopEntry> = {}): DesktopEntry => {
  const isDir = extra.isDir ?? !name.includes('.');
  return {
    name,
    path: `C:\\Users\\N\\Desktop\\${name}`,
    isDir,
    kind: kindOf(name, isDir),
    ext: isDir ? '' : name.split('.').pop()!.toLowerCase(),
    size: 0,
    mtime: 0,
    ...extra
  };
};
const bounds = { displayId: '1', x: 0, y: 0, width: 300, height: 200 };

describe('catégories et noms', () => {
  it('reconnaît les types courants', () => {
    expect(kindOf('Facture.PDF', false)).toBe('pdf');
    expect(kindOf('VS Code.lnk', false)).toBe('shortcut');
    expect(kindOf('photo.jpeg', false)).toBe('image');
    expect(kindOf('Projets', true)).toBe('folder');
    expect(kindOf('inconnu.xyz', false)).toBe('other');
  });
  it('masque l’extension des raccourcis seulement', () => {
    expect(displayName(entry('VS Code.lnk'))).toBe('VS Code');
    expect(displayName(entry('notes.txt'))).toBe('notes.txt');
  });
  it('formate les tailles en français', () => {
    expect(formatSize(512)).toBe('512 o');
    expect(formatSize(3.4 * 1024 * 1024)).toBe('3,4 Mo');
    expect(formatSize(2048, 'en')).toBe('2.0 KB');
  });
});

describe('tri', () => {
  const list = [entry('b.txt', { size: 5, mtime: 3 }), entry('Dossier'), entry('a10.txt', { size: 9, mtime: 1 }), entry('a2.txt', { size: 1, mtime: 2 })];
  it('met les dossiers d’abord et trie les nombres naturellement', () => {
    expect(sortEntries(list, 'name', false).map((e) => e.name)).toEqual(['Dossier', 'a2.txt', 'a10.txt', 'b.txt']);
  });
  it('trie par taille décroissante', () => {
    expect(sortEntries(list, 'size', true).map((e) => e.name)).toEqual(['Dossier', 'a10.txt', 'b.txt', 'a2.txt']);
  });
  it('suit l’ordre manuel de la zone', () => {
    expect(sortEntries(list, 'manual', false, { manual: ['b.txt', 'Dossier'] }).map((e) => e.name)).toEqual([
      'b.txt',
      'Dossier',
      'a2.txt',
      'a10.txt'
    ]);
  });
  it('trie par nombre d’ouvertures', () => {
    const opens = { [list[0].path]: 4, [list[3].path]: 9 };
    expect(sortEntries(list, 'opens', true, { opens }).map((e) => e.name)).toEqual(['Dossier', 'a2.txt', 'b.txt', 'a10.txt']);
  });
});

describe('répartition dans les zones', () => {
  const desk = [entry('a.txt'), entry('b.txt'), entry('c.txt')];
  it('donne le reste à la zone « À trier » et ignore les absents', () => {
    const zones = [
      newZone('z1', 'shortcuts', 'Z1', bounds, { items: ['a.txt', 'disparu.txt'] }),
      newZone('z2', 'shortcuts', 'Inbox', bounds, { inbox: true })
    ];
    const d = distribute(zones, desk);
    expect(d.get('z1')!.map((e) => e.name)).toEqual(['a.txt']);
    expect(d.get('z2')!.map((e) => e.name)).toEqual(['b.txt', 'c.txt']);
  });
  it('un élément revendiqué deux fois reste dans la première zone', () => {
    const zones = [
      newZone('z1', 'shortcuts', 'Z1', bounds, { items: ['a.txt'] }),
      newZone('z2', 'shortcuts', 'Z2', bounds, { items: ['a.txt', 'b.txt'] })
    ];
    const d = distribute(zones, desk);
    expect(d.get('z2')!.map((e) => e.name)).toEqual(['b.txt']);
  });
  it('déplace des éléments entre zones, avant un élément donné', () => {
    const zones = [
      newZone('z1', 'shortcuts', 'Z1', bounds, { items: ['a.txt', 'b.txt'] }),
      newZone('z2', 'shortcuts', 'Z2', bounds, { items: ['c.txt'] })
    ];
    const next = assignItems(zones, 'z2', ['a.txt'], 'c.txt');
    expect(next[0].items).toEqual(['b.txt']);
    expect(next[1].items).toEqual(['a.txt', 'c.txt']);
  });
  it('suit les renommages et suppressions', () => {
    const zones = [newZone('z1', 'shortcuts', 'Z1', bounds, { items: ['a.txt', 'b.txt'] })];
    expect(renameItem(zones, 'a.txt', 'x.txt')[0].items).toEqual(['x.txt', 'b.txt']);
    expect(renameItem(zones, 'a.txt', null)[0].items).toEqual(['b.txt']);
  });
});

describe('géométrie', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  it('garde la zone dans l’écran avec une taille minimale', () => {
    expect(clampToArea({ x: 1900, y: -20, width: 50, height: 300 }, area)).toEqual({
      x: 1920 - ZONE_MIN_WIDTH,
      y: 0,
      width: ZONE_MIN_WIDTH,
      height: 300
    });
  });
  it('aimante au bord de l’écran et à une voisine, avec l’espacement', () => {
    expect(snapRect({ x: 7, y: 300, width: 300, height: 200 }, [], area, { gap: 12 }).x).toBe(0);
    const other = { x: 400, y: 100, width: 300, height: 200 };
    const r = snapRect({ x: 712 + 5, y: 104, width: 300, height: 200 }, [other], area, { gap: 12 });
    expect(r.x).toBe(712);
    expect(r.y).toBe(100);
  });
  it('en redimensionnement, n’ajuste que le bord droit / bas', () => {
    const r = snapRect({ x: 100, y: 100, width: 1815, height: 500 }, [], area, { gap: 0, mode: 'resize' });
    expect(r).toEqual({ x: 100, y: 100, width: 1820, height: 500 });
  });
  it('trouve une place libre sans chevauchement', () => {
    const others = [{ x: 12, y: 12, width: 320, height: 240 }];
    const spot = freeSpot({ width: 320, height: 240 }, others, area, 12);
    const overlaps = spot.x < 332 + 12 && spot.y < 252 + 12;
    expect(overlaps).toBe(false);
  });
});

describe('validation', () => {
  it('complète une zone partielle lue en base', () => {
    const z = normalizeZone({ id: 'x', kind: 'folder', folder: 'D:\\Docs', view: 'bizarre' as never, items: ['a', 3 as never] });
    expect(z.view).toBe('details');
    expect(z.items).toEqual(['a']);
    expect(z.inbox).toBe(false);
    expect(z.navigate).toBe(true);
  });
  it('borne les réglages', () => {
    expect(normalizeSettings({ opacity: 5, gap: 500 })).toMatchObject({ opacity: 40, gap: 64, enabled: true });
  });
});

describe('onglets', () => {
  const three = () => [
    newZone('a', 'shortcuts', 'A', bounds),
    newZone('b', 'shortcuts', 'B', { ...bounds, x: 400 }),
    newZone('c', 'folder', 'C', { ...bounds, x: 800 })
  ];
  it('regroupe une zone sous une autre et affiche le nouvel onglet', () => {
    const z = mergeTab(three(), 'b', 'a');
    expect(z.find((o) => o.id === 'b')!.tabOf).toBe('a');
    expect(z.find((o) => o.id === 'a')!.activeTab).toBe('b');
    expect(groupOf(z, 'a').map((o) => o.id)).toEqual(['a', 'b']);
    expect(hostIdOf(z, 'b')).toBe('a');
  });
  it('déposer sur un onglet rejoint l’hôte du groupe, avec ses propres onglets', () => {
    let z = mergeTab(three(), 'b', 'a');
    z = mergeTab(z, 'c', 'b');
    expect(groupOf(z, 'a').map((o) => o.id)).toEqual(['a', 'b', 'c']);
    const other = mergeTab([...three(), newZone('d', 'shortcuts', 'D', bounds)], 'b', 'a');
    const moved = mergeTab(mergeTab(other, 'd', 'c'), 'c', 'a');
    expect(groupOf(moved, 'a').map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('détacher l’hôte passe la main à l’onglet suivant', () => {
    let z = mergeTab(mergeTab(three(), 'b', 'a'), 'c', 'a');
    z = detachTab(z, 'a', { ...bounds, y: 500 });
    expect(z.find((o) => o.id === 'b')!.tabOf).toBeNull();
    expect(z.find((o) => o.id === 'b')!.bounds.x).toBe(0);
    expect(z.find((o) => o.id === 'c')!.tabOf).toBe('b');
    expect(z.find((o) => o.id === 'a')!.bounds.y).toBe(500);
  });
  it('déplace un onglet à gauche', () => {
    const z = moveTab(mergeTab(mergeTab(three(), 'b', 'a'), 'c', 'a'), 'c', -1);
    expect(groupOf(z, 'a').map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('règles', () => {
  const now = Date.UTC(2026, 10, 13);
  const old = entry('facture.pdf', { mtime: now - 40 * 86_400_000, size: 2 * 1024 * 1024 });
  const rule = (extra: Partial<Rule>): Rule => normalizeRule({ id: 'r', name: 'R', action: { type: 'zone', zoneId: 'z' }, ...extra });
  it('teste le type, l’extension, le nom, l’âge et la taille', () => {
    expect(matchCondition({ field: 'kind', op: 'is', value: 'pdf' }, old, now)).toBe(true);
    expect(matchCondition({ field: 'ext', op: 'is', value: '.PDF, docx' }, old, now)).toBe(true);
    expect(matchCondition({ field: 'name', op: 'startsWith', value: 'FACT' }, old, now)).toBe(true);
    expect(matchCondition({ field: 'name', op: 'regex', value: '^fact.*\\.pdf$' }, old, now)).toBe(true);
    expect(matchCondition({ field: 'name', op: 'regex', value: '(' }, old, now)).toBe(false);
    expect(matchCondition({ field: 'age', op: 'gt', value: '30' }, old, now)).toBe(true);
    expect(matchCondition({ field: 'size', op: 'lt', value: '1,5' }, old, now)).toBe(false);
  });
  it('lit la cible d’un raccourci', () => {
    const lnk = { ...entry('Jeu.lnk'), target: 'C:\\Games\\steam.exe' };
    expect(matchCondition({ field: 'target', op: 'endsWith', value: 'steam.exe' }, lnk, now)).toBe(true);
    expect(matchCondition({ field: 'target', op: 'contains', value: 'x' }, entry('a.txt'), now)).toBe(false);
  });
  it('« toutes » ou « au moins une »', () => {
    const conditions = [
      { field: 'kind' as const, op: 'is' as const, value: 'image' },
      { field: 'name' as const, op: 'contains' as const, value: 'facture' }
    ];
    expect(matchRule(rule({ conditions, match: 'all' }), old, now)).toBe(false);
    expect(matchRule(rule({ conditions, match: 'any' }), old, now)).toBe(true);
    expect(matchRule(rule({ conditions: [] }), old, now)).toBe(false);
  });
  it('la première règle active l’emporte', () => {
    const c = [{ field: 'kind' as const, op: 'is' as const, value: 'pdf' }];
    const rules = [rule({ id: 'off', enabled: false, conditions: c }), rule({ id: 'once', mode: 'once', conditions: c }), rule({ id: 'ok', conditions: c })];
    expect(firstZoneRule(rules, old, now)!.id).toBe('once');
    expect(firstZoneRule(rules, old, now, { continuousOnly: true })!.id).toBe('ok');
  });
  it('nettoie une règle lue en base', () => {
    const r = normalizeRule({ id: 'x', conditions: [{ field: 'age', op: 'contains', value: 3 as never }, { field: 'bad' as never, op: 'is', value: '' }] });
    expect(r.conditions).toEqual([{ field: 'age', op: 'gt', value: '3' }]);
    expect(r.action).toEqual({ type: 'zone', zoneId: '' });
    expect(r.mode).toBe('continuous');
  });
});

describe('apparence', () => {
  it('le style de la zone complète le style par défaut', () => {
    const settings = normalizeSettings({ opacity: 80, defaultStyle: { radius: 4, stripe: true } as never });
    const z = normalizeZone({ id: 'a', style: { stripe: false, bg: '#FFAA00', titleSize: 99, iconTint: 'rouge' } as never });
    const st = effectiveStyle(z, settings);
    expect(st).toMatchObject({ radius: 4, stripe: false, bg: '#ffaa00', titleSize: 22, iconTint: null, opacity: 80 });
  });
});

describe('pages', () => {
  const settings = normalizeSettings({ pages: [{ id: 'w', name: 'Travail' }, { id: 'p', name: 'Perso' }], activePage: 'p' });
  it('une zone sans page appartient à la première ; « toutes les pages » passe partout', () => {
    expect(onActivePage({ pageId: '', allPages: false }, settings)).toBe(false);
    expect(onActivePage({ pageId: 'p', allPages: false }, settings)).toBe(true);
    expect(onActivePage({ pageId: 'w', allPages: true }, settings)).toBe(true);
  });
  it('fait le tour des pages', () => {
    expect(nextPage(settings, 1)).toBe('w');
    expect(nextPage(settings, -1)).toBe('w');
  });
  it('page automatique selon l’heure, les jours et le programme', () => {
    const rules = [
      { id: '1', pageId: 'p', type: 'app' as const, exe: 'steam.exe' },
      { id: '2', pageId: 'w', type: 'time' as const, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] }
    ];
    const lundi10h = new Date(2026, 10, 9, 10, 0);
    const samedi10h = new Date(2026, 10, 14, 10, 0);
    expect(autoPage(rules, { now: lundi10h, exe: 'C:\\Steam\\Steam.exe' }, settings.pages)).toBe('p');
    expect(autoPage(rules, { now: lundi10h, exe: 'code.exe' }, settings.pages)).toBe('w');
    expect(autoPage(rules, { now: samedi10h, exe: null }, settings.pages)).toBeNull();
    const nuit = [{ id: '3', pageId: 'p', type: 'time' as const, from: '22:00', to: '02:00', days: [] }];
    expect(autoPage(nuit, { now: new Date(2026, 10, 9, 23, 30), exe: null }, settings.pages)).toBe('p');
  });
  it('les réglages gardent une page valide', () => {
    expect(normalizeSettings({ pages: [], activePage: 'x' }).activePage).toBe('p1');
  });
});

describe('dispositions', () => {
  const zones = [newZone('a', 'shortcuts', 'A', { displayId: '1', x: 100, y: 50, width: 300, height: 200 })];
  it('la clé ne dépend pas de l’ordre des écrans', () => {
    const d1 = { id: '1', bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
    const d2 = { id: '2', bounds: { x: 1920, y: 0, width: 2560, height: 1440 } };
    expect(screensKey([d1, d2])).toBe(screensKey([d2, d1]));
  });
  it('rétablit une disposition enregistrée', () => {
    const layout = layoutOf(zones);
    const moved = [{ ...zones[0], bounds: { ...zones[0].bounds, x: 900 } }];
    expect(applyLayout(moved, layout)[0].bounds.x).toBe(100);
  });
  it('échange les écrans en gardant la place en proportion', () => {
    const displays = [
      { id: '1', workArea: { width: 1000, height: 1000 } },
      { id: '2', workArea: { width: 2000, height: 2000 } }
    ];
    const z = swapScreens(zones, displays)[0];
    expect(z.bounds).toMatchObject({ displayId: '2', x: 200, y: 100, width: 300 });
  });
  it('refuse un fichier qui ne vient pas de MultiOutils et lit un export', () => {
    expect(parseBundle({ zones: [] })).toBeNull();
    const b = parseBundle({ app: 'MultiOutils', kind: 'desktop-layout', version: 1, zones: [{ id: 'z', title: 'Z' }], pages: [] });
    expect(b!.zones[0].title).toBe('Z');
    expect(b!.pages.length).toBe(1);
  });
  it('garde 7 jours de sauvegardes et tous les instantanés', () => {
    const bundle = { app: 'MultiOutils' as const, kind: 'desktop-layout' as const, version: 1 as const, at: 0, zones: [], pages: [] };
    const day = 86_400_000;
    const list = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, name: '', at: Date.UTC(2026, 10, 1) + i * day, type: 'daily' as const, bundle }));
    const kept = pruneDaily([...list, { id: 'm', name: 'x', at: 0, type: 'manual', bundle }], 7);
    expect(kept.filter((s) => s.type === 'daily').map((s) => s.id)).toEqual(['d3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']);
    expect(kept.some((s) => s.id === 'm')).toBe(true);
  });
});
