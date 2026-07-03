import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import type { RegionShot } from '../../../common/types';
import { useI18n } from '../i18n';

const LOUPE_SRC = 11; // pixels source (impair → pixel central)
const LOUPE_ZOOM = 12;
const LOUPE_SIZE = LOUPE_SRC * LOUPE_ZOOM; // 132 px

interface Drag {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Overlay de capture de zone (docs/00 §1.1) : écran gelé assombri, curseur en
 * croix, rectangle avec dimensions en px physiques, loupe de précision.
 * Échap annule.
 */
export function RegionOverlay({ displayId }: { displayId: string }): ReactNode {
  const { t } = useI18n();
  const [shot, setShot] = useState<RegionShot | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void window.api.region.shot(displayId).then(setShot);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.api.region.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayId]);

  // Loupe : zoom pixel-perfect autour du curseur.
  useEffect(() => {
    const canvas = loupeRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !cursor || !shot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const px = Math.round(cursor.x * shot.scale);
    const py = Math.round(cursor.y * shot.scale);
    const half = (LOUPE_SRC - 1) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.drawImage(
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
    // grille discrète
    ctx.strokeStyle = 'rgba(240, 237, 230, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LOUPE_SRC; i++) {
      ctx.beginPath();
      ctx.moveTo(i * LOUPE_ZOOM + 0.5, 0);
      ctx.lineTo(i * LOUPE_ZOOM + 0.5, LOUPE_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * LOUPE_ZOOM + 0.5);
      ctx.lineTo(LOUPE_SIZE, i * LOUPE_ZOOM + 0.5);
      ctx.stroke();
    }
    // pixel central
    ctx.strokeStyle = '#e8c547';
    ctx.strokeRect(half * LOUPE_ZOOM + 0.5, half * LOUPE_ZOOM + 0.5, LOUPE_ZOOM, LOUPE_ZOOM);
  }, [cursor, shot]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x0: event.clientX, y0: event.clientY, x1: event.clientX, y1: event.clientY });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    setCursor({ x: event.clientX, y: event.clientY });
    setDrag((d) => (d ? { ...d, x1: event.clientX, y1: event.clientY } : d));
  };

  const onPointerUp = (): void => {
    if (!drag) return;
    const rect = normalize(drag);
    setDrag(null);
    if (rect.width >= 4 && rect.height >= 4) {
      window.api.region.select(displayId, rect);
    }
  };

  const rect = drag ? normalize(drag) : null;
  const scale = shot?.scale ?? 1;

  // Position de la loupe : décalée du curseur, retournée près des bords.
  const loupePos = cursor
    ? {
        left:
          cursor.x + 24 + LOUPE_SIZE > window.innerWidth
            ? cursor.x - 24 - LOUPE_SIZE
            : cursor.x + 24,
        top:
          cursor.y + 24 + LOUPE_SIZE + 40 > window.innerHeight
            ? cursor.y - 24 - LOUPE_SIZE - 40
            : cursor.y + 24
      }
    : null;

  // Étiquette de dimensions : au-dessus du rectangle, sinon en dessous.
  const dimsPos = rect
    ? {
        left: Math.min(rect.x, window.innerWidth - 130),
        top: rect.y > 30 ? rect.y - 28 : rect.y + rect.height + 8
      }
    : null;

  return (
    <div
      className="region-root"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {shot && (
        <img
          ref={imgRef}
          className="region-shot"
          src={shot.dataUrl}
          alt=""
          draggable={false}
        />
      )}

      {rect ? (
        <>
          <div className="region-veil" style={{ left: 0, top: 0, right: 0, height: rect.y }} />
          <div
            className="region-veil"
            style={{ left: 0, top: rect.y + rect.height, right: 0, bottom: 0 }}
          />
          <div className="region-veil" style={{ left: 0, top: rect.y, width: rect.x, height: rect.height }} />
          <div
            className="region-veil"
            style={{ left: rect.x + rect.width, top: rect.y, right: 0, height: rect.height }}
          />
          <div
            className="region-rect"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          {dimsPos && (
            <div className="region-dims" style={dimsPos}>
              {t('region.dims', {
                w: Math.round(rect.width * scale),
                h: Math.round(rect.height * scale)
              })}
            </div>
          )}
        </>
      ) : (
        <div className="region-veil" style={{ inset: 0 }} />
      )}

      {!drag && <div className="region-hint">{t('region.hint')}</div>}

      {loupePos && shot && (
        <div className="region-loupe" style={loupePos}>
          <canvas ref={loupeRef} width={LOUPE_SIZE} height={LOUPE_SIZE} />
          <div className="region-loupe-info">
            {cursor
              ? `${Math.round(cursor.x * scale)}, ${Math.round(cursor.y * scale)}`
              : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function normalize(drag: Drag): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(drag.x0, drag.x1),
    y: Math.min(drag.y0, drag.y1),
    width: Math.abs(drag.x1 - drag.x0),
    height: Math.abs(drag.y1 - drag.y0)
  };
}
