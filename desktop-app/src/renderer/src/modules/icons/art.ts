/**
 * Côté renderer : cache des symboles (tracés demandés au main par lots),
 * dessin d'une icône et conversion en PNG.
 */
import { useEffect, useState } from 'react';
import {
  offVariant,
  renderIconSvg,
  svgDataUrl,
  symbolKey,
  type IconDesign,
  type SymbolArt,
  type SymbolRef
} from '../../../../common/icons';

const cache = new Map<string, SymbolArt | null>();
const waiting = new Map<string, SymbolRef>();
const listeners = new Set<() => void>();
let timer: number | null = null;

function flush(): void {
  timer = null;
  const refs = [...waiting.values()];
  waiting.clear();
  if (!refs.length) return;
  void window.api.icons.arts(refs).then((res) => {
    for (const r of refs) cache.set(symbolKey(r), res[symbolKey(r)] ?? null);
    listeners.forEach((l) => l());
  });
}

/** Demande un lot de symboles (regroupé sur 30 ms). */
export function requestArts(refs: Array<SymbolRef | null | undefined>): void {
  let any = false;
  for (const r of refs) {
    if (!r) continue;
    const k = symbolKey(r);
    if (cache.has(k) || waiting.has(k)) continue;
    waiting.set(k, r);
    any = true;
  }
  if (any && timer === null) timer = window.setTimeout(flush, 30);
}

export const artOf = (r: SymbolRef | null | undefined): SymbolArt | null | undefined => (r ? cache.get(symbolKey(r)) : null);

/** Redessine le composant quand des symboles arrivent. */
export function useArtVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const l = (): void => setV((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return v;
}

/** Symbole principal d'une icône (image importée comprise). */
export function mainArt(d: IconDesign): SymbolArt | null | undefined {
  if (d.image && !d.symbol) return { viewBox: '0 0 144 144', body: '', paint: 'fill', image: d.image };
  return artOf(d.symbol);
}

export function refsOf(d: IconDesign): SymbolRef[] {
  const out: SymbolRef[] = [];
  if (d.symbol) out.push(d.symbol);
  if (d.badge?.symbol) out.push(d.badge.symbol);
  if (d.off?.symbol) out.push(d.off.symbol);
  return out;
}

/** SVG de l'icône (variante éteinte avec off=true). */
export function designSvg(d: IconDesign, size = 144, off = false): string {
  const v = off ? offVariant(d) : d;
  return renderIconSvg({ design: v, art: mainArt(v) ?? null, badgeArt: artOf(v.badge?.symbol) ?? null, size });
}

export const designUrl = (d: IconDesign, size = 144, off = false): string => svgDataUrl(designSvg(d, size, off));

/** Convertit un SVG en PNG (data URL) à la taille voulue. */
export function svgToPng(svg: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      if (!g) return reject(new Error('canvas'));
      g.drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('svg'));
    img.src = svgDataUrl(svg);
  });
}

/** Réduit une image importée (fichier) à 288 px max, en PNG. */
export function importImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('lecture'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image'));
      img.onload = () => {
        const max = 288;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * k));
        const h = Math.max(1, Math.round(img.height * k));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d')?.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
