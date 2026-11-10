import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  OCR_LANGS,
  type AiConfig,
  type AiSavedTranslation,
  type AiTranslateResult,
  type AppSettings,
  type CaptureListItem,
  type OcrLang
} from '../../../../common/types';
import { Feuille } from '../../host/Feuille';
import { formatTokens, formatUsd } from '../../host/DepensesIA';
import { COMMON_TARGET_LANGS } from '../../host/TraductionReglages';
import { useHost } from '../../host/context';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import { formatDate } from '../../lib/format';

/**
 * Feuilles « Extraire le texte » (OCR local, Tesseract) et « Traduire (IA) »
 * d'une capture, ouvertes depuis le menu ⋯ / clic droit de la bibliothèque,
 * la barre rapide post-capture ou le lanceur (« latest » = dernière capture).
 */
type SheetKind = 'ocr' | 'translate';
interface SheetReq {
  kind: SheetKind;
  captureId: string;
  n: number;
}

let current: SheetReq | null = null;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

export const captureText = {
  /** captureId 'latest' : la capture la plus récente de la bibliothèque. */
  open(kind: SheetKind, captureId: string): void {
    current = { kind, captureId, n: Date.now() };
    emit();
  },
  close(): void {
    current = null;
    emit();
  }
};

/** À monter une fois (panneau Capture d'écran). */
export function CaptureTextLayer(): ReactNode {
  const req = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current
  );
  if (!req) return null;
  return req.kind === 'ocr' ? (
    <OcrSheet key={req.n} captureId={req.captureId} />
  ) : (
    <TranslateSheet key={req.n} captureId={req.captureId} />
  );
}

/** Capture visée (id ou 'latest'), lue dans la bibliothèque. */
function useCapture(captureId: string): CaptureListItem | null | undefined {
  const [capture, setCapture] = useState<CaptureListItem | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void window.api.library.list({ view: 'library', sort: 'date' }).then((items) => {
      if (!alive) return;
      setCapture((captureId === 'latest' ? items[0] : items.find((c) => c.id === captureId)) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [captureId]);
  return capture;
}

function SheetTitle({ titre, capture }: { titre: string; capture: CaptureListItem | null | undefined }): ReactNode {
  const { lang } = useI18n();
  return (
    <span className="apercu-t">
      <span className="apercu-nom">{titre}</span>
      {capture && (
        <span className="apercu-sous">
          {capture.filename} · {formatDate(capture.createdAt, lang)}
        </span>
      )}
    </span>
  );
}

/** Bouton « Copier » de la brique `copie` du kit : passe à « Copié » 1,8 s. */
export function BoutonCopier({ texte, label }: { texte: string; label?: string }): ReactNode {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      className="btn sm"
      disabled={!texte}
      aria-label={label}
      onClick={() => {
        void window.api.system.copyText(texte).then(() => {
          setDone(true);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setDone(false), 1800);
        });
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={16} />
      {done ? t('text.copied') : t('text.copy')}
    </button>
  );
}

/** Zone de texte modifiable + Copier (brique `copie` du kit, version multiligne). */
function TexteCopiable({
  id,
  label,
  value,
  onChange,
  onBlur
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange(v: string): void;
  onBlur?(): void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className="texte-bloc">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <div className="copie copie-texte">
        <textarea
          id={id}
          className="texte-zone"
          value={value}
          spellCheck={false}
          placeholder={t('text.emptyPlaceholder')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <BoutonCopier texte={value} />
      </div>
    </div>
  );
}

function Attente({ texte }: { texte: string }): ReactNode {
  return (
    <div className="attente" role="status" aria-live="polite">
      <Icon name="spin" size={22} />
      <span>{texte}</span>
    </div>
  );
}

/* --------------------------------------------------------- Extraire le texte */
function OcrSheet({ captureId }: { captureId: string }): ReactNode {
  const { t } = useI18n();
  const capture = useCapture(captureId);
  const [lang, setLang] = useState<OcrLang | null>(null);
  const [working, setWorking] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    void window.api.settings.get().then((s) => setLang(s.ocrLang ?? 'fra'));
  }, []);

  useEffect(() => {
    if (!capture || !lang) return;
    const n = ++run.current;
    setWorking(true);
    setError(null);
    setEmpty(false);
    void window.api.ocr.extract(capture.id, lang).then((res) => {
      if (n !== run.current) return;
      setWorking(false);
      if (res.ok) {
        setText(res.text);
        setEmpty(!res.text);
      } else {
        setError(t('ocr.error', { msg: res.error }));
      }
    });
  }, [capture, lang, t]);

  const changeLang = (v: OcrLang): void => {
    setLang(v);
    void window.api.settings.set({ ocrLang: v });
  };

  return (
    <Feuille
      large
      className="texte-feuille"
      titre={<SheetTitle titre={t('text.ocr.title')} capture={capture} />}
      onClose={captureText.close}
    >
      {capture === null ? (
        <div className="vide">
          <Icon name="camera" />
          <span>{t('text.noCapture')}</span>
        </div>
      ) : (
        <div className="form">
          <div className="texte-barre">
            <label className="lbl" htmlFor="ocr-lang">
              {t('ocr.lang')}
            </label>
            <select
              id="ocr-lang"
              className="select sm"
              value={lang ?? 'fra'}
              disabled={working}
              onChange={(e) => changeLang(e.target.value as OcrLang)}
            >
              {OCR_LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`ocr.lang.${l}`)}
                </option>
              ))}
            </select>
          </div>
          {working ? (
            <Attente texte={t('ocr.working')} />
          ) : error ? (
            <p className="statut err">
              <Icon name="alert" size={16} /> {error}
            </p>
          ) : (
            <>
              {empty && (
                <p className="statut">
                  <Icon name="info" size={16} /> {t('ocr.empty')}
                </p>
              )}
              <TexteCopiable id="ocr-texte" label={t('text.detected')} value={text} onChange={setText} />
            </>
          )}
          <p className="muted petit">{t('ocr.firstUse')}</p>
        </div>
      )}
    </Feuille>
  );
}

