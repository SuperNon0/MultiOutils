import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { registerLayer } from '../encre/ui';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

/**
 * Feuille « encre » rendue par React (fenêtre centrée sur grand écran, feuille
 * du bas sinon) : mêmes classes que le kit (voile, feuille, feuille-t,
 * feuille-c). Échap, le voile ou la croix appellent onClose.
 */
export function Feuille({
  titre,
  onClose,
  large = false,
  className = '',
  actions,
  children
}: {
  titre?: ReactNode;
  onClose(): void;
  large?: boolean;
  className?: string;
  /** Boutons ajoutés dans la barre de titre, avant la croix. */
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const { t } = useI18n();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = registerLayer(() => closeRef.current());
    const before = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const target = ref.current?.querySelector<HTMLElement>('[autofocus]');
      (target ?? ref.current)?.focus({ preventScroll: true });
    }, 40);
    return () => {
      window.clearTimeout(timer);
      layer.remove();
      before?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <>
      <div className="voile" onClick={() => closeRef.current()} />
      <div
        ref={ref}
        className={`feuille${large ? ' large' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="grab" aria-hidden="true" />
        {titre != null && (
          <div className="feuille-t">
            <span className="tt">{titre}</span>
            <span className="esp" />
            {actions}
            <button
              type="button"
              className="ib"
              aria-label={t('common.close')}
              onClick={() => closeRef.current()}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        )}
        <div className="feuille-c">{children}</div>
      </div>
    </>,
    document.body
  );
}
