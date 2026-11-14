import { describe, expect, it } from 'vitest';
import { acceptsZoneDrag, draggedPaths, ZONE_DRAG_TYPE } from './zone-drag';

describe('zone drag across windows', () => {
  it('accepts internal drags even without native Files', () => {
    expect(acceptsZoneDrag([ZONE_DRAG_TYPE])).toBe(true);
    expect(acceptsZoneDrag(['Files'])).toBe(true);
    expect(acceptsZoneDrag(['text/plain'])).toBe(false);
  });
  it('keeps all selected paths when native files are empty', () => {
    const paths = ['C:\\Users\\Noé\\Desktop\\Jeux.lnk', 'C:\\Users\\Noé\\Desktop\\Projet'];
    expect(draggedPaths({ getData: () => JSON.stringify(paths) }, () => [])).toEqual(paths);
  });
  it('uses native paths for external or malformed payloads', () => {
    for (const value of ['', '{', '[1]', '{}']) {
      expect(draggedPaths({ getData: () => value }, () => ['external.txt'])).toEqual(['external.txt']);
    }
  });
});
