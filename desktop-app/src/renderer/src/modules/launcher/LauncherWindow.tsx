/**
 * Fenêtre du lanceur (route #/launcher) : barre de recherche + résultats,
 * dans le style « encre » (palette de recherche en verre).
 *
 * Clavier : ↑↓ / Tab / Maj+Tab naviguer · Entrée ouvrir · Ctrl+Entrée action
 * secondaire · Maj+Entrée ou → menu d'actions · Ctrl+Maj+Entrée administrateur
 * · Alt+1…9 ouvrir le n-ième · Échap fermer.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type {
  LauncherAction,
  LauncherExecMode,
  LauncherOutcome,
  LauncherResult,
  LauncherState
} from '../../../../common/launcher';
import '../../encre/polices.css';
import '../../encre/encre.css';
import sprite from '../../encre/icones.svg?raw';
import { I18nProvider, useI18n } from '../../i18n';
import { cycleIndex, resolveTheme, splitHighlight } from './highlight';
import './launcher.css';

const iconCache = new Map<string, string | null>();

export function Ico({ name, className = '' }: { name: string; className?: string }): ReactNode {
  return (
    <svg className={`i ${className}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

function ResultIcon({ result }: { result: LauncherResult }): ReactNode {
  const icon = result.icon;
  const filePath = icon.kind === 'file' ? icon.path : null;
  const [src, setSrc] = useState<string | null>(filePath ? (iconCache.get(filePath) ?? null) : null);
  useEffect(() => {
    if (!filePath || iconCache.has(filePath)) return;
    let alive = true;
    void window.api.launcher.icon(filePath).then((url) => {
      iconCache.set(filePath, url);
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [filePath]);
  if (src) return <span className="ico lz-img"><img src={src} alt="" draggable={false} /></span>;
  const fallback = icon.kind === 'sprite' ? icon.name : result.providerId === 'files' ? 'list' : 'grid';
  return (
    <span className="ico">
      <Ico name={fallback} className="s18" />
    </span>
  );
}

function Hl({ text, indices }: { text: string; indices?: number[] }): ReactNode {
  return (
    <>
      {splitHighlight(text, indices).map((s, i) =>
        s.hl ? (
          <mark key={i} className="lz-hl">
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </>
  );
}

/** Applique accent + thème du design « encre » sur <html>. */
function useAppearance(state: LauncherState | null): void {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('mo-launcher');
    if (!state) return;
    html.lang = state.lang;
    html.dataset.accent = state.appearance.accent;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = (): void => {
      html.dataset.theme = resolveTheme(state.appearance.theme, media.matches);
      if (state.appearance.theme === 'auto') html.dataset.encreAuto = '';
      else delete html.dataset.encreAuto;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state]);
}

export function LauncherWindow(): ReactNode {
  const [state, setState] = useState<LauncherState | null>(null);
  useAppearance(state);

  useEffect(() => {
    void window.api.launcher.getState().then(setState);
    return window.api.launcher.onState(setState);
  }, []);

  return (
    <>
      <div className="lz-sprite" dangerouslySetInnerHTML={{ __html: sprite }} />
      {state && (
        <I18nProvider lang={state.lang}>
          <Launcher state={state} />
        </I18nProvider>
      )}
    </>
  );
}

type Mode =
  | { kind: 'results' }
  | { kind: 'actions'; result: LauncherResult; actions: LauncherAction[]; index: number }
  | { kind: 'confirm'; message: string; run: () => void };

const PROVIDER_LABEL: Record<string, string> = {
  programs: 'launcher.provider.programs',
  files: 'launcher.provider.files',
  calculator: 'launcher.provider.calculator',
  websearch: 'launcher.provider.websearch',
  url: 'launcher.provider.url',
  shell: 'launcher.provider.shell',
  system: 'launcher.provider.system',
  winsettings: 'launcher.provider.winsettings',
  processes: 'launcher.provider.processes',
  bookmarks: 'launcher.provider.bookmarks',
  tools: 'launcher.provider.tools',
  history: 'launcher.provider.history'
};

