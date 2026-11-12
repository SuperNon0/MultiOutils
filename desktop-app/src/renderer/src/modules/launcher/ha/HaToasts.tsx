/**
 * Fenêtre #/ha-toasts : pile de pop-ups envoyées par Home Assistant.
 * Chaque carte a sa barre de temps (en pause au survol), son image, ses
 * boutons d'action ; un clic sur la carte ouvre le lien (ou le tableau de
 * bord). La hauteur de la pile est renvoyée au main pour ajuster la fenêtre.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { HaNotification, HaToastMsg } from '../../../../../common/launcher';
import { Icon } from '../../../host/Icon';
import { useI18n } from '../../../i18n';
import { playHaSound } from './sounds';
import './ha.css';

const ACCENTS = ['lavande', 'or', 'ambre', 'corail', 'menthe'];

function Toast({ n, hovered }: { n: HaNotification; hovered: boolean }): ReactNode {
  const { t, lang } = useI18n();
  const [left, setLeft] = useState(n.duration * 1000);
  const last = useRef(Date.now());

  // compte à rebours, en pause au survol de la pile
  useEffect(() => {
    if (n.duration <= 0) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - last.current;
      last.current = now;
      if (hovered) return;
      setLeft((l) => {
        const next = l - dt;
        if (next <= 0) window.api.ha.toastDismiss(n.id);
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [n.id, n.duration, hovered]);

  const accent = n.color && ACCENTS.includes(n.color) ? n.color : undefined;
  const style = (
    n.color && !accent ? { '--ha-c': n.color } : accent ? { '--ha-c': `var(--sw-${accent})` } : {}
  ) as CSSProperties;
  const emoji = n.icon && !/^[a-z]+$/.test(n.icon) ? n.icon : null;
  const time = new Date(n.receivedAt).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={`hat${n.important ? ' imp' : ''}${n.color ? ' col' : ''}${n.size && n.size !== 'normal' ? ` sz-${n.size}` : ''}`}
      style={style}
      role="alert"
      onClick={() => window.api.ha.toastOpen(n.id)}
    >
      <div className="hat-tete">
        <span className="hat-ic">{emoji ?? <Icon name={n.icon ?? 'home'} size={18} />}</span>
        <div className="hat-tx">
          <div className="hat-titre">{n.title}</div>
          <div className="hat-meta">
            Home Assistant · {time}
            {n.important && <span className="hat-badge">{t('ha.toast.important')}</span>}
          </div>
        </div>
        <button
          type="button"
          className="hat-x"
          aria-label={t('common.close')}
          onClick={(e) => {
            e.stopPropagation();
            window.api.ha.toastDismiss(n.id);
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      {n.message && <div className="hat-msg">{n.message}</div>}
      {n.image && <img className="hat-img" src={n.image} alt="" draggable={false} />}
      {n.actions.length > 0 && (
        <div className="hat-actions">
          {n.actions.map((a) => (
            <button
              key={a.action}
              type="button"
              className={`btn sm${a.danger ? ' dan' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                window.api.ha.toastAction(n.id, a.action);
              }}
            >
              {a.uri && <Icon name="external" size={14} />}
              {a.title}
            </button>
          ))}
        </div>
      )}
      {n.duration > 0 && (
        <div className="hat-temps" aria-hidden>
          <span style={{ transform: `scaleX(${Math.max(0, left / (n.duration * 1000))})` }} />
        </div>
      )}
    </div>
  );
}

export function HaToasts(): ReactNode {
  const [msg, setMsg] = useState<HaToastMsg>({ toasts: [], position: 'bottom-right', volume: 70 });
  const [hovered, setHovered] = useState(false);
  const seen = useRef(new Set<string>());
  const pile = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.dataset.fenetre = 'ha-toasts';
    const apply = (m: HaToastMsg | null): void => {
      if (!m) return;
      // son pour chaque nouvelle notification
      const fresh = m.toasts.filter((x) => !seen.current.has(x.id));
      fresh.forEach((x) => seen.current.add(x.id));
      const loud = fresh.find((x) => x.sound);
      if (loud) playHaSound(loud, loud.volume ?? m.volume);
      if (m.toasts.length === 0) setHovered(false);
      setMsg(m);
    };
    void window.api.ha.toasts().then(apply);
    return window.api.ha.onToasts(apply);
  }, []);

  useLayoutEffect(() => {
    const el = pile.current;
    if (!el) return;
    const report = (): void => window.api.ha.toastResize(Math.ceil(el.getBoundingClientRect().height));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bottom = msg.position.startsWith('bottom');
  // en bas : la plus récente tout en bas, près de la barre des tâches
  const list = bottom ? [...msg.toasts].reverse() : msg.toasts;
  return (
    <div
      ref={pile}
      className={`hat-pile ${msg.position}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {list.map((n) => (
        <Toast key={n.id} n={n} hovered={hovered} />
      ))}
    </div>
  );
}
