import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  CURATED,
  applyStyle,
  applyTheme,
  defaultDesign,
  exportFileName,
  offVariant,
  renderIconSvg,
  sanitizeDesign,
  sanitizeSymbol,
  sanitizeStyle,
  styleLook,
  squirclePath,
  symbolKey,
  type SymbolArt
} from './icons';

const art: SymbolArt = { viewBox: '0 0 256 256', body: '<path d="M0 0h256v256z" fill="currentColor"/>', paint: 'fill' };

describe('atelier d’icônes : modèle', () => {
  it('nettoie une icône reçue', () => {
    const d = sanitizeDesign({ id: 'ic_test1', name: 'Lampe', fg: '#FFFFFF', bg: 'rouge', scale: 9, shape: 'etoile', symbol: { lib: 'phosphor', name: 'lamp', weight: 'fill' } });
    expect(d).not.toBeNull();
    expect(d?.fg).toBe('#ffffff');
    expect(d?.bg).toBe('#007aff');
    expect(d?.scale).toBe(1.2);
    expect(d?.shape).toBe('squircle');
    expect(d?.symbol).toEqual({ lib: 'phosphor', name: 'lamp', weight: 'fill' });
  });

  it('refuse les identifiants et symboles douteux', () => {
    expect(sanitizeDesign({ id: '../x' })).toBeNull();
    expect(sanitizeSymbol({ lib: 'pack', name: '../../secret.png' })).toBeNull();
    expect(sanitizeSymbol({ lib: 'autre', name: 'x' })).toBeNull();
  });

  it('garde une image importée sans symbole', () => {
    const d = sanitizeDesign({ id: 'ic_img01', symbol: null, image: 'data:image/png;base64,AAAA' });
    expect(d?.symbol).toBeNull();
    expect(d?.image).toContain('data:image/png');
    expect(d?.imageKeep).toBe(true);
    expect(sanitizeDesign({ id: 'ic_img02', image: 'javascript:alert(1)' })?.image).toBeUndefined();
  });

  it('calcule la version éteinte', () => {
    const d = defaultDesign({ fg: '#ffffff', bg: '#ff9500', bg2: '#ff3b30', off: { bg: '#2c2c2e', symbol: { lib: 'phosphor', name: 'lightbulb' } } });
    const off = offVariant(d);
    expect(off.bg).toBe('#2c2c2e');
    expect(off.bg2).toBeUndefined();
    expect(off.fg).toBe('#ffffff');
    expect(off.symbol?.name).toBe('lightbulb');
    expect(offVariant(defaultDesign())).toEqual(expect.objectContaining({ bg: '#007aff' }));
  });

  it('applique un thème ou un ancien style sans toucher au symbole', () => {
    const d = defaultDesign({ symbol: { lib: 'mdi', name: 'lamp' } });
    const th = BUILTIN_THEMES.find((t) => t.id === 'degrade-ocean');
    expect(th).toBeDefined();
    const a = applyTheme(d, th!);
    expect(a.bg2).toBe(th!.bg2);
    expect(a.symbol).toEqual(d.symbol);
    const s = applyStyle(a, { fg: '#000000', bg: '#ffffff', shape: 'round', gradientAngle: 90, shadow: 'soft', scale: 0.5, strokeWidth: 2 });
    expect(s.bg2).toBeUndefined();
    expect(s.shape).toBe('round');
    expect(s.symbol).toEqual(d.symbol);
  });

  it('a des thèmes valides et uniques', () => {
    const ids = new Set(BUILTIN_THEMES.map((t) => t.id));
    expect(ids.size).toBe(BUILTIN_THEMES.length);
    for (const t of BUILTIN_THEMES) expect(t.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(CURATED.length).toBeGreaterThan(8);
  });
});

describe('atelier d’icônes : dessin', () => {
  it('dessine un SVG complet, coloré', () => {
    const svg = renderIconSvg({ design: defaultDesign({ fg: '#123456' }), art });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="144"');
    expect(svg).toContain('#123456');
    expect(svg).not.toContain('currentColor');
  });

  it('gère dégradé, texte échappé, pastille et ombre', () => {
    const d = defaultDesign({ bg2: '#000000', shadow: 'glow', text: { value: '<b>&', size: 26, position: 'bottom', weight: 600 }, badge: { symbol: { lib: 'mdi', name: 'check' }, fg: '#ffffff', bg: '#34c759', corner: 'tr' } });
    const svg = renderIconSvg({ design: d, art, badgeArt: art, size: 288 });
    expect(svg).toContain('linearGradient');
    expect(svg).toContain('&lt;b&gt;&amp;');
    expect(svg).toContain('#34c759');
    expect(svg).toContain('feGaussianBlur');
  });

  it('recolore une image en silhouette ou la garde', () => {
    const img: SymbolArt = { viewBox: '0 0 144 144', body: '', paint: 'fill', image: 'data:image/png;base64,AAAA' };
    expect(renderIconSvg({ design: defaultDesign(), art: img })).toContain('feFlood');
    expect(renderIconSvg({ design: defaultDesign({ imageKeep: true }), art: img })).not.toContain('feFlood');
  });

  it('dessine les formes', () => {
    expect(squirclePath(144).startsWith('M')).toBe(true);
    expect(renderIconSvg({ design: defaultDesign({ shape: 'none' }), art })).not.toContain('<rect');
    expect(renderIconSvg({ design: defaultDesign({ shape: 'round' }), art })).toContain('<circle');
  });

  it('donne des clés et des noms de fichier sûrs', () => {
    expect(symbolKey({ lib: 'pack', pack: 'apple', name: 'maison/lampe.png' })).toBe('pack:apple/maison/lampe.png');
    expect(symbolKey({ lib: 'phosphor', name: 'house', weight: 'fill' })).toBe('phosphor:house@fill');
    expect(exportFileName('Lumière du Salon !')).toBe('lumiere-du-salon');
    expect(exportFileName('***')).toBe('icone');
  });
});

describe('recherche en français', () => {
  it('traduit les mots courants', async () => {
    const { searchVariants } = await import('./icons');
    expect(searchVariants('Lampe')).toEqual(['lampe', 'lamp', 'light', 'lightbulb']);
    expect(searchVariants('lumières')).toContain('light');
    expect(searchVariants('xyz')).toEqual(['xyz']);
  });
});


describe('styles complets et compatibilité', () => {
  it('conserve toute l’apparence après enregistrement et rechargement JSON', () => {
    const source = defaultDesign({
      symbol: { lib: 'tabler', name: 'eye-check', weight: 'filled' },
      fg: '#a99bff', bg: '#141b28', bg2: '#111122', shape: 'rounded',
      gradientAngle: 45, shadow: 'glow', scale: 0.7, dx: 12, dy: -8, rotate: 30, strokeWidth: 3,
      text: { value: 'Zones visibles', size: 22, weight: 700, position: 'bottom', color: '#ffffff' },
      badge: { symbol: { lib: 'mdi', name: 'check' }, fg: '#ffffff', bg: '#ff0000', corner: 'bl' },
      off: { symbol: { lib: 'tabler', name: 'eye-off' }, fg: '#888888', bg: '#222222', bg2: '#333333' }
    });
    const saved = sanitizeStyle(JSON.parse(JSON.stringify({ id: 'style_complete', name: 'Zones du bureau', look: styleLook(source) })))!;
    const target = defaultDesign({ name: 'Mon icône', folder: 'folder_a', favorite: true });
    const result = applyStyle(target, saved.look);
    expect(styleLook(result)).toEqual(styleLook(source));
    expect(result.id).toBe(target.id);
    expect(result.name).toBe(target.name);
    expect(result.folder).toBe(target.folder);
    expect(result.favorite).toBe(true);
    expect(result.createdAt).toBe(target.createdAt);
    expect(offVariant(result).symbol?.name).toBe('eye-off');
  });

  it('enregistre les images importées et leur mode de recoloration', () => {
    const source = defaultDesign({ symbol: null, image: 'data:image/png;base64,AAAA', imageKeep: false });
    const saved = sanitizeStyle(JSON.parse(JSON.stringify({ id: 'style_image', name: 'Image', look: styleLook(source) })))!;
    const result = applyStyle(defaultDesign(), saved.look);
    expect(result.symbol).toBeNull();
    expect(result.image).toBe(source.image);
    expect(result.imageKeep).toBe(false);
  });

  it('efface les éléments absents du style au lieu de garder ceux de la cible', () => {
    const source = defaultDesign({ symbol: null });
    const saved = sanitizeStyle(JSON.parse(JSON.stringify({ id: 'style_empty', name: 'Sans éléments', look: styleLook(source) })))!;
    const result = applyStyle(defaultDesign({
      image: 'data:image/png;base64,AAAA', bg2: '#abcdef',
      text: { value: 'Ancien', size: 20, weight: 600, position: 'top' },
      badge: { symbol: { lib: 'mdi', name: 'check' }, fg: '#ffffff', bg: '#000000', corner: 'tr' },
      off: { bg: '#222222' }, dx: 25, dy: -10, rotate: 90
    }), saved.look);
    expect(styleLook(result)).toEqual(styleLook(source));
  });

  it('ne complète pas les anciens styles avec un symbole ou une pastille par défaut', () => {
    const old = sanitizeStyle({ id: 'style_old', name: 'Ancien', look: { fg: '#000000', bg: '#ffffff', shape: 'round', scale: 0.5 } })!;
    expect(old.look).not.toHaveProperty('symbol');
    expect(old.look).not.toHaveProperty('off');
    const target = defaultDesign({ symbol: { lib: 'mdi', name: 'lamp' }, off: { bg: '#222222' }, dx: 5 });
    const result = applyStyle(target, old.look);
    expect(result.symbol).toEqual(target.symbol);
    expect(result.off).toEqual(target.off);
    expect(result.dx).toBe(5);
    expect(result.shape).toBe('round');
  });

  it('valide les champs des styles et refuse les styles mal formés', () => {
    expect(sanitizeStyle({ id: '../bad', name: 'x', look: {} })).toBeNull();
    expect(sanitizeStyle({ id: 'style_bad', name: 'x', look: [] })).toBeNull();
    const s = sanitizeStyle({ id: 'style_safe', name: 'x', look: { dx: 100, rotate: 999, image: 'javascript:alert(1)', symbol: null } })!;
    expect(s.look.dx).toBe(50);
    expect(s.look.rotate).toBe(180);
    expect(s.look.image).toBeNull();
  });

  it('ne partage pas les objets imbriqués entre style et icônes', () => {
    const source = defaultDesign({ off: { bg: '#222222' } });
    const look = styleLook(source);
    const a = applyStyle(defaultDesign(), look);
    const b = applyStyle(defaultDesign(), look);
    a.off!.bg = '#ffffff';
    expect(source.off!.bg).toBe('#222222');
    expect(look.off!.bg).toBe('#222222');
    expect(b.off!.bg).toBe('#222222');
  });
});
