/**
 * Réglages du lanceur, rangés comme les réglages « téléphone » du kit :
 * Général, Apparence de la barre (avec aperçu), Sources de résultats (une ligne par fournisseur), Recherche web,
 * Fichiers, Avancé (repliable) et la zone sensible tout en bas. Chaque
 * réglage a sa bulle « ? » (Aide) avec une explication et un exemple.
 *
 * Affichés dans Réglages → Lanceur et sous le panneau de l'outil. Les
 * interrupteurs et listes s'appliquent tout de suite ; les champs texte
 * s'enregistrent en sortant (ou avec Entrée), comme dans le reste de l'hôte.
 */
import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react';
import type { LauncherSettingsInfo } from '../../../../common/api';
import type {
  LauncherProviderId,
  LauncherSettings as Settings,
  LauncherWebEngine
} from '../../../../common/launcher';
import { Aide, ui } from '../../encre/ui';
import { Feuille } from '../../host/Feuille';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSec, RegSwitch } from '../../host/reglages';
import { useI18n, type TFunc } from '../../i18n';
import { displayAccelerator } from '../../lib/format';
import { eventToAccelerator } from '../../lib/shortcuts';
import { LookSettings } from './LookSettings';
import './launcher-panel.css';

type ProviderKey = Exclude<LauncherProviderId, 'history'>;

/** Fournisseurs dans l'ordre d'affichage, avec l'icône de leurs résultats. */
const PROVIDERS: Array<[ProviderKey, string]> = [
  ['programs', 'grid'],
  ['files', 'folder'],
  ['calculator', 'hash'],
  ['websearch', 'compass'],
  ['url', 'external'],
  ['shell', 'zap'],
  ['system', 'lock'],
  ['winsettings', 'gear'],
  ['processes', 'x'],
  ['bookmarks', 'bookmark'],
  ['tools', 'wrench']
];

/** Bulle « ? » à partir des clés `<cle>` (texte) et `<cle>.ex` (exemple). */
function aide(t: TFunc, titre: string, cle: string): ReactNode {
  return <Aide titre={titre} texte={t(cle)} exemple={t(`${cle}.ex`)} />;
}

/** Champ texte qui n'enregistre qu'en sortant (ou avec Entrée). */
function Champ({
  value,
  onCommit,
  className = 'input',
  ...rest
}: {
  value: string;
  onCommit(v: string): void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>): ReactNode {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      {...rest}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(value);
          rest.onKeyDown?.(e);
        }
      }}
    />
  );
}

/** Même enregistreur que Réglages → Raccourcis. */
function ShortcutRecorder({ value, ok, onSet }: { value: string; ok: boolean; onSet(v: string): void }): ReactNode {
  const { t, lang } = useI18n();
  const [recording, setRecording] = useState(false);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }
    const acc = eventToAccelerator(e.nativeEvent);
    if (!acc) return;
    setRecording(false);
    onSet(acc);
  };
  return (
    <button
      type="button"
      className={`btn sm shortcut-recorder${recording ? ' recording' : ''}${ok ? '' : ' conflict'}`}
      onClick={() => setRecording(true)}
      onKeyDown={onKeyDown}
      onBlur={() => setRecording(false)}
    >
      {recording ? (
        t('settings.shortcuts.recording')
      ) : (
        <span className="kbd">{value ? displayAccelerator(value, lang) : t('launcher.settings.none')}</span>
      )}
    </button>
  );
}

/** Mot-clé affiché en `kbd` ; un clic le transforme en petit champ. */
function MotCle({
  value,
  nom,
  onCommit
}: {
  value: string;
  nom: string;
  onCommit(v: string): void;
}): ReactNode {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const label = t('launcher.reg.editKeyword', { name: nom });
  if (edit) {
    return (
      <Champ
        className="input mono lzr-mot-in"
        value={value}
        autoFocus
        maxLength={16}
        spellCheck={false}
        aria-label={label}
        placeholder={t('launcher.reg.noKeyword')}
        onCommit={(v) => onCommit(v.trim())}
        onBlur={() => setEdit(false)}
        onKeyDown={() => setEdit(false)}
      />
    );
  }
  return (
    <button
      type="button"
      className={`kbd lzr-mot${value ? '' : ' vide'}`}
      title={label}
      aria-label={label}
      onClick={() => setEdit(true)}
    >
      {value || t('launcher.reg.noKeyword')}
    </button>
  );
}

