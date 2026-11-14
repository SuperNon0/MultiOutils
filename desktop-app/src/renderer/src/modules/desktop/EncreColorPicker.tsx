import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import { Icon } from '../../host/Icon';

type HSV = { h: number; s: number; v: number };
const valid = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);
const clamp = (x: number): number => Math.min(1, Math.max(0, x));

function fromHex(color: string): HSV {
  const raw = valid(color) ? color : '#a99bff';
  const r = parseInt(raw.slice(1, 3), 16) / 255;
  const g = parseInt(raw.slice(3, 5), 16) / 255;
  const b = parseInt(raw.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = ((h * 60) + 360) % 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function toHex({ h, s, v }: HSV): string {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] = ([ [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x] ][sector] ?? [c, 0, 0]);
  return '#' + [r, g, b].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Sélecteur Encre : teinte + saturation/luminosité + HEX + historique existant de la pipette. */
export function EncreColorPicker({
  value, onChange, onPick, onReset, resetLabel = 'Thème Encre', label = 'Couleur'
}: {
  value: string | null;
  onChange(color: string): void;
  onPick?: () => void;
  onReset?: () => void;
  resetLabel?: string;
  label?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const color = value && valid(value) ? value : '#A99BFF';
  const [hsv, setHsv] = useState<HSV>(() => fromHex(color));
  const [hex, setHex] = useState(color);
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    setHsv(fromHex(color));
    setHex(color);
  }, [color]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const refresh = (): void => {
      void window.api.colorpicker.history().then((entries) => {
        if (alive) setHistory(entries.map((entry) => entry.hex).filter(valid).slice(0, 12));
      });
    };
    refresh();
    const unsub = window.api.colorpicker.onHistoryChanged(refresh);
    return () => { alive = false; unsub(); };
  }, [open]);

  const choose = (next: HSV): void => {
    setHsv(next);
    const result = toHex(next);
    setHex(result);
    onChange(result);
  };
  const squarePoint = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    choose({ h: hsv.h, s: clamp((event.clientX - rect.left) / rect.width), v: 1 - clamp((event.clientY - rect.top) / rect.height) });
  };
  const applyHex = (): void => {
    if (valid(hex)) onChange(hex.toUpperCase());
    else setHex(color);
  };
  return (
    <div className="encre-picker">
      <div className="encre-picker-tools">
        <button type="button" className="encre-picker-current" title={label} aria-label={`Personnaliser : ${label}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span style={{ background: value === null ? 'var(--accent)' : color }} /><Icon name="palette" size={15}/>
        </button>
        {onPick && <button className="btn xs" type="button" onClick={onPick} title="Prélever à l'écran"><Icon name="palette" size={14}/> Pipette</button>}
        {onReset && <button className="btn xs" type="button" onClick={onReset} >{resetLabel}</button>}
      </div>
      {open && <div className="encre-picker-panel">
        <div className="encre-picker-sv" role="slider" tabIndex={0} aria-label="Saturation et luminosité" aria-valuetext={`${Math.round(hsv.s * 100)} %, ${Math.round(hsv.v * 100)} %`}
          style={{ backgroundColor: toHex({ h: hsv.h, s: 1, v: 1 }) }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); squarePoint(e); }}
          onPointerMove={(e) => { if (e.buttons === 1) squarePoint(e); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') choose({ ...hsv, s: clamp(hsv.s - 0.02) });
            if (e.key === 'ArrowRight') choose({ ...hsv, s: clamp(hsv.s + 0.02) });
            if (e.key === 'ArrowUp') choose({ ...hsv, v: clamp(hsv.v + 0.02) });
            if (e.key === 'ArrowDown') choose({ ...hsv, v: clamp(hsv.v - 0.02) });
          }}>
          <span className="encre-picker-marker" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <label className="encre-picker-hue-label" htmlFor="encre-hue">Teinte</label>
        <input id="encre-hue" className="encre-picker-hue" type="range" min={0} max={359} step={1} value={Math.round(hsv.h)} aria-label="Teinte" onChange={(e) => choose({ ...hsv, h: Number(e.target.value) })} />
        <div className="encre-picker-hex">
          <span className="encre-picker-swatch" style={{ background: color }} />
          <label htmlFor="encre-hex">HEX</label>
          <input id="encre-hex" value={hex} maxLength={7} onChange={(e) => setHex(e.target.value)} onBlur={applyHex} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </div>
        {history.length > 0 && <>
          <span className="encre-picker-caption">Couleurs récentes de la pipette</span>
          <div className="encre-picker-history">
            {history.map((item) => <button key={item} type="button" aria-label={`Appliquer ${item}`} title={item} style={{ backgroundColor: item }}
              onClick={() => choose(fromHex(item))}/>)}
          </div>
        </>}
      </div>}
    </div>
  );
}
