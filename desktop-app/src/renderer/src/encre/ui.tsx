/**
 * Comportements du design « encre » en React : messages (toasts avec
 * « Annuler »), confirmations et questions intégrées (jamais d'alert(),
 * confirm(), prompt()), menus flottants et recherche rapide (Ctrl K).
 *
 * Pourquoi pas design-encre/encre.js tel quel ? Il est très bien pour un site
 * HTML, mais ses libellés sont écrits en dur en français (« Annuler »,
 * « Fermer », « Rien trouvé pour… ») alors que l'appli est FR/EN, et il
 * branche sa propre navigation par #adresse et son historique. Ici, les mêmes
 * briques sont rendues par React avec EXACTEMENT les classes du kit
 * (voile, feuille, conf, pop, mi, toasts, toast, palette, pal-g, pal-it…) :
 * l'apparence est identique, les textes sont traduits et l'état reste dans React.
 *
 * L'API est impérative (ui.toast, ui.confirmer…) pour être appelée depuis
 * n'importe quel composant ou module, comme Encre.toast dans le kit.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../host/Icon';
import { useI18n } from '../i18n';

/* ------------------------------------------------------------------ types */
export interface MenuItem {
  icone?: string;
  texte: string;
  touche?: string;
  danger?: boolean;
  action(): void;
}

export interface PaletteItem {
  id: string;
  groupe: string;
  titre: string;
  sous?: string;
  icone?: string;
  /** Mots-clés supplémentaires pour la recherche. */
  mots?: string;
  action(): void;
}

interface ToastEntry {
  id: number;
  message: string;
  erreur: boolean;
  annuler?: () => unknown;
  sortie: boolean;
}

type Layer =
  | {
      id: number;
      kind: 'confirm';
      message: string;
      titre?: string;
      detail?: string;
      ok?: string;
      danger?: boolean;
      resolve(v: boolean): void;
      sortie: boolean;
    }
  | {
      id: number;
      kind: 'ask';
      titre: string;
      label?: string;
      valeur?: string;
      placeholder?: string;
      ok?: string;
      resolve(v: string | null): void;
      sortie: boolean;
    }
  | {
      id: number;
      kind: 'menu';
      x: number;
      y: number;
      /** Rect du bouton : le menu s'aligne sur son bord droit. */
      anchor: { left: number; right: number; top: number; bottom: number } | null;
      titre?: string;
      items: Array<MenuItem | null>;
      sortie: boolean;
    }
  | { id: number; kind: 'palette'; sortie: boolean }
  /** Feuille rendue par un composant React (host/Feuille.tsx). */
  | { id: number; kind: 'custom'; onClose(): void; sortie: boolean };

interface State {
  toasts: ToastEntry[];
  layers: Layer[];
  palette: PaletteItem[];
}

/* ------------------------------------------------------------------ store */
let state: State = { toasts: [], layers: [], palette: [] };
const listeners = new Set<() => void>();
let seq = 0;

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  document.body.classList.toggle('overlay-ouvert', state.layers.some((l) => !l.sortie));
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Ferme une couche avec l'animation de sortie du kit (.sort). */
function closeLayer(id: number, after?: () => void): void {
  const layer = state.layers.find((l) => l.id === id);
  if (!layer || layer.sortie) return;
  set({ layers: state.layers.map((l) => (l.id === id ? { ...l, sortie: true } : l)) });
  after?.();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(
    () => set({ layers: state.layers.filter((l) => l.id !== id) }),
    layer.kind === 'menu' || reduce ? 0 : 200
  );
}

function closeTop(): boolean {
  const top = [...state.layers].reverse().find((l) => !l.sortie);
  if (!top) return false;
  dismiss(top);
  return true;
}

function dismiss(layer: Layer): void {
  if (layer.kind === 'confirm') closeLayer(layer.id, () => layer.resolve(false));
  else if (layer.kind === 'ask') closeLayer(layer.id, () => layer.resolve(null));
  else if (layer.kind === 'custom') layer.onClose();
  else closeLayer(layer.id);
}