/** Fenêtre d'ajout / de modification d'un moteur web. */
function MoteurFeuille({
  engine,
  onSave,
  onClose
}: {
  engine: LauncherWebEngine;
  onSave(e: LauncherWebEngine): void;
  onClose(): void;
}): ReactNode {
  const { t } = useI18n();
  const [name, setName] = useState(engine.name);
  const [keyword, setKeyword] = useState(engine.keyword);
  const [url, setUrl] = useState(engine.url);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    onSave({ ...engine, name: name.trim() || engine.name, keyword: keyword.trim(), url: url.trim() });
    onClose();
  };
  return (
    <Feuille titre={t('launcher.reg.editEngine')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div>
          <label className="lbl" htmlFor="lzr-m-nom">
            {t('launcher.settings.engineName')}
          </label>
          <input id="lzr-m-nom" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="lzr-m-mot">
            {t('launcher.settings.keyword')}
          </label>
          <input
            id="lzr-m-mot"
            className="input mono"
            maxLength={16}
            spellCheck={false}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="lzr-m-url">
            {t('launcher.settings.engineUrl')}
          </label>
          <input
            id="lzr-m-url"
            className="input mono"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="muted petit reg-note">{t('launcher.reg.urlHelp')}</p>
        </div>
        <div className="conf">
          <div className="bts">
            <button type="button" className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn pri">
              {t('common.save')}
            </button>
          </div>
        </div>
      </form>
    </Feuille>
  );
}

