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


describe('styles sans symboles ni images', () => {
  it('sauvegarde tous les réglages sans aucune référence d’icône', () => {
    const source = defaultDesign({
      symbol: { lib: 'tabler', name: 'eye-check', weight: 'filled' },
      image: 'data:image/png;base64,AAAA', imageKeep: false,
      fg: '#a99bff', bg: '#141b28', bg2: '#111122', shape: 'rounded',
      gradientAngle: 45, shadow: 'glow', scale: 0.7, dx: 12, dy: -8, rotate: 30, strokeWidth: 3,
      text: { value: 'Zones visibles', size: 22, weight: 700, position: 'bottom', color: '#ffffff' },
      badge: { symbol: { lib: 'mdi', name: 'check' }, fg: '#ffffff', bg: '#ff0000', corner: 'bl' },
      off: { symbol: { lib: 'tabler', name: 'eye-off' }, fg: '#888888', bg: '#222222', bg2: '#333333' }
    });
    const raw = JSON.stringify({ id: 'style_complete', name: 'Zones du bureau', look: styleLook(source) });
    expect(raw).not.toContain('symbol');
    expect(raw).not.toContain('data:image');
    const saved = sanitizeStyle(JSON.parse(raw))!;
    const target = defaultDesign({
      name: 'Mon icône', folder: 'folder_a', favorite: true,
      symbol: { lib: 'mdi', name: 'lamp' },
      badge: { symbol: { lib: 'mdi', name: 'star' }, fg: '#000000', bg: '#ffffff', corner: 'tr' },
      off: { symbol: { lib: 'mdi', name: 'lamp-off' } }
    });
    const result = applyStyle(target, saved.look);
    expect(styleLook(result)).toEqual(styleLook(source));
    expect(result.symbol).toEqual(target.symbol);
    expect(result.badge?.symbol).toEqual(target.badge?.symbol);
    expect(result.off?.symbol).toEqual(target.off?.symbol);
    expect(result.id).toBe(target.id);
    expect(result.name).toBe(target.name);
    expect(result.folder).toBe(target.folder);
    expect(result.favorite).toBe(true);
    expect(result.createdAt).toBe(target.createdAt);
  });

  it('conserve l’image importée de la cible tout en appliquant les autres réglages', () => {
    const source = defaultDesign({ symbol: { lib: 'mdi', name: 'lamp' }, imageKeep: false, dx: 15 });
    const target = defaultDesign({ symbol: null, image: 'data:image/png;base64,AAAA', imageKeep: true });
    const result = applyStyle(target, styleLook(source));
    expect(result.symbol).toBeNull();
    expect(result.image).toBe(target.image);
    expect(result.imageKeep).toBe(false);
    expect(result.dx).toBe(15);
  });

  it('supprime les symboles des anciens styles complets au rechargement', () => {
    const saved = sanitizeStyle({ id: 'style_legacy', name: 'Ancien complet', look: {
      ...styleLook(defaultDesign()), symbol: { lib: 'mdi', name: 'lamp' }, image: 'data:image/png;base64,AAAA',
      badge: { symbol: { lib: 'mdi', name: 'star' }, fg: '#ffffff', bg: '#000000', corner: 'br' },
      off: { symbol: { lib: 'mdi', name: 'lamp-off' }, bg: '#333333' }
    } })!;
    expect(JSON.stringify(saved)).not.toContain('symbol');
    expect(JSON.stringify(saved)).not.toContain('data:image');
    expect(saved.look.badge).toEqual({ fg: '#ffffff', bg: '#000000', corner: 'br' });
    expect(saved.look.off?.bg).toBe('#333333');
  });

  it('n’invente pas de symbole de pastille quand la cible n’en a pas', () => {
    const look = styleLook(defaultDesign({ badge: { symbol: { lib: 'mdi', name: 'star' }, fg: '#ffffff', bg: '#000000', corner: 'br' } }));
    expect(applyStyle(defaultDesign({ badge: null }), look).badge).toBeNull();
  });

  it('préserve les symboles éteint et pastille même si le style n’en avait pas', () => {
    const target = defaultDesign({
      off: { symbol: { lib: 'mdi', name: 'lamp-off' }, fg: '#222222' },
      badge: { symbol: { lib: 'mdi', name: 'star' }, fg: '#ffffff', bg: '#000000', corner: 'br' }
    });
    const result = applyStyle(target, styleLook(defaultDesign()));
    expect(result.off).toEqual({ symbol: target.off!.symbol });
    expect(result.badge).toEqual(target.badge);
  });

  it('conserve le comportement partiel des anciens styles', () => {
    const old = sanitizeStyle({ id: 'style_old', name: 'Ancien', look: { fg: '#000000', bg: '#ffffff', shape: 'round', scale: 0.5 } })!;
    expect(old.look).not.toHaveProperty('off');
    const target = defaultDesign({ symbol: { lib: 'mdi', name: 'lamp' }, off: { bg: '#222222' }, dx: 5 });
    const result = applyStyle(target, old.look);
    expect(result.symbol).toEqual(target.symbol);
    expect(result.off).toEqual(target.off);
    expect(result.dx).toBe(5);
    expect(result.shape).toBe('round');
  });

  it('valide les champs et ne partage pas les données imbriquées', () => {
    expect(sanitizeStyle({ id: '../bad', name: 'x', look: {} })).toBeNull();
    expect(sanitizeStyle({ id: 'style_bad', name: 'x', look: [] })).toBeNull();
    const saved = sanitizeStyle({ id: 'style_safe', name: 'x', look: { dx: 100, rotate: 999, off: { bg: '#222222' } } })!;
    expect(saved.look.dx).toBe(50);
    expect(saved.look.rotate).toBe(180);
    const a = applyStyle(defaultDesign(), saved.look);
    a.off!.bg = '#ffffff';
    expect(saved.look.off!.bg).toBe('#222222');
  });
});


describe('indicateurs de l’atelier', () => {
  it('conserve l’indicateur dans les styles, sans copier les symboles', () => {
    const source = sanitizeDesign({ ...defaultDesign(), indicator: { shape: 'dot', position: 'right', color: '#ff0000', colorOff: '#222222', colorMode: 'entity', mode: 'value', value: 40, size: 10 } })!;
    const saved = sanitizeStyle(JSON.parse(JSON.stringify({ id: 'style_indicator', name: 'État', look: styleLook(source) })))!;
    const target = defaultDesign({ symbol: { lib: 'mdi', name: 'lamp' } });
    const result = applyStyle(target, saved.look);
    expect(result.indicator).toEqual(source.indicator);
    expect(result.symbol).toEqual(target.symbol);
    const svg = renderIconSvg({ design: result, art: null, indicatorState: { on: false } });
    expect(svg).toContain('data-indicator="dot"'); expect(svg).toContain('fill="#222222"');
  });
  it('retire un indicateur via un style et valide les champs lus sur disque', () => {
    const bad = sanitizeDesign({ ...defaultDesign(), indicator: { shape: 'unknown', size: 999, value: -50 } })!;
    expect(bad.indicator?.shape).toBe('bar'); expect(bad.indicator?.size).toBe(18);
    const result = applyStyle(bad, styleLook(defaultDesign()));
    expect(result.indicator).toBeNull();
  });
});
