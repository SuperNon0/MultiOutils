import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RegionShot } from '../../../common/types';
import { useI18n } from '../i18n';
import { formatColor, toHex } from '../lib/color';

const LOUPE_SRC = 11;
const LOUPE_ZOOM = 12;
const LOUPE_SIZE = LOUPE_SRC * LOUPE_ZOOM;

/**
 * Pipette plein écran (docs/00 §9.2) : écran gelé, loupe zoomée, couleur du
 * pixel visé en direct ; clic = copie du code. Échap annule.
 */
export function Eyedropper({ displayId }: { displayId: string }): ReactNode {
  const { t } = useI18n();
  const [shot, setShot] = useState<RegionShot | null>(null);
  const [format, setFormat] = useState<'hex' | 'rgb' | 'hsl'>('hex');
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [rgb, setRgb] = useState<{ r: number; g: number; b: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCtx = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    void window.api.colorpicker.shot(displayId).then(setShot);
    void window.api.colorpicker.getFormat().then(setFormat);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.api.colorpicker.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayId]);

  // canvas d'échantillonnage à la résolution native (lecture de pixel)
  useEffect(() => {
    if (!shot) return;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = shot.width;
      canvas.height = shot.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      sampleCtx.current = context;
    };
    image.src = shot.dataUrl;
  }, [shot]);

  // loupe + couleur sous le curseur
  useEffect(() => {
    const canvas = loupeRef.current;
    const img = imgRef.current;
    const sampler = sampleCtx.current;
    if (!canvas || !img || !cursor || !shot) return;
    const px = Math.min(shot.width - 1, Math.max(0, Math.round(cursor.x * shot.scale)));
    const py = Math.min(shot.height - 1, Math.max(0, Math.round(cursor.y * shot.scale)));

    if (sampler) {
      const [r, g, b] = sampler.getImageData(px, py, 1, 1).data;
      setRgb({ r, g, b });
    }

    const context = canvas.getContext('2d');
    if (!context) return;
    const half = (LOUPE_SRC - 1) / 2;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#0e0f11';
    context.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    context.drawImage(
      img,
      px - half,
      py - half,
      LOUPE_SRC,
      LOUPE_SRC,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE
    );
    context.strokeStyle = 'rgba(240, 237, 230, 0.08)';
    for (let i = 1; i < LOUPE_SRC; i++) {
      context.beginPath();
      context.moveTo(i * LOUPE_ZOOM + 0.5, 0);
      context.lineTo(i * LOUPE_ZOOM + 0.5, LOUPE_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, i * LOUPE_ZOOM + 0.5);
      context.lineTo(LOUPE_SIZE, i * LOUPE_ZOOM + 0.5);
      context.stroke();
    }
    context.strokeStyle = '#e8c547';
    context.strokeRect(half * LOUPE_ZOOM + 0.5, half * LOUPE_ZOOM + 0.5, LOUPE_ZOOM, LOUPE_ZOOM);
  }, [cursor, shot]);

  const pick = (): void => {
    if (!rgb) return;
    window.api.colorpicker.pick({
      ...rgb,
      hex: toHex(rgb.r, rgb.g, rgb.b),
      formatted: formatColor(rgb.r, rgb.g, rgb.b, format)
    });
  };

  const infoPos = cursor
    ? {
        left:
          cursor.x + 24 + LOUPE_SIZE > window.innerWidth
            ? cursor.x - 24 - LOUPE_SIZE
            : cursor.x + 24,
        top:
          cursor.y + 24 + LOUPE_SIZE + 56 > window.innerHeight
            ? cursor.y - 24 - LOUPE_SIZE - 56
            : cursor.y + 24
      }
    : null;

  return (
    <div
      className="region-root eyedropper-root"
      onPointerMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      onPointerDown={(e) => {
        if (e.button === 0) pick();
        else window.api.colorpicker.cancel();
      }}
    >
      {shot && (
        <img ref={imgRef} className="region-shot" src={shot.dataUrl} alt="" draggable={false} />
      )}

      {!cursor && <div className="region-hint">{t('colorpicker.hint')}</div>}

      {infoPos && shot && (
        <div className="region-loupe" style={infoPos}>
          <canvas ref={loupeRef} width={LOUPE_SIZE} height={LOUPE_SIZE} />
          <div className="eyedropper-info">
            {rgb && (
              <>
                <span className="eyedropper-swatch" style={{ background: toHex(rgb.r, rgb.g, rgb.b) }} />
                <span>{formatColor(rgb.r, rgb.g, rgb.b, format)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