function Launcher({ state }: { state: LauncherState }): ReactNode {
  const { t } = useI18n();
  const settings = state.settings;
  const [query, setQuery] = useState(state.lastQuery ?? '');
  const [results, setResults] = useState<LauncherResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'results' });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queryIdRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  // ── requêtes ──────────────────────────────────────────────────────────
  const runQuery = useCallback((text: string, immediate = false) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const go = (): void => {
      const id = ++queryIdRef.current;
      setLoading(true);
      void window.api.launcher.query(text, id);
    };
    if (immediate || settings.debounceMs === 0) go();
    else debounceRef.current = setTimeout(go, settings.debounceMs);
  }, [settings.debounceMs]);

  useEffect(() => {
    return window.api.launcher.onResults((msg) => {
      if (msg.queryId !== queryIdRef.current) return; // réponse périmée
      setResults(msg.results);
      setLoading(!msg.done);
      // garde la sélection sur le même résultat quand la liste se complète
      const keep = selectedIdRef.current
        ? msg.results.findIndex((r) => r.title + r.subtitle === selectedIdRef.current)
        : -1;
      setSelected(keep >= 0 ? keep : 0);
    });
  }, []);

  useEffect(() => {
    runQuery(query, true);
    inputRef.current?.focus();
    if (settings.lastQuery === 'selected') inputRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ouverture / fermeture ─────────────────────────────────────────────
  useEffect(() => {
    const offShown = window.api.launcher.onShown(() => {
      setError(null);
      setMode({ kind: 'results' });
      const input = inputRef.current;
      if (settings.lastQuery === 'empty') {
        setQuery('');
        runQuery('', true);
      } else {
        runQuery(queryRef.current, true);
      }
      requestAnimationFrame(() => {
        input?.focus();
        if (settings.lastQuery === 'selected') input?.select();
        else if (input) input.setSelectionRange(input.value.length, input.value.length);
      });
    });
    const offHidden = window.api.launcher.onHidden(() => {
      setMode({ kind: 'results' });
      if (settings.lastQuery === 'empty') setQuery('');
    });
    return () => {
      offShown();
      offHidden();
    };
  }, [runQuery, settings.lastQuery]);

  // ── taille de la fenêtre = taille de la palette ───────────────────────
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const send = (): void => window.api.launcher.resize(Math.ceil(el.getBoundingClientRect().height));
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // garde l'élément sélectionné visible
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.pal-it.on');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, mode]);

  const current = results[selected];
  selectedIdRef.current = current ? current.title + current.subtitle : null;

  // ── actions ───────────────────────────────────────────────────────────
  const applyOutcome = (outcome: LauncherOutcome): void => {
    if (outcome.kind === 'query') {
      setMode({ kind: 'results' });
      setQuery(outcome.text);
      runQuery(outcome.text, true);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (outcome.kind === 'error') {
      setError(outcome.message);
    } else if (outcome.kind === 'hide') {
      setMode({ kind: 'results' });
    }
  };

  const withConfirm = (message: string | undefined, run: () => void): void => {
    if (message) setMode({ kind: 'confirm', message, run });
    else run();
  };

  const execute = (result: LauncherResult | undefined, execMode: LauncherExecMode): void => {
    if (!result) return;
    if (execMode === 'secondary' && !result.secondary) execMode = 'primary';
    if (execMode === 'admin' && !result.canAdmin) execMode = 'primary';
    const run = (): void => {
      void window.api.launcher.execute(result.id, execMode, queryRef.current).then(applyOutcome);
    };
    withConfirm(execMode === 'primary' ? result.confirm : undefined, run);
  };

  const openActions = async (result: LauncherResult | undefined): Promise<void> => {
    if (!result || !result.hasContext) return;
    const actions = await window.api.launcher.actions(result.id);
    if (actions.length > 0) setMode({ kind: 'actions', result, actions, index: 0 });
  };

  const runAction = (result: LauncherResult, action: LauncherAction): void => {
    withConfirm(action.confirm, () => {
      void window.api.launcher.runAction(result.id, action.id, queryRef.current).then(applyOutcome);
    });
  };

  const onChange = (text: string): void => {
    setQuery(text);
    setError(null);
    setMode({ kind: 'results' });
    selectedIdRef.current = null;
    runQuery(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    const key = e.key;
    // confirmation
    if (mode.kind === 'confirm') {
      if (key === 'Enter') {
        e.preventDefault();
        const run = mode.run;
        setMode({ kind: 'results' });
        run();
      } else if (key === 'Escape') {
        e.preventDefault();
        setMode({ kind: 'results' });
      }
      return;
    }
    // menu d'actions
    if (mode.kind === 'actions') {
      const n = mode.actions.length;
      if (key === 'ArrowDown' || (key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setMode({ ...mode, index: cycleIndex(mode.index, 1, n) });
      } else if (key === 'ArrowUp' || (key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setMode({ ...mode, index: cycleIndex(mode.index, -1, n) });
      } else if (key === 'Enter') {
        e.preventDefault();
        runAction(mode.result, mode.actions[mode.index]);
      } else if (key === 'Escape' || key === 'ArrowLeft' || (key === 'Enter' && e.shiftKey)) {
        e.preventDefault();
        setMode({ kind: 'results' });
      } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        const a = mode.actions[Number(e.code.slice(5)) - 1];
        if (a) runAction(mode.result, a);
      }
      return;
    }
    // liste des résultats
    const n = results.length;
    if (key === 'Escape') {
      e.preventDefault();
      window.api.launcher.hide();
    } else if (key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => cycleIndex(s, 1, n));
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => cycleIndex(s, -1, n));
    } else if (key === 'PageDown') {
      e.preventDefault();
      setSelected((s) => Math.min(n - 1, s + 5));
    } else if (key === 'PageUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 5));
    } else if (key === 'Tab') {
      e.preventDefault();
      // autocomplétion d'abord (chemins, historique), sinon navigation
      if (!e.shiftKey && current?.autoComplete && current.autoComplete !== query) onChange(current.autoComplete);
      else setSelected((s) => cycleIndex(s, e.shiftKey ? -1 : 1, n));
    } else if (key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && !e.ctrlKey) void openActions(current);
      else execute(current, e.ctrlKey && e.shiftKey ? 'admin' : e.ctrlKey ? 'secondary' : 'primary');
    } else if (key === 'ArrowRight') {
      const input = e.currentTarget;
      if (current?.hasContext && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
        e.preventDefault();
        void openActions(current);
      }
    } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      execute(results[Number(e.code.slice(5)) - 1], 'primary');
    }
  };

  const keywordBadge = ((): string | null => {
    const q = query.trimStart().toLowerCase();
    for (const [id, cfg] of Object.entries(settings.providers)) {
      if (!cfg.enabled || !cfg.keyword) continue;
      const kw = cfg.keyword.toLowerCase();
      if (q.startsWith(kw) && (/[^\p{L}\p{N}]/u.test(kw) ? true : /^\s/.test(q.slice(kw.length)))) {
        return t(PROVIDER_LABEL[id]);
      }
    }
    for (const eng of settings.webEngines) {
      if (!eng.enabled || !eng.keyword) continue;
      const kw = eng.keyword.toLowerCase();
      if (q.startsWith(kw) && /^\s/.test(q.slice(kw.length))) return eng.name;
    }
    return null;
  })();

  const emptyQuery = !query.trim();

  return (
    <div className="lz-shell" ref={shellRef}>
      <div className="palette lz" role="dialog" aria-label={t('launcher.title')}>
        <div className="champ lz-champ">
          <Ico name={loading ? 'spin' : 'search'} className={`s22 ${loading ? 'lz-spin' : ''}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('launcher.placeholder')}
            aria-label={t('launcher.placeholder')}
            aria-controls="lz-list"
            aria-activedescendant={current ? `lz-r-${selected}` : undefined}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {keywordBadge && <span className="etq lz-kw">{keywordBadge}</span>}
          <button type="button" className="kbd" onClick={() => window.api.launcher.hide()} tabIndex={-1}>
            {t('launcher.key.esc')}
          </button>
        </div>

        {mode.kind === 'confirm' ? (
          <div className="lz-confirm" role="alertdialog">
            <Ico name="alert" className="s22" />
            <p>{mode.message}</p>
            <div className="bts">
              <button type="button" className="btn sm gh" onClick={() => setMode({ kind: 'results' })}>
                {t('launcher.confirm.cancel')} <span className="kbd">{t('launcher.key.esc')}</span>
              </button>
              <button
                type="button"
                className="btn sm dn plein"
                onClick={() => {
                  const run = mode.run;
                  setMode({ kind: 'results' });
                  run();
                }}
              >
                {t('launcher.confirm.ok')} <span className="kbd">{t('launcher.key.enter')}</span>
              </button>
            </div>
          </div>
        ) : mode.kind === 'actions' ? (
          <div className="res-p lz-list" ref={listRef} id="lz-list" role="listbox">
            <div className="pal-g">
              <button type="button" className="lz-back" onClick={() => setMode({ kind: 'results' })}>
                <Ico name="chevl" className="s16" />
              </button>
              {t('launcher.actionsFor', { title: mode.result.title })}
            </div>
            {mode.actions.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={i === mode.index}
                className={`pal-it ${i === mode.index ? 'on' : ''} ${a.danger ? 'lz-danger' : ''}`}
                onMouseEnter={() => setMode({ ...mode, index: i })}
                onClick={() => runAction(mode.result, a)}
              >
                <span className="ico">
                  <Ico name={a.icon} className="s18" />
                </span>
                <span className="tx">
                  <b>{a.title}</b>
                </span>
                {a.hint ? <span className="kbd">{a.hint}</span> : i < 9 ? <span className="kbd lz-alt">Alt {i + 1}</span> : null}
              </button>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="res-p lz-list" ref={listRef} id="lz-list" role="listbox">
            {emptyQuery && <div className="pal-g">{t('launcher.recent')}</div>}
            {results.map((r, i) => (
              <button
                key={r.id}
                id={`lz-r-${i}`}
                type="button"
                role="option"
                aria-selected={i === selected}
                className={`pal-it ${i === selected ? 'on' : ''} ${r.providerId === 'calculator' ? 'lz-calc' : ''}`}
                onMouseMove={() => i !== selected && setSelected(i)}
                onClick={(e) => execute(r, e.ctrlKey ? 'secondary' : 'primary')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelected(i);
                  void openActions(r);
                }}
              >
                <ResultIcon result={r} />
                <span className="tx">
                  <b>
                    <Hl text={r.title} indices={r.titleHl} />
                  </b>
                  {r.subtitle && (
                    <span>
                      <Hl text={r.subtitle} indices={r.subtitleHl} />
                    </span>
                  )}
                </span>
                {i === selected ? (
                  <span className="lz-go">
                    {r.hasContext && <Ico name="dots" className="s16" />}
                    <span className="kbd">{t('launcher.key.enter')}</span>
                  </span>
                ) : (
                  <>
                    <span className="etq lz-src">{t(PROVIDER_LABEL[r.providerId] ?? r.providerId)}</span>
                    {i < 9 && <span className="kbd lz-alt">Alt {i + 1}</span>}
                  </>
                )}
              </button>
            ))}
          </div>
        ) : !emptyQuery && !loading ? (
          <div className="lz-vide">
            <Ico name="search" className="s18" />
            <span>{t('launcher.noResult')}</span>
          </div>
        ) : null}

        {error && (
          <div className="statut err lz-err">
            <Ico name="alert" className="s16" /> {error}
          </div>
        )}

        {(results.length > 0 || mode.kind !== 'results') && (
          <div className="pal-pied lz-pied">
            {mode.kind === 'confirm' ? (
              <>
                <span><span className="kbd">{t('launcher.key.enter')}</span> {t('launcher.confirm.ok').toLowerCase()}</span>
                <span><span className="kbd">{t('launcher.key.esc')}</span> {t('launcher.confirm.cancel').toLowerCase()}</span>
              </>
            ) : mode.kind === 'actions' ? (
              <>
                <span><span className="kbd">↑↓</span> {t('launcher.hint.move')}</span>
                <span><span className="kbd">{t('launcher.key.enter')}</span> {t('launcher.hint.run')}</span>
                <span><span className="kbd">←</span> {t('launcher.hint.back')}</span>
              </>
            ) : (
              <>
                <span><span className="kbd">↑↓</span> {t('launcher.hint.move')}</span>
                <span><span className="kbd">{t('launcher.key.enter')}</span> {t('launcher.hint.open')}</span>
                {current?.secondary && (
                  <span><span className="kbd">Ctrl {t('launcher.key.enter')}</span> {current.secondary}</span>
                )}
                {current?.hasContext && (
                  <span><span className="kbd">{t('launcher.key.shiftEnter')}</span> {t('launcher.hint.actions')}</span>
                )}
                {current?.autoComplete && current.autoComplete !== query && (
                  <span><span className="kbd">Tab</span> {t('launcher.hint.complete')}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