/** Inscrit une feuille rendue par React dans la pile (Échap, barre cachée). */
export function registerLayer(onClose: () => void): { remove(): void } {
  const id = ++seq;
  set({ layers: [...state.layers, { id, kind: 'custom', onClose, sortie: false }] });
  return {
    remove() {
      set({ layers: state.layers.filter((l) => l.id !== id) });
    }
  };
}

function removeToast(id: number): void {
  if (!state.toasts.some((t) => t.id === id && !t.sortie)) return;
  set({ toasts: state.toasts.map((t) => (t.id === id ? { ...t, sortie: true } : t)) });
  window.setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), 220);
}

/* -------------------------------------------------------------------- API */
export const ui = {
  /** Message en bas ; avec `annuler`, un bouton « Annuler » reste 5 s. */
  toast(message: string, opts: { erreur?: boolean; annuler?: () => unknown; duree?: number } = {}): void {
    const id = ++seq;
    const entry: ToastEntry = {
      id,
      message,
      erreur: Boolean(opts.erreur),
      annuler: opts.annuler,
      sortie: false
    };
    set({ toasts: [...state.toasts.slice(-2), entry] });
    window.setTimeout(
      () => removeToast(id),
      opts.duree ?? (opts.annuler ? 5000 : opts.erreur ? 4500 : 2600)
    );
  },
  toastErr(error: unknown): void {
    ui.toast(error instanceof Error ? error.message : String(error), { erreur: true });
  },
  /** À la place de confirm() : se résout à true / false. */
  confirmer(
    message: string,
    opts: { ok?: string; danger?: boolean; titre?: string; detail?: string } = {}
  ): Promise<boolean> {
    return new Promise((resolve) => {
      set({
        layers: [...state.layers, { id: ++seq, kind: 'confirm', message, ...opts, resolve, sortie: false }]
      });
    });
  },
  /** À la place de prompt() : se résout au texte saisi, ou null. */
  demander(
    titre: string,
    opts: { label?: string; valeur?: string; placeholder?: string; ok?: string } = {}
  ): Promise<string | null> {
    return new Promise((resolve) => {
      set({ layers: [...state.layers, { id: ++seq, kind: 'ask', titre, ...opts, resolve, sortie: false }] });
    });
  },
  /** Menu flottant ; `ancre` = le bouton (ou un point, pour un clic droit). */
  menu(
    ancre: HTMLElement | { x: number; y: number },
    items: Array<MenuItem | null>,
    opts: { titre?: string } = {}
  ): void {
    const open = state.layers.filter((l) => l.kind === 'menu');
    open.forEach((l) => closeLayer(l.id));
    const rect = ancre instanceof HTMLElement ? ancre.getBoundingClientRect() : null;
    const anchor = rect
      ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
      : null;
    const x = rect ? rect.right : (ancre as { x: number }).x;
    const y = rect ? rect.bottom + 6 : (ancre as { y: number }).y;
    set({ layers: [...state.layers, { id: ++seq, kind: 'menu', x, y, anchor, items, ...opts, sortie: false }] });
  },
  palette: {
    setItems(items: PaletteItem[]): void {
      set({ palette: items });
    },
    open(): void {
      if (state.layers.some((l) => l.kind === 'palette' && !l.sortie)) return;
      set({ layers: [...state.layers, { id: ++seq, kind: 'palette', sortie: false }] });
    },
    toggle(): void {
      const p = state.layers.find((l) => l.kind === 'palette' && !l.sortie);
      if (p) closeLayer(p.id);
      else ui.palette.open();
    }
  }
};

