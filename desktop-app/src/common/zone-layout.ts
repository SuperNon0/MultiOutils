import { ZONE_MIN_WIDTH, ZONE_MIN_HEIGHT, type Rect } from './desktop';

/** Identical integer dimensions, inside the work area, without overlap. */
export function topRow(count: number, width: number, height: number, gap: number, zoneHeight: number): Rect[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const spacing = Math.max(0, Math.round(gap));
  const cell = Math.floor((width - spacing * (count - 1)) / count);
  if (cell < ZONE_MIN_WIDTH || height < ZONE_MIN_HEIGHT) return null;
  const h = Math.min(height, Math.max(ZONE_MIN_HEIGHT, Math.round(zoneHeight)));
  return Array.from({ length: count }, (_, i) => ({ x: i * (cell + spacing), y: 0, width: cell, height: h }));
}