/* --------------------------------------------------------- Traduire (IA) */
function TranslateSheet({ captureId }: { captureId: string }): ReactNode {
  const { t, lang } = useI18n();
  const host = useHost();
  const capture = useCapture(captureId);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<AiTranslateResult | null>(null);
  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  /** Traduction enregistrée de cette capture (undefined = en cours de lecture). */
  const [saved, setSaved] = useState<AiSavedTranslation | null | undefined>(undefined);
  /** « Retraduire » : ignore la traduction enregistrée. */
  const [forced, setForced] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setSettings(s);
      setTarget(s.aiTargetLang || 'Français');
    });
    void window.api.ai.getConfig().then(setConfig);
  }, []);

  const provider = settings ? config?.providers.find((p) => p.id === settings.aiProvider) : undefined;
  const hasKey = settings && config ? config.hasKey[settings.aiProvider] : undefined;

  useEffect(() => {
    if (!capture) return;
    let alive = true;
    void window.api.ai
      .getSaved(capture.id)
      .catch(() => null)
      .then((s) => {
        if (alive) setSaved(s);
      });
    return () => {
      alive = false;
    };
  }, [capture]);

  // Traduction déjà faite dans cette langue : on la montre, sans rappeler l'IA.
  const showSaved = Boolean(saved) && !forced && saved?.targetLang === target;

  useEffect(() => {
    if (showSaved && saved) {
      setOriginal(saved.original);
      setTranslated(saved.translated);
    }
  }, [showSaved, saved]);

  const loaded = saved !== undefined;
  useEffect(() => {
    if (!capture || !target || !loaded || showSaved || hasKey !== true) return;
    const n = ++run.current;
    setResult(null);
    void window.api.ai.translate(capture.id, target).then((res) => {
      if (n !== run.current) return;
      setResult(res);
      if (res.ok) {
        setOriginal(res.original);
        setTranslated(res.translated);
        // le processus principal l'a enregistrée : on garde la même chose ici
        setSaved({ ...res, targetLang: target, createdAt: new Date().toISOString() });
        setForced(false);
      }
    });
  }, [capture, target, loaded, showSaved, hasKey, attempt]);

  const retranslate = (): void => {
    setForced(true);
    setResult(null);
    setAttempt((a) => a + 1);
  };

  /** Modifications à la main du texte : enregistrées avec la traduction. */
  const persistEdit = (): void => {
    if (!capture || !saved) return;
    if (original === saved.original && translated === saved.translated) return;
    setSaved({ ...saved, original, translated });
    void window.api.ai.saveEdit(capture.id, original, translated);
  };

  const changeTarget = (v: string): void => {
    setTarget(v);
    void window.api.settings.set({ aiTargetLang: v });
  };

  const openSettings = (): void => {
    captureText.close();
    host.openSettings('ai');
  };

  const error =
    !loaded || showSaved
      ? null
      : hasKey === false
        ? ({ ok: false, error: 'noKey' } as const)
        : result && !result.ok
          ? result
          : null;
  const waiting = capture && loaded && !showSaved && hasKey === true && !result;
  const shown = showSaved ? saved : result?.ok ? result : null;
  const langs = target && !COMMON_TARGET_LANGS.includes(target) ? [target, ...COMMON_TARGET_LANGS] : COMMON_TARGET_LANGS;
  const model = settings && provider ? settings.aiModels[provider.id] || provider.defaultModel : '';

  return (
    <Feuille
      large
      className="texte-feuille"
      titre={<SheetTitle titre={t('text.ai.title')} capture={capture} />}
      onClose={captureText.close}
    >
      {capture === null ? (
        <div className="vide">
          <Icon name="camera" />
          <span>{t('text.noCapture')}</span>
        </div>
      ) : (
        <div className="form">
          <div className="texte-barre">
            <label className="lbl" htmlFor="ai-cible">
              {t('ai.target')}
            </label>
            <select
              id="ai-cible"
              className="select sm"
              value={target ?? ''}
              disabled={Boolean(waiting)}
              onChange={(e) => changeTarget(e.target.value)}
            >
              {langs.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <span className="esp" />
            {provider && (
              <span className="muted petit mono texte-modele">
                {provider.label} · {model}
              </span>
            )}
          </div>

          {waiting ? (
            <Attente texte={t('ai.working')} />
          ) : error ? (
            <div className="texte-erreur">
              <p className="statut err">
                <Icon name="alert" size={16} /> {t(`ai.error.${error.error}`)}
              </p>
              {'message' in error && error.message && (
                <p className="muted petit mono">{error.message}</p>
              )}
              <div className="ligne">
                {['noKey', 'invalidKey', 'encryptionUnavailable'].includes(error.error) ? (
                  <button type="button" className="btn pri sm" onClick={openSettings}>
                    <Icon name="gear" size={16} />
                    {t('ai.openSettings')}
                  </button>
                ) : (
                  <button type="button" className="btn sm" onClick={() => setAttempt((a) => a + 1)}>
                    <Icon name="refresh" size={16} />
                    {t('ai.retry')}
                  </button>
                )}
              </div>
            </div>
          ) : shown ? (
            <>
              {!shown.original && (
                <p className="statut">
                  <Icon name="info" size={16} /> {t('ai.noText')}
                </p>
              )}
              <div className="texte-cote">
              <TexteCopiable
                id="ai-origine"
                label={
                  shown.sourceLanguage
                    ? t('ai.original.lang', { lang: shown.sourceLanguage })
                    : t('ai.original')
                }
                value={original}
                onChange={setOriginal}
                onBlur={persistEdit}
              />
              <TexteCopiable
                id="ai-traduction"
                label={t('ai.translation', { lang: target ?? '' })}
                value={translated}
                onChange={setTranslated}
                onBlur={persistEdit}
              />
              </div>
              <div className="ligne">
                <p className="muted petit">
                  {showSaved && saved
                    ? t('ai.savedOn', { date: formatDate(saved.createdAt, lang), model: saved.model })
                    : t('ai.answeredBy', { model: shown.model })}
                  {!showSaved && result?.ok && result.usage && (
                    <>
                      <br />
                      {(() => {
                        const tokens = formatTokens(result.usage.inputTokens + result.usage.outputTokens, lang);
                        if (provider?.id === 'gemini' && settings?.aiGeminiFreeTier) {
                          return t('ai.usage.thisOneFree', { tokens });
                        }
                        return typeof result.costUsd === 'number'
                          ? t('ai.usage.thisOne', { tokens, cost: `≈ ${formatUsd(result.costUsd, lang)}` })
                          : t('ai.usage.thisOneUnknown', { tokens });
                      })()}
                    </>
                  )}
                </p>
                <span className="esp" />
                <button
                  type="button"
                  className="btn sm"
                  disabled={hasKey !== true}
                  onClick={retranslate}
                >
                  <Icon name="refresh" size={16} />
                  {t('ai.retranslate')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Feuille>
  );
}