/* ------------------------------------------------------------ composants */
const sansAccents = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const enSaisie = (el: Element | null): boolean =>
  !!el &&
  ((el as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Couche des briques « encre » : à monter une fois par fenêtre.
 * `palette` : active Ctrl K et « / » (fenêtre principale seulement).
 */
export function EncreLayer({ palette = false }: { palette?: boolean }): ReactNode {
  const s = useSyncExternalStore(subscribe, () => state);
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (palette && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.palette.toggle();
        return;
      }
      if (
        palette &&
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !enSaisie(document.activeElement) &&
        !state.layers.some((l) => !l.sortie)
      ) {
        e.preventDefault();
        ui.palette.open();
        return;
      }
      if (e.key === 'Escape' && state.layers.some((l) => !l.sortie)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTop();
      }
    };
    // capture : Échap ferme la couche du dessus avant les raccourcis des outils
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [palette]);

  return createPortal(
    <>
      {s.layers.map((layer) =>
        layer.kind === 'custom' ? null : layer.kind === 'confirm' ? (
          <Sheet key={layer.id} layer={layer} titre={layer.titre}>
            <div className="conf">
              <p className="msg">{layer.message}</p>
              {layer.detail && <p className="muted petit det">{layer.detail}</p>}
              <div className="bts">
                <button type="button" className="btn" onClick={() => dismiss(layer)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className={`btn ${layer.danger ? 'dn plein' : 'pri'}`}
                  autoFocus
                  onClick={() => closeLayer(layer.id, () => layer.resolve(true))}
                >
                  {layer.ok ?? t('common.confirm')}
                </button>
              </div>
            </div>
          </Sheet>
        ) : layer.kind === 'ask' ? (
          <AskSheet key={layer.id} layer={layer} />
        ) : layer.kind === 'menu' ? (
          <Menu key={layer.id} layer={layer} />
        ) : (
          <Palette key={layer.id} layer={layer} items={s.palette} />
        )
      )}
      <div className="toasts" aria-live="polite">
        {s.toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast${toast.erreur ? ' err' : ''}${toast.sortie ? ' sort' : ''}`}
            role={toast.erreur ? 'alert' : 'status'}
          >
            <Icon name={toast.erreur ? 'alert' : 'check'} size={20} />
            <span className="tx">{toast.message}</span>
            {toast.annuler && (
              <>
                <button
                  type="button"
                  className="a"
                  onClick={async () => {
                    removeToast(toast.id);
                    try {
                      await toast.annuler?.();
                      ui.toast(t('ui.undone'));
                    } catch (e) {
                      ui.toastErr(e);
                    }
                  }}
                >
                  {t('ui.undo')}
                </button>
                <span className="tm">
                  <i />
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

function Sheet({
  layer,
  titre,
  large,
  children
}: {
  layer: Layer;
  titre?: string;
  large?: boolean;
  children: ReactNode;
}): ReactNode {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const target = el?.querySelector<HTMLElement>('[autofocus], input, button.pri, button.dn');
    window.setTimeout(() => (target ?? el)?.focus({ preventScroll: true }), 40);
    return () => before?.focus?.({ preventScroll: true });
  }, []);
  return (
    <>
      <div className={`voile${layer.sortie ? ' sort' : ''}`} onClick={() => dismiss(layer)} />
      <div
        ref={ref}
        className={`feuille${large ? ' large' : ''}${layer.sortie ? ' sort' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
      >
        <div className="grab" aria-hidden="true" />
        {titre && (
          <div className="feuille-t">
            <span className="tt">{titre}</span>
            <span className="esp" />
            <button
              type="button"
              className="ib"
              aria-label={t('common.close')}
              onClick={() => dismiss(layer)}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        )}
        <div className="feuille-c">{children}</div>
      </div>
    </>
  );
}

function AskSheet({ layer }: { layer: Extract<Layer, { kind: 'ask' }> }): ReactNode {
  const { t } = useI18n();
  const [value, setValue] = useState(layer.valeur ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Sheet layer={layer} titre={layer.titre}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) {
            inputRef.current?.focus();
            return;
          }
          closeLayer(layer.id, () => layer.resolve(v));
        }}
      >
        {layer.label && (
          <label className="lbl" htmlFor="encre-champ">
            {layer.label}
          </label>
        )}
        <input
          ref={inputRef}
          className="input"
          id="encre-champ"
          autoComplete="off"
          autoFocus
          value={value}
          placeholder={layer.placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="conf">
          <div className="bts">
            <button type="button" className="btn" onClick={() => dismiss(layer)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn pri">
              {layer.ok ?? t('common.confirm')}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

function Menu({ layer }: { layer: Extract<Layer, { kind: 'menu' }> }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = layer.anchor ? layer.anchor.right - w : layer.x;
    let y = layer.y;
    if (y + h > window.innerHeight - 8) y = (layer.anchor ? layer.anchor.top - 6 : layer.y) - h;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
      top: Math.max(8, y)
    });
    window.setTimeout(() => el.querySelector<HTMLElement>('.mi')?.focus({ preventScroll: true }), 0);
    const outside = (e: PointerEvent): void => {
      if (!el.contains(e.target as Node)) closeLayer(layer.id);
    };
    const close = (): void => closeLayer(layer.id);
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [layer]);

  if (layer.sortie) return null;
  return (
    <div
      ref={ref}
      className="pop"
      role="menu"
      aria-label={layer.titre}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const bts = Array.from(ref.current?.querySelectorAll<HTMLElement>('.mi') ?? []);
        const i = bts.indexOf(document.activeElement as HTMLElement);
        bts[(i + (e.key === 'ArrowDown' ? 1 : -1) + bts.length) % bts.length]?.focus();
      }}
    >
      {layer.titre && <div className="pop-t">{layer.titre}</div>}
      {layer.items.map((it, i) =>
        it === null ? (
          <div key={`sep-${i}`} className="msep" />
        ) : (
          <button
            key={`${it.texte}-${i}`}
            type="button"
            role="menuitem"
            className={`mi${it.danger ? ' dn' : ''}`}
            onClick={() => {
              closeLayer(layer.id);
              it.action();
            }}
          >
            <Icon name={it.icone ?? 'dot'} />
            <span>{it.texte}</span>
            {it.touche && <span className="k">{it.touche}</span>}
          </button>
        )
      )}
    </div>
  );
}

