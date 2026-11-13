import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ZONE_MIN_HEIGHT, ZONE_MIN_WIDTH, type Rect, type ZoneKind } from '../../../../common/desktop';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import './desktop.css';

/**
 * Calque plein écran pour dessiner une nouvelle zone (route #/zone-draw/<écran>) :
 * on trace un rectangle, puis on choisit « zone » ou « dossier ».
 */
export function ZoneDraw({ displayId }: { displayId: string }): ReactNode {
  const { t } = useI18n();
  const [rect, setRect] = useState<Rect | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.desktop.drawCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const down = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    if (done) {
      if (!(ev.target as HTMLElement).closest('.pop')) {
        setDone(false);
        setRect(null);
      }
      return;
    }
    if (ev.button !== 0) {
      window.api.desktop.drawCancel();
      return;
    }
    const el = ev.currentTarget;
    el.setPointerCapture(ev.pointerId);
    const ox = ev.clientX;
    const oy = ev.clientY;
    const move = (e: PointerEvent): void => {
      setRect({ x: Math.min(ox, e.clientX), y: Math.min(oy, e.clientY), width: Math.abs(e.clientX - ox), height: Math.abs(e.clientY - oy) });
    };
    const up = (e: PointerEvent): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      const r = { x: Math.min(ox, e.clientX), y: Math.min(oy, e.clientY), width: Math.abs(e.clientX - ox), height: Math.abs(e.clientY - oy) };
      if (r.width < 24 || r.height < 24) {
        setRect(null);
        return;
      }
      setRect({ ...r, width: Math.max(ZONE_MIN_WIDTH, r.width), height: Math.max(ZONE_MIN_HEIGHT * 3, r.height) });
      setDone(true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const create = (kind: ZoneKind): void => {
    if (rect) window.api.desktop.drawDone({ displayId, rect, kind });
  };

  const menuLeft = rect ? Math.min(rect.x + rect.width + 12, window.innerWidth - 280) : 0;
  const menuTop = rect ? Math.min(rect.y, window.innerHeight - 200) : 0;

  return (
    <div className="zd" onPointerDown={down} onContextMenu={(e) => e.preventDefault()}>
      {!rect && (
        <div className="zd-hint">
          <Icon name="grid" size={16} />
          {t('desktop.draw.hint')}
          <span className="kbd">{t('desktop.draw.esc')}</span>
        </div>
      )}
      {rect && (
        <>
          <div className="zd-rect" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
          <div className="zd-size" style={{ left: rect.x, top: rect.y + rect.height + 8 }}>
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </div>
        </>
      )}
      {done && rect && (
        <div className="pop" style={{ left: menuLeft, top: menuTop }}>
          <div className="pop-t">{t('desktop.draw.title')}</div>
          <button className="mi" autoFocus onClick={() => create('shortcuts')}>
            <Icon name="grid" size={18} />
            {t('desktop.draw.zone')}
          </button>
          <button className="mi" onClick={() => create('folder')}>
            <Icon name="folderopen" size={18} />
            {t('desktop.draw.folder')}
          </button>
          <div className="msep" />
          <button className="mi" onClick={() => window.api.desktop.drawCancel()}>
            <Icon name="x" size={18} />
            {t('desktop.draw.cancel')}
            <span className="k">{t('desktop.draw.esc')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
