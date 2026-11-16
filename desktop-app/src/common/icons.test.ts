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

  it('applique thème et style sans toucher au symbole', () => {
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
