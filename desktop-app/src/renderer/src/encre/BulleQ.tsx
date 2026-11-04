import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

/**
 * Bulle « ? » du kit « encre » (T4, classes `q` / `bulle`) : un petit bouton
 * rond à côté d'un réglage ; un clic ouvre une explication courte, un clic
 * ailleurs, Échap ou le défilement la referment. Même rendu que
 * Encre.ouvrirBulle() de design-encre/encre.js, mais en React (textes traduits).
 */
export function BulleQ({ titre, children }: { titre?: ReactNode; children: ReactNode }): ReactNode {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const bulleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const q = btnRef.current;
    const el = bulleRef.current;
    if (!q || !el) return;
    const r = q.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (): void => setOpen(false);
    const outside = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (!bulleRef.current?.contains(target) && !btnRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Échap ferme la bulle avant la feuille / couche du dessous
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="q"
        aria-label={t('ui.explain')}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            ref={bulleRef}
            className="bulle"
            role="tooltip"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          >
            {titre && <b>{titre}</b>}
            <div>{children}</div>
          </div>,
          document.body
        )}
    </>
  );
}