export function LauncherSettingsView({ onSaved }: { onSaved?: () => void } = {}): ReactNode {
  const { t, lang } = useI18n();
  const [info, setInfo] = useState<LauncherSettingsInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Moteur ouvert dans la fenêtre d'édition (index -1 = nouveau). */
  const [moteur, setMoteur] = useState<{ index: number; engine: LauncherWebEngine } | null>(null);

  useEffect(() => {
    void window.api.launcher.getSettings().then(setInfo);
    return window.api.launcher.onState((st) =>
      setInfo((cur) => (cur ? { ...cur, settings: st.settings, shortcutOk: st.shortcutOk } : cur))
    );
  }, []);

  if (!info) return null;
  const s = info.settings;

  const save = async (patch: Partial<Settings>): Promise<void> => {
    // affichage immédiat, puis valeur nettoyée renvoyée par le main
    setInfo({ ...info, settings: { ...s, ...patch } as Settings });
    try {
      setInfo(await window.api.launcher.setSettings(patch));
      onSaved?.();
    } catch (error) {
      ui.toastErr(error);
    }
  };

  const setProvider = (id: ProviderKey, patch: Partial<Settings['providers'][ProviderKey]>): void => {
    void save({ providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } } });
  };

  const setEngine = (index: number, patch: Partial<LauncherWebEngine>): void => {
    void save({ webEngines: s.webEngines.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  };

  const saveEngine = (index: number, engine: LauncherWebEngine): void => {
    if (index < 0) void save({ webEngines: [...s.webEngines, engine] });
    else setEngine(index, engine);
  };

  const newEngine = (): void => {
    setMoteur({
      index: -1,
      engine: {
        id: `custom-${Date.now().toString(36)}`,
        name: t('launcher.settings.newEngine'),
        keyword: '',
        url: 'https://example.com/search?q={q}',
        enabled: true
      }
    });
  };

  const removeEngine = async (index: number): Promise<void> => {
    const engine = s.webEngines[index];
    const ok = await ui.confirmer(t('launcher.settings.removeEngineConfirm', { name: engine.name }), {
      ok: t('launcher.settings.remove'),
      danger: true
    });
    if (ok) await save({ webEngines: s.webEngines.filter((_, j) => j !== index) });
  };

  const addFolder = async (): Promise<void> => {
    const dir = await window.api.settings.chooseFolder();
    if (dir && !s.indexedFolders.includes(dir)) await save({ indexedFolders: [...s.indexedFolders, dir] });
  };

  const run = async (id: string, job: () => Promise<unknown>, done?: string): Promise<void> => {
    setBusy(id);
    try {
      await job();
      if (done) ui.toast(done);
    } catch (error) {
      ui.toastErr(error);
    } finally {
      setBusy(null);
    }
  };

  const clearWithConfirm = async (
    id: string,
    message: string,
    job: () => Promise<unknown>,
    done: string
  ): Promise<void> => {
    const ok = await ui.confirmer(message, { ok: t('launcher.settings.clear'), danger: true });
    if (ok) await run(id, job, done);
  };

  const reset = async (): Promise<void> => {
    const ok = await ui.confirmer(t('launcher.settings.resetConfirm'), {
      ok: t('launcher.settings.resetBtn'),
      danger: true,
      detail: t('launcher.settings.resetDesc')
    });
    if (!ok) return;
    await run(
      'reset',
      async () => {
        setInfo(await window.api.launcher.resetSettings());
        onSaved?.();
      },
      t('launcher.settings.resetDone')
    );
  };

  const indexedAt = info.stats.indexedAt
    ? new Date(info.stats.indexedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short'
      })
    : t('launcher.settings.never');

  return (
    <div className="lzr">
      {/* ------------------------------------------------------------ Général */}
      <RegSec titre={t('launcher.reg.general')}>
        <RegLigne
          titre={t('launcher.settings.shortcut')}
          aide={aide(t, t('launcher.settings.shortcut'), 'launcher.help.shortcut')}
          sous={
            info.shortcutOk ? (
              t('launcher.settings.shortcutDesc')
            ) : (
              <span className="dan">{t('settings.shortcuts.conflict')}</span>
            )
          }
        >
          <ShortcutRecorder value={s.shortcut} ok={info.shortcutOk} onSet={(v) => void save({ shortcut: v })} />
        </RegLigne>
        <RegLigne
          titre={t('launcher.settings.lastQuery')}
          aide={aide(t, t('launcher.settings.lastQuery'), 'launcher.help.lastQuery')}
          sous={t('launcher.settings.lastQueryDesc')}
        >
          <select
            className="select reg-select lzr-sel"
            value={s.lastQuery}
            aria-label={t('launcher.settings.lastQuery')}
            onChange={(e) => void save({ lastQuery: e.target.value as Settings['lastQuery'] })}
          >
            {(['selected', 'keep', 'empty'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`launcher.settings.lastQuery.${v}`)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegLigne
          titre={t('launcher.settings.maxResults')}
          aide={aide(t, t('launcher.settings.maxResults'), 'launcher.help.maxResults')}
          sous={t('launcher.settings.maxResultsDesc')}
        >
          <select
            className="select reg-select lzr-court"
            value={s.maxResults}
            aria-label={t('launcher.settings.maxResults')}
            onChange={(e) => void save({ maxResults: Number(e.target.value) })}
          >
            {[...new Set([5, 6, 8, 10, 12, 15, 20, 30, s.maxResults])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegSwitch
          titre={t('launcher.settings.hideOnBlur')}
          aide={aide(t, t('launcher.settings.hideOnBlur'), 'launcher.help.hideOnBlur')}
          sous={t('launcher.settings.hideOnBlurDesc')}
          checked={s.hideOnBlur}
          onChange={(v) => void save({ hideOnBlur: v })}
        />
      </RegSec>

      {/* ------------------------------------------------ Apparence de la barre */}
      <LookSettings look={s.look} onSave={(look) => save({ look })} />

      {/* ------------------------------------------------ Sources de résultats */}
      <div className="reg-sec">
        <div className="lbl-mono">
          {t('launcher.reg.sources')}
          <Aide
            titre={t('launcher.reg.keywords')}
            texte={t('launcher.reg.keywordsHelp')}
            exemple={t('launcher.reg.keywordsHelp.ex')}
          />
        </div>
        <p className="muted petit lzr-intro">{t('launcher.reg.sourcesIntro')}</p>
        <div className="liste-r lzr-sources">
          {PROVIDERS.map(([id, icone]) => {
            const nom = t(`launcher.provider.${id}`);
            const p = s.providers[id];
            return (
              <div className={`li lzr-src${p.enabled ? '' : ' off'}`} key={id}>
                <span className={`li-ic${p.enabled ? ' acc' : ''}`}>
                  <Icon name={icone} />
                </span>
                <span className="tx">
                  <b>
                    {nom}
                    {aide(t, nom, `launcher.help.${id}`)}
                  </b>
                  <small>{t(`launcher.reg.p.${id}`)}</small>
                </span>
                <MotCle value={p.keyword} nom={nom} onCommit={(v) => setProvider(id, { keyword: v })} />
                <input
                  type="checkbox"
                  className="sw"
                  aria-label={nom}
                  checked={p.enabled}
                  onChange={(e) => setProvider(id, { enabled: e.target.checked })}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------- Recherche web */}
      <RegSec titre={t('launcher.reg.web')}>
        <RegLigne
          titre={t('launcher.settings.defaultEngine')}
          aide={aide(t, t('launcher.settings.defaultEngine'), 'launcher.help.defaultEngine')}
          sous={t('launcher.settings.defaultEngineDesc')}
        >
          <select
            className="select reg-select lzr-sel"
            value={s.defaultEngine}
            aria-label={t('launcher.settings.defaultEngine')}
            onChange={(e) => void save({ defaultEngine: e.target.value })}
          >
            <option value="">{t('launcher.settings.none')}</option>
            {s.webEngines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </RegLigne>
      </RegSec>
      <div className="lzr-sous-t">
        <span className="lbl-mono">
          {t('launcher.reg.engines')}
          <Aide
            titre={t('launcher.reg.engines')}
            texte={t('launcher.reg.enginesHelp')}
            exemple={t('launcher.reg.enginesHelp.ex')}
          />
        </span>
        <button type="button" className="btn sm gh" onClick={newEngine}>
          <Icon name="plus" size={16} />
          {t('launcher.settings.addEngine')}
        </button>
      </div>
      <div className="liste-r lzr-moteurs">
        {s.webEngines.map((e, i) => (
          <div className={`li lzr-src${e.enabled ? '' : ' off'}`} key={e.id}>
            <span className="li-ic">
              <Icon name="compass" />
            </span>
            <span className="tx">
              <b>{e.name}</b>
              <small className="mono">{e.url}</small>
            </span>
            {e.keyword ? (
              <span className="kbd lzr-mot fixe">{e.keyword}</span>
            ) : (
              <span className="kbd lzr-mot fixe vide">{t('launcher.reg.noKeyword')}</span>
            )}
            <button
              type="button"
              className="ib"
              title={t('launcher.reg.edit')}
              aria-label={`${t('launcher.reg.edit')} : ${e.name}`}
              onClick={() => setMoteur({ index: i, engine: e })}
            >
              <Icon name="edit" size={16} />
            </button>
            <button
              type="button"
              className="ib"
              title={t('launcher.settings.remove')}
              aria-label={`${t('launcher.settings.remove')} : ${e.name}`}
              onClick={() => void removeEngine(i)}
            >
              <Icon name="trash" size={16} />
            </button>
            <input
              type="checkbox"
              className="sw"
              aria-label={e.name}
              checked={e.enabled}
              onChange={(ev) => setEngine(i, { enabled: ev.target.checked })}
            />
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------ Fichiers */}
      <RegSec titre={t('launcher.reg.files')}>
        <RegLigne
          titre={t('launcher.settings.backend')}
          aide={aide(t, t('launcher.settings.backend'), 'launcher.help.backend')}
          sous={info.stats.everything ? t('launcher.settings.everythingFound') : t('launcher.settings.everythingMissing')}
        >
          <select
            className="select reg-select lzr-sel"
            value={s.fileBackend}
            aria-label={t('launcher.settings.backend')}
            onChange={(e) => void save({ fileBackend: e.target.value as Settings['fileBackend'] })}
          >
            {(['auto', 'everything', 'windows', 'walk'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`launcher.settings.backend.${v}`)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegLigne
          titre={t('launcher.settings.index')}
          aide={aide(t, t('launcher.settings.index'), 'launcher.help.index')}
          sous={t('launcher.settings.indexStats', {
            programs: info.stats.programs,
            bookmarks: info.stats.bookmarks,
            at: indexedAt
          })}
        >
          <button
            type="button"
            className={`btn sm${busy === 'reindex' ? ' occupe' : ''}`}
            disabled={busy === 'reindex'}
            onClick={() =>
              void run(
                'reindex',
                async () => {
                  const stats = await window.api.launcher.reindex();
                  setInfo((cur) => (cur ? { ...cur, stats } : cur));
                },
                t('launcher.settings.reindexDone')
              )
            }
          >
            <Icon name="refresh" size={16} />
            {busy === 'reindex' ? t('launcher.settings.indexing') : t('launcher.settings.reindex')}
          </button>
        </RegLigne>
        <RegLigne
          titre={t('launcher.settings.folders')}
          aide={aide(t, t('launcher.settings.folders'), 'launcher.help.folders')}
          sous={t('launcher.settings.foldersDesc')}
        >
          <button type="button" className="btn sm" onClick={() => void addFolder()}>
            <Icon name="plus" size={16} />
            {t('launcher.settings.addFolder')}
          </button>
        </RegLigne>
      </RegSec>
      {s.indexedFolders.length > 0 && (
        <div className="liste-r lzr-dossiers">
          {s.indexedFolders.map((dir) => (
            <div className="li" key={dir}>
              <span className="li-ic">
                <Icon name="folder" size={18} />
              </span>
              <span className="tx mono petit" title={dir}>
                {dir}
              </span>
              <button
                type="button"
                className="ib"
                title={t('launcher.settings.remove')}
                aria-label={`${t('launcher.settings.remove')} : ${dir}`}
                onClick={() => void save({ indexedFolders: s.indexedFolders.filter((d) => d !== dir) })}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="lzr-bloc">
        <label className="lbl-mono" htmlFor="lzr-excl">
          {t('launcher.settings.excludes')}
          {aide(t, t('launcher.settings.excludes'), 'launcher.help.excludes')}
        </label>
        <p className="muted petit">{t('launcher.settings.excludesDesc')}</p>
        <ExcludesField value={s.excludes} onCommit={(v) => void save({ excludes: v })} />
      </div>

      {/* ------------------------------------------------- Avancé (repliable) */}
      <div className="faq lzr-avance">
        <details>
          <summary>
            <span className="li-ic">
              <Icon name="wrench" size={18} />
            </span>
            <span className="tx">
              {t('launcher.reg.advanced')}
              <small>{t('launcher.reg.advancedSub')}</small>
            </span>
            <Icon name="chev" className="chev" />
          </summary>
          <div className="lzr-avance-c">
            <RegSec titre={t('launcher.reg.shell')}>
              <RegLigne
                titre={t('launcher.settings.shellKind')}
                aide={aide(t, t('launcher.settings.shellKind'), 'launcher.help.shellKind')}
                sous={t('launcher.settings.shellKindDesc')}
              >
                <select
                  className="select reg-select lzr-court"
                  value={s.shell.kind}
                  aria-label={t('launcher.settings.shellKind')}
                  onChange={(e) =>
                    void save({ shell: { ...s.shell, kind: e.target.value as Settings['shell']['kind'] } })
                  }
                >
                  <option value="cmd">cmd</option>
                  <option value="powershell">PowerShell</option>
                </select>
              </RegLigne>
              <RegSwitch
                titre={t('launcher.settings.keepOpen')}
                aide={aide(t, t('launcher.settings.keepOpen'), 'launcher.help.keepOpen')}
                sous={t('launcher.settings.keepOpenDesc')}
                checked={s.shell.keepOpen}
                onChange={(v) => void save({ shell: { ...s.shell, keepOpen: v } })}
              />
            </RegSec>
            <RegSec titre={t('launcher.reg.history')}>
              <RegSwitch
                titre={t('launcher.settings.showHistory')}
                aide={aide(t, t('launcher.settings.showHistory'), 'launcher.help.showHistory')}
                sous={t('launcher.settings.showHistoryDesc')}
                checked={s.showHistory}
                onChange={(v) => void save({ showHistory: v })}
              />
            </RegSec>
          </div>
        </details>
      </div>

      {/* ------------------------------------------------------ Zone sensible */}
      <div className="reg-sec">
        <div className="zone-d lzr-zone">
          <h3>
            <Icon name="alert" />
            {t('reglages.danger')}
          </h3>
          <p>{t('launcher.reg.dangerIntro')}</p>
          <div className="reg-lignes">
            <RegLigne titre={t('launcher.settings.clearHistory')} sous={t('launcher.settings.clearHistoryDesc')}>
              <button
                type="button"
                className="btn sm dn"
                disabled={busy === 'history'}
                onClick={() =>
                  void clearWithConfirm(
                    'history',
                    t('launcher.settings.clearHistoryConfirm'),
                    () => window.api.launcher.clearHistory(),
                    t('launcher.settings.clearHistoryDone')
                  )
                }
              >
                <Icon name="trash" size={16} />
                {t('launcher.settings.clear')}
              </button>
            </RegLigne>
            <RegLigne
              titre={t('launcher.settings.clearUsage')}
              aide={aide(t, t('launcher.settings.clearUsage'), 'launcher.help.usage')}
              sous={t('launcher.settings.clearUsageDesc')}
            >
              <button
                type="button"
                className="btn sm dn"
                disabled={busy === 'usage'}
                onClick={() =>
                  void clearWithConfirm(
                    'usage',
                    t('launcher.settings.clearUsageConfirm'),
                    () => window.api.launcher.clearUsage(),
                    t('launcher.settings.clearUsageDone')
                  )
                }
              >
                <Icon name="refresh" size={16} />
                {t('launcher.reg.forget')}
              </button>
            </RegLigne>
            <RegLigne titre={t('launcher.settings.reset')} sous={t('launcher.settings.resetDesc')}>
              <button type="button" className="btn sm dn" disabled={busy === 'reset'} onClick={() => void reset()}>
                <Icon name="undo" size={16} />
                {t('launcher.settings.resetBtn')}
              </button>
            </RegLigne>
          </div>
        </div>
      </div>

      <p className="muted petit reg-note lzr-credit">{t('launcher.credit')}</p>

      {moteur && (
        <MoteurFeuille
          engine={moteur.engine}
          onSave={(e) => saveEngine(moteur.index, e)}
          onClose={() => setMoteur(null)}
        />
      )}
    </div>
  );
}

/** Liste d'exclusions : une ligne par motif, enregistrée en sortant. */
function ExcludesField({ value, onCommit }: { value: string[]; onCommit(v: string[]): void }): ReactNode {
  const joined = value.join('\n');
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  return (
    <textarea
      id="lzr-excl"
      className="input mono lzr-excl"
      rows={3}
      spellCheck={false}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== joined) onCommit(draft.split('\n'));
      }}
    />
  );
}
