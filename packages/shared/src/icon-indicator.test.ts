import { describe, expect, it } from 'vitest';
import { cleanIndicator, renderIndicator } from './icon-indicator';
describe('indicateurs des icônes', () => {
  it('suit l’état, la couleur réelle et la valeur de l’entité', () => {
    const i = cleanIndicator({ shape: 'bar', position: 'bottom', mode: 'value', colorMode: 'entity' })!;
    const on = renderIndicator(i, { on: true, color: '#ff0000', value: 50 });
    expect(on).toContain('fill="#ff0000"');
    expect(on).toContain('width="52.00"');
    expect(renderIndicator(i, { on: false, color: '#ff0000', value: 0 })).toContain('fill="#596174"');
  });
  it('dessine une barre verticale remplie du bas vers le haut', () => {
    const i = cleanIndicator({ position: 'left', mode: 'value', size: 6 })!;
    const svg = renderIndicator(i, { value: 25 });
    expect(svg).toContain('height="26.00"');
    expect(svg).toContain('width="6.00"');
    expect(svg).toContain('y="98.00"');
  });
  it('garde la couleur fixe et supporte les quatre positions et les trois formes', () => {
    for (const position of ['top', 'bottom', 'left', 'right']) for (const shape of ['bar', 'dot', 'pill']) {
      const i = cleanIndicator({ position, shape, color: '#abcdef', colorMode: 'fixed', size: 18 })!;
      const svg = renderIndicator(i, { color: '#ff0000' }, 288);
      expect(svg).toContain('fill="#abcdef"');
      expect(svg).toContain(`data-indicator="${shape}"`);
      expect(svg).not.toContain('NaN');
    }
  });
  it('valide les entrées et borne la valeur et les tailles', () => {
    expect(cleanIndicator(null)).toBeNull();
    const i = cleanIndicator({ color: '"><script>', value: 1000, size: -5 })!;
    expect(i.value).toBe(100); expect(i.size).toBe(3);
    expect(renderIndicator(i)).not.toContain('script');
    expect(renderIndicator(null)).toBe('');
  });
});