function Palette({
  layer,
  items
}: {
  layer: Extract<Layer, { kind: 'palette' }>;
  items: PaletteItem[];
}): ReactNode {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const found = useMemo(() => {
    const q = sansAccents(query.trim());
    const hits = items.filter(
      (it) => !q || sansAccents(`${it.titre} ${it.sous ?? ''} ${it.mots ?? ''} ${it.groupe}`).includes(q)
    );
    return q ? hits.slice(0, 12) : hits;
  }, [items, query]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    resRef.current
      ?.querySelector(`.pal-it[data-i="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (i: number): void => {
    const it = found[i];
    if (!it) return;
    closeLayer(layer.id);
    it.action();
  };

  const groups: Array<{ titre: string; items: Array<{ it: PaletteItem; i: number }> }> = [];
  found.forEach((it, i) => {
    let g = groups.find((x) => x.titre === it.groupe);
    if (!g) groups.push((g = { titre: it.groupe, items: [] }));
    g.items.push({ it, i });
  });

  return (
    <>
      <div className={`voile flou${layer.sortie ? ' sort' : ''}`} onClick={() => closeLayer(layer.id)} />
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.label')}>
        <label className="champ">
          <Icon name="search" />
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            aria-label={t('palette.label')}
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!found.length) return;
                setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(sel);
              }
            }}
          />
          <button type="button" className="kbd" onClick={() => closeLayer(layer.id)}>
            {t('palette.esc')}
          </button>
        </label>
        <div className="res-p" ref={resRef} role="listbox">
          {groups.map((g) => (
            <div key={g.titre}>
              <div className="pal-g">
                <Icon name="zap" size={16} />
                {g.titre}
              </div>
              {g.items.map(({ it, i }) => (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  data-i={i}
                  className={`pal-it${i === sel ? ' on' : ''}`}
                  onPointerMove={() => i !== sel && setSel(i)}
                  onClick={() => run(i)}
                >
                  <span className="ico">
                    <Icon name={it.icone ?? 'arrow'} />
                  </span>
                  <span className="tx">
                    <b>{it.titre}</b>
                    {it.sous && <span>{it.sous}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {found.length === 0 && query.trim() && (
            <p className="muted petit" style={{ padding: '12px 10px' }}>
              {t('palette.none', { q: query.trim() })}
            </p>
          )}
        </div>
        <div className="pal-pied">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> {t('palette.choose')}
          </span>
          <span>
            <span className="kbd">{t('palette.enter')}</span> {t('palette.open')}
          </span>
          <span>
            <span className="kbd">{t('palette.esc')}</span> {t('palette.close')}
          </span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------- bulle « ? » (Aide) */
/** Ferme la bulle ouverte (une seule à la fois, comme dans encre.js). */
let fermerBulleOuverte: (() => void) | null = null;

/**
 * Bouton « ? » du kit (`class="q"`) qui ouvre une bulle d'explication
 * (`class="bulle"`) : un titre, un texte, et un exemple facultatif dans un
 * `pre` (libellé `.k`). Même placement que encre.js : sous le bouton, ou
 * au-dessus s'il n'y a pas la place. Se ferme au clic ailleurs, avec Échap,
 * au défilement ou en cliquant de nouveau sur « ? ».
 */
export function Aide({
  titre,
  texte,
  exemple,
  exempleLabel
}: {
  titre?: ReactNode;
  texte: ReactNode;
  /** Un exemple concret (plusieurs lignes possibles). */
  exemple?: string;
  /** Libellé au-dessus de l'exemple (« Exemple » par défaut). */
  exempleLabel?: string;
}): ReactNode {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const qRef = useRef<HTMLButtonElement>(null);
  const bRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const fermer = (): void => setOpen(false);
    fermerBulleOuverte?.();
    fermerBulleOuverte = fermer;

    const q = qRef.current;
    const el = bRef.current;
    if (q && el) {
      const r = q.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
      setPos({ left, top });
    }

    const dehors = (e: PointerEvent): void => {
      const cible = e.target as Node;
      if (!bRef.current?.contains(cible) && !qRef.current?.contains(cible)) fermer();
    };
    const touche = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fermer();
      qRef.current?.focus({ preventScroll: true });
    };
    const defile = (e: Event): void => {
      if (!bRef.current?.contains(e.target as Node)) fermer();
    };
    document.addEventListener('pointerdown', dehors, true);
    window.addEventListener('keydown', touche, true);
    window.addEventListener('scroll', defile, true);
    window.addEventListener('resize', fermer);
    window.addEventListener('blur', fermer);
    return () => {
      if (fermerBulleOuverte === fermer) fermerBulleOuverte = null;
      document.removeEventListener('pointerdown', dehors, true);
      window.removeEventListener('keydown', touche, true);
      window.removeEventListener('scroll', defile, true);
      window.removeEventListener('resize', fermer);
      window.removeEventListener('blur', fermer);
    };
  }, [open]);

  const nom = typeof titre === 'string' ? titre : undefined;
  return (
    <>
      <button
        ref={qRef}
        type="button"
        className="q"
        aria-label={nom ? t('aide.about', { name: nom }) : t('aide.label')}
        aria-expanded={open}
        onClick={(e) => {
          // dans une ligne <label>, le clic ne doit pas basculer l'interrupteur
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
            ref={bRef}
            className="bulle"
            role="tooltip"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          >
            {titre && <b>{titre}</b>}
            <div>{texte}</div>
            {exemple && (
              <>
                <div className="k">{exempleLabel ?? t('aide.example')}</div>
                <pre>{exemple}</pre>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
