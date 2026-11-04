import { describe, expect, it } from 'vitest';
import { cycleIndex, formatAccelerator, resolveTheme, splitHighlight } from './highlight';

describe('interface du lanceur', () => {
  it('découpe le surlignage', () => {
    expect(splitHighlight('Google Chrome', [7, 8, 9])).toEqual([
      { text: 'Google ', hl: false },
      { text: 'Chr', hl: true },
      { text: 'ome', hl: false }
    ]);
    expect(splitHighlight('ab', [0, 1, 5])).toEqual([{ text: 'ab', hl: true }]);
    expect(splitHighlight('ab', undefined)).toEqual([{ text: 'ab', hl: false }]);
    expect(splitHighlight('', [0])).toEqual([]);
  });

  it('thème encre', () => {
    expect(resolveTheme('sombre', true)).toBe('dark');
    expect(resolveTheme('clair', false)).toBe('light');
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
  });

  it('navigation circulaire', () => {
    expect(cycleIndex(0, -1, 3)).toBe(2);
    expect(cycleIndex(2, 1, 3)).toBe(0);
    expect(cycleIndex(0, 1, 0)).toBe(0);
  });

  it('affiche les raccourcis', () => {
    expect(formatAccelerator('Alt+Space')).toBe('Alt Espace');
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'en')).toBe('Ctrl Shift Space');
  });
});
