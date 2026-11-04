/**
 * Réglages du lanceur, avec les briques « encre » de l'hôte (RegSec, RegLigne,
 * RegSwitch). Affichés dans Réglages → Lanceur et sous le panneau de l'outil.
 * Les interrupteurs et listes s'appliquent tout de suite ; les champs texte
 * s'enregistrent en sortant (ou avec Entrée), comme dans le reste de l'hôte.
 */
import {
  useEffect,
  useState,
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
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSec, RegSwitch } from '../../host/reglages';
import { useI18n } from '../../i18n';
import { displayAccelerator } from '../../lib/format';
import { eventToAccelerator } from '../../lib/shortcuts';
import './launcher-panel.css';

type ProviderKey = Exclude<LauncherProviderId, 'history'>;

const PROVIDERS: ProviderKey[] = [
  'programs',
  'files',
  'calculator',
  'websearch',
  'url',
  'shell',
  'system',
  'winsettings',
  'processes',
  'bookmarks',
  'tools'
];

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
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value);
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

export function LauncherSettingsView({ onSaved }: { onSaved?: () => void } = {}): ReactNode {
  const { t, lang } = useI18n();
  const [info, setInfo] = useState<LauncherSettingsInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  const addEngine = (): void => {
    void save({
      webEngines: [
        ...s.webEngines,
        {
          id: `custom-${Date.now().toString(36)}`,
          name: t('launcher.settings.newEngine'),
          keyword: '',
          url: 'https://example.com/search?q={q}',
          enabled: true
        }
      ]
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
    ? new Date(info.stats.indexedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR')
    : t('launcher.settings.never');

  return (
    <div className="lzr">
      <RegSec titre={t('launcher.settings.general')}>
        <RegLigne
          titre={t('launcher.settings.shortcut')}
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
        <RegLigne titre={t('launcher.settings.lastQuery')} sous={t('launcher.settings.lastQueryDesc')}>
          <select
            className="select reg-select"
            value={s.lastQuery}
            onChange={(e) => void save({ lastQuery: e.target.value as Settings['lastQuery'] })}
          >
            {(['selected', 'keep', 'empty'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`launcher.settings.lastQuery.${v}`)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegLigne titre={t('launcher.settings.maxResults')} sous={t('launcher.settings.maxResultsDesc')}>
          <select
            className="select reg-select lzr-court"
            value={s.maxResults}
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
          sous={t('launcher.settings.hideOnBlurDesc')}
          checked={s.hideOnBlur}
          onChange={(v) => void save({ hideOnBlur: v })}
        />
        <RegSwitch
          titre={t('launcher.settings.showHistory')}
          sous={t('launcher.settings.showHistoryDesc')}
          checked={s.showHistory}
          onChange={(v) => void save({ showHistory: v })}
        />
      </RegSec>

      <RegSec titre={t('launcher.settings.providers')}>
        {PROVIDERS.map((id) => (
          <RegLigne
            key={id}
            titre={t(`launcher.provider.${id}`)}
            sous={t(`launcher.provider.${id}.desc`)}
            className={s.providers[id].enabled ? '' : 'off'}
          >
            <div className="ligne lzr-ctl">
              <Champ
                className="input lzr-mot"
                value={s.providers[id].keyword}
                placeholder={t('launcher.settings.global')}
                aria-label={t('launcher.settings.keywordOf', { name: t(`launcher.provider.${id}`) })}
                title={t('launcher.settings.keyword')}
                maxLength={16}
                spellCheck={false}
                onCommit={(v) => setProvider(id, { keyword: v })}
              />
              <input
                type="checkbox"
                className="sw"
                aria-label={t(`launcher.provider.${id}`)}
                checked={s.providers[id].enabled}
                onChange={(e) => setProvider(id, { enabled: e.target.checked })}
              />
            </div>
          </RegLigne>
        ))}
      </RegSec>
      <p className="muted petit reg-note">{t('launcher.settings.providersDesc')}</p>

      <RegSec titre={t('launcher.settings.web')}>
        <RegLigne titre={t('launcher.settings.defaultEngine')} sous={t('launcher.settings.defaultEngineDesc')}>
          <select
            className="select reg-select"
            value={s.defaultEngine}
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
      <div className="liste-r lzr-moteurs">
        <div className="lzr-moteur lzr-entete lbl-mono" aria-hidden="true">
          <span>{t('launcher.settings.engineName')}</span>
          <span>{t('launcher.settings.keyword')}</span>
          <span>{t('launcher.settings.engineUrl')}</span>
          <span />
          <span />
        </div>
        {s.webEngines.map((e, i) => (
          <div className={`lzr-moteur${e.enabled ? '' : ' off'}`} key={e.id}>
            <Champ
              className="input sm"
              value={e.name}
              aria-label={t('launcher.settings.engineName')}
              onCommit={(v) => setEngine(i, { name: v })}
            />
            <Champ
              className="input sm mono"
              value={e.keyword}
              aria-label={t('launcher.settings.keyword')}
              spellCheck={false}
              onCommit={(v) => setEngine(i, { keyword: v })}
            />
            <Champ
              className="input sm mono"
              value={e.url}
              aria-label={t('launcher.settings.engineUrl')}
              spellCheck={false}
              onCommit={(v) => setEngine(i, { url: v })}
            />
            <input
              type="checkbox"
              className="sw"
              aria-label={e.name}
              checked={e.enabled}
              onChange={(ev) => setEngine(i, { enabled: ev.target.checked })}
            />
            <button
              type="button"
              className="ib"
              title={t('launcher.settings.remove')}
              aria-label={t('launcher.settings.remove')}
              onClick={() => void removeEngine(i)}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="ligne lzr-actions">
        <button type="button" className="btn sm" onClick={addEngine}>
          <Icon name="plus" size={16} />
          {t('launcher.settings.addEngine')}
        </button>
        <span className="muted petit">{t('launcher.settings.engineHelp')}</span>
      </div>

      <RegSec titre={t('launcher.settings.shell')}>
        <RegLigne titre={t('launcher.settings.shellKind')} sous={t('launcher.settings.shellKindDesc')}>
          <select
            className="select reg-select"
            value={s.shell.kind}
            onChange={(e) => void save({ shell: { ...s.shell, kind: e.target.value as Settings['shell']['kind'] } })}
          >
            <option value="cmd">cmd</option>
            <option value="powershell">PowerShell</option>
          </select>
        </RegLigne>
        <RegSwitch
          titre={t('launcher.settings.keepOpen')}
          sous={t('launcher.settings.keepOpenDesc')}
          checked={s.shell.keepOpen}
          onChange={(v) => void save({ shell: { ...s.shell, keepOpen: v } })}
        />
      </RegSec>

      <RegSec titre={t('launcher.settings.files')}>
        <RegLigne
          titre={t('launcher.settings.backend')}
          sous={info.stats.everything ? t('launcher.settings.everythingFound') : t('launcher.settings.everythingMissing')}
        >
          <select
            className="select reg-select"
            value={s.fileBackend}
            onChange={(e) => void save({ fileBackend: e.target.value as Settings['fileBackend'] })}
          >
            {(['auto', 'everything', 'windows', 'walk'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`launcher.settings.backend.${v}`)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegLigne titre={t('launcher.settings.folders')} sous={t('launcher.settings.foldersDesc')}>
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
              <span className="tx mono petit">{dir}</span>
              <button
                type="button"
                className="ib"
                title={t('launcher.settings.remove')}
                aria-label={t('launcher.settings.remove')}
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
        </label>
        <p className="muted petit">{t('launcher.settings.excludesDesc')}</p>
        <ExcludesField value={s.excludes} onCommit={(v) => void save({ excludes: v })} />
      </div>

      <RegSec titre={t('launcher.settings.data')}>
        <RegLigne
          titre={t('launcher.settings.index')}
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
        <RegLigne titre={t('launcher.settings.clearHistory')} sous={t('launcher.settings.clearHistoryDesc')}>
          <button
            type="button"
            className="btn sm"
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
            {t('launcher.settings.clear')}
          </button>
        </RegLigne>
        <RegLigne titre={t('launcher.settings.clearUsage')} sous={t('launcher.settings.clearUsageDesc')}>
          <button
            type="button"
            className="btn sm"
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
            {t('launcher.settings.clear')}
          </button>
        </RegLigne>
        <RegLigne titre={t('launcher.settings.reset')} sous={t('launcher.settings.resetDesc')}>
          <button type="button" className="btn sm dn" disabled={busy === 'reset'} onClick={() => void reset()}>
            <Icon name="undo" size={16} />
            {t('launcher.settings.resetBtn')}
          </button>
        </RegLigne>
      </RegSec>

      <p className="muted petit reg-note">{t('launcher.credit')}</p>
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
      rows={4}
      spellCheck={false}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== joined) onCommit(draft.split('\n'));
      }}
    />
  );
}
