import { describe, expect, it } from 'vitest';
import { topRow } from './zone-layout';
import { normalizeSettings, normalizeStyle, effectiveStyle } from './desktop';

describe('matching top row', () => {
  it('uses identical integer dimensions and gaps without leaving the screen', () => {
    const rows = topRow(6, 2560, 1392, 12, 260)!;
    expect(new Set(rows.map((r) => r.width)).size).toBe(1);
    expect(rows.every((r) => r.y === 0 && r.height === 260)).toBe(true);
    expect(rows.at(-1)!.x + rows.at(-1)!.width).toBeLessThanOrEqual(2560);
    expect(rows[1].x - rows[0].width).toBe(12);
  });
  it('refuses layouts that would squeeze zones below their minimum width', () => {
    expect(topRow(10, 1000, 800, 12, 200)).toBeNull();
    expect(topRow(0, 1000, 800, 12, 200)).toBeNull();
  });
  it('bounds the height to the work area', () => {
    expect(topRow(1, 1920, 1080, 12, 2000)![0].height).toBe(1080);
  });
});
describe('transparent backgrounds', () => {
  it('keeps zero opacity in general settings and per-zone overrides', () => {
    const settings = normalizeSettings({ opacity: 0 });
    expect(settings.opacity).toBe(0);
    expect(effectiveStyle({ style: normalizeStyle({ opacity: 0 }) }, settings).opacity).toBe(0);
  });
});
