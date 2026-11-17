/** Indicateur commun à l’atelier d’icônes et aux touches Home Assistant. */
export interface IconIndicator {
  shape: 'bar' | 'dot' | 'pill';
  position: 'top' | 'bottom' | 'left' | 'right';
  color: string;
  colorOff: string;
  colorMode: 'fixed' | 'entity';
  mode: 'fixed' | 'state' | 'value';
  value: number;
  size: number;
}
export interface IndicatorState { on?: boolean; color?: string | null; value?: number | null }
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
export function cleanIndicator(raw: unknown): IconIndicator | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    shape: r.shape === 'dot' || r.shape === 'pill' ? r.shape : 'bar',
    position: ['top', 'bottom', 'left', 'right'].includes(String(r.position)) ? r.position as IconIndicator['position'] : 'bottom',
    color: typeof r.color === 'string' && HEX.test(r.color) ? r.color : '#4fd1b5',
    colorOff: typeof r.colorOff === 'string' && HEX.test(r.colorOff) ? r.colorOff : '#596174',
    colorMode: r.colorMode === 'entity' ? 'entity' : 'fixed',
    mode: r.mode === 'state' || r.mode === 'value' ? r.mode : 'fixed',
    value: clamp(r.value, 0, 100, 100), size: clamp(r.size, 3, 18, 6)
  };
}
export function renderIndicator(i: IconIndicator | null | undefined, state: IndicatorState = {}, side = 144): string {
  if (!i) return '';
  const on = state.on !== false;
  const color = !on ? i.colorOff : i.colorMode === 'entity' && typeof state.color === 'string' && HEX.test(state.color) ? state.color : i.color;
  const percent = !on && i.mode !== 'fixed' ? 0 : i.mode === 'state' ? on ? 100 : 0 : i.mode === 'value' && typeof state.value === 'number' && Number.isFinite(state.value) ? clamp(state.value, 0, 100, 0) : i.value;
  const n = (v: number): string => (v * side / 144).toFixed(2);
  const vertical = i.position === 'left' || i.position === 'right';
  const edge = i.position === 'top' || i.position === 'left' ? 8 : 136 - i.size;
  if (i.shape === 'dot') {
    const x = vertical ? edge + i.size / 2 : 72;
    const y = vertical ? 72 : edge + i.size / 2;
    return `<circle data-indicator="dot" cx="${n(x)}" cy="${n(y)}" r="${n(i.size / 2)}" fill="${color}"/>`;
  }
  const length = i.shape === 'pill' ? 36 : 104;
  const x = vertical ? edge : (144 - length) / 2;
  const y = vertical ? (144 - length) / 2 : edge;
  const width = vertical ? i.size : length, height = vertical ? length : i.size;
  const filled = length * percent / 100;
  return `<g data-indicator="${i.shape}" fill="${color}"><rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(i.size / 2)}" opacity=".22"/><rect x="${n(x)}" y="${n(vertical ? y + length - filled : y)}" width="${n(vertical ? i.size : filled)}" height="${n(vertical ? filled : i.size)}" rx="${n(i.size / 2)}"/></g>`;
}
