import { describe, expect, it } from 'vitest';
import { CURATED } from '../../../common/icons';
import { getArt, getCatalog, mdiExport, splitSvg } from './libraries';

describe('bibliothèques de symboles', () => {
  it('lit les catalogues avec catégories', () => {
    for (const lib of ['phosphor', 'tabler', 'mdi'] as const) {
      const c = getCatalog(lib);
      expect(c.entries.length).toBeGreaterThan(1000);
      expect(c.categories.length).toBeGreaterThan(10);
      expect(c.categories.every((x) => x.label && x.count > 0)).toBe(true);
    }
  });

  it('la sélection ne contient que des symboles Phosphor existants', () => {
    const names = new Set(getCatalog('phosphor').entries.map((e) => e.name));
    const missing = CURATED.flatMap((c) => c.names).filter((n) => !names.has(n));
    expect(missing).toEqual([]);
  });

  it('donne le tracé des symboles', async () => {
    const ph = await getArt({ lib: 'phosphor', name: 'house', weight: 'fill' });
    expect(ph?.viewBox).toBe('0 0 256 256');
    expect(ph?.body).toContain('<path');
    const tb = await getArt({ lib: 'tabler', name: 'home' });
    expect(tb?.paint).toBe('stroke');
    const tf = await getArt({ lib: 'tabler', name: 'home', weight: 'filled' });
    expect(tf?.paint).toBe('fill');
    const md = await getArt({ lib: 'mdi', name: 'lightbulb' });
    expect(md?.body).toMatch(/^<path d="M/);
    expect(await getArt({ lib: 'phosphor', name: '../../etc/passwd' })).toBeNull();
    expect(await getArt({ lib: 'pack', pack: 'absent', name: 'x.png' })).toBeNull();
  });

  it('découpe un SVG sans script', () => {
    const s = splitSvg('<svg xmlns="x" width="20" height="20"><script>alert(1)</script><path onclick="x()" d="M0 0"/></svg>');
    expect(s?.viewBox).toBe('0 0 20 20');
    expect(s?.body).toBe('<path d="M0 0"/>');
    expect(mdiExport('mdi:lamp-outline')).toBe('mdiLampOutline');
  });
});
