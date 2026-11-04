/**
 * Réglages du lanceur (panneau du module + section des Paramètres).
 * Enregistrement automatique à chaque changement (« Enregistré »).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LauncherSettingsInfo } from '../../../../common/api';
import type {
  LauncherProviderId,
  LauncherSettings as Settings,
  LauncherWebEngine
} from '../../../../common/launcher';
import { useI18n } from '../../i18n';
import { eventToAccelerator } from '../../lib/shortcuts';
import { formatAccelerator } from './highlight';
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

function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }): ReactNode {
  return (
    <input
      type="checkbox"
      className="sw lzp-sw"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }): ReactNode {
  return (
    <div className="lzp-row">
      <div className="lzp-tx">
        <b>{title}</b>
        {desc && <span>{desc}</span>}
      </div>
      <div className="lzp-ctl">{children}</div>
    </div>
  );
}

function ShortcutInput({ value, ok, onChange }: { value: string; ok: boolean; onChange(v: string): void }): ReactNode {
  const { t, lang } = useI18n();
  const [recording, setRecording] = useState(false);
  return (
    <div className="lzp-inline">
      <button
        type="button"
        className={`lzp-key ${recording ? 'rec' : ''} ${!ok && !recording ? 'bad' : ''}`}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === 'Escape') {
            setRecording(false);
            return;
          }
          const acc = eventToAccelerator(e.nativeEvent);
          if (acc) {
            setRecording(false);
            onChange(acc);
          }
        }}
      >
        {recording ? t('launcher.settings.pressKeys') : formatAccelerator(value, lang) || t('launcher.settings.none')}
      </button>
      {!ok && !recording && <span className="lzp-bad">{t('launcher.settings.shortcutConflict')}</span>}
    </div>
  );
}

export function LauncherSettingsView(): ReactNode {
  const { t, lang } = useI18n();
  const [info, setInfo] = useState<LauncherSettingsInfo | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [excludesText, setExcludesText] = useState('');

  useEffect(() => {
    void window.api.launcher.getSettings().then((i) => {
      setInfo(i);
      setExcludesText(i.settings.excludes.join('\n'));
    });
  }, []);

  if (!info) return <div className="lzp-loading">…</div>;
  const s = info.settings;

  const save = async (patch: Partial<Settings>): Promise<void> => {
    // affichage immédiat, puis valeur nettoyée renvoyée par le main
    setInfo({ ...info, settings: { ...s, ...patch } as Settings });
    const next = await window.api.launcher.setSettings(patch);
    setInfo(next);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1600);
  };

  const setProvider = (id: ProviderKey, patch: Partial<Settings['providers'][ProviderKey]>): void => {
    void save({ providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } } });
  };

  const setEngine = (index: number, patch: Partial<LauncherWebEngine>): void => {
    const engines = s.webEngines.map((e, i) => (i === index ? { ...e, ...patch } : e));
    void save({ webEngines: engines });
  };

  const addFolder = async (): Promise<void> => {
    const dir = await window.api.settings.chooseFolder();
    if (dir && !s.indexedFolders.includes(dir)) void save({ indexedFolders: [...s.indexedFolders, dir] });
  };

  const task = async (id: string, run: () => Promise<unknown>): Promise<void> => {
    setBusy(id);
    try {
      await run();
    } finally {
      setBusy(null);
    }
  };

  const indexedAt = info.stats.indexedAt
    ? new Date(info.stats.indexedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR')
    : t('launcher.settings.never');

  return (
    <div className="lzp">
      <div className={`lzp-saved ${saved ? 'on' : ''}`} aria-live="polite">
        {t('launcher.settings.saved')}
      </div>

      <section className="lzp-sec">
        <h4 className="lzp-g">{t('launcher.settings.general')}</h4>
        <div className="lzp-card">
          <Row title={t('launcher.settings.shortcut')} desc={t('launcher.settings.shortcutDesc')}>
            <ShortcutInput value={s.shortcut} ok={info.shortcutOk} onChange={(v) => void save({ shortcut: v })} />
          </Row>
          <Row title={t('launcher.settings.lastQuery')} desc={t('launcher.settings.lastQueryDesc')}>
            <div className="lzp-seg" role="radiogroup">
              {(['selected', 'keep', 'empty'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={s.lastQuery === v}
                  className={s.lastQuery === v ? 'on' : ''}
                  onClick={() => void save({ lastQuery: v })}
                >
                  {t(`launcher.settings.lastQuery.${v}`)}
                </button>
              ))}
            </div>
          </Row>
          <Row title={t('launcher.settings.maxResults')}>
            <input
              type="number"
              className="lzp-input lzp-num"
              min={3}
              max={30}
              value={s.maxResults}
              onChange={(e) => void save({ maxResults: Number(e.target.value) })}
            />
          </Row>
          <Row title={t('launcher.settings.hideOnBlur')} desc={t('launcher.settings.hideOnBlurDesc')}>
            <Switch label={t('launcher.settings.hideOnBlur')} checked={s.hideOnBlur} onChange={(v) => void save({ hideOnBlur: v })} />
          </Row>
          <Row title={t('launcher.settings.showHistory')} desc={t('launcher.settings.showHistoryDesc')}>
            <Switch label={t('launcher.settings.showHistory')} checked={s.showHistory} onChange={(v) => void save({ showHistory: v })} />
          </Row>
        </div>
      </section>

      <section className="lzp-sec">
        <h4 className="lzp-g">{t('launcher.settings.providers')}</h4>
        <p className="lzp-note">{t('launcher.settings.providersDesc')}</p>
        <div className="lzp-card">
          {PROVIDERS.map((id) => (
            <Row key={id} title={t(`launcher.provider.${id}`)} desc={t(`launcher.provider.${id}.desc`)}>
              <input
                type="text"
                className="lzp-input lzp-kw"
                value={s.providers[id].keyword}
                placeholder={t('launcher.settings.global')}
                aria-label={t('launcher.settings.keyword')}
                maxLength={16}
                onChange={(e) => setProvider(id, { keyword: e.target.value })}
              />
              <Switch
                label={t(`launcher.provider.${id}`)}
                checked={s.providers[id].enabled}
                onChange={(v) => setProvider(id, { enabled: v })}
              />
            </Row>
          ))}
        </div>
      </section>

      <section className="lzp-sec">
        <h4 className="lzp-g">{t('launcher.settings.web')}</h4>
        <div className="lzp-card">
          <Row title={t('launcher.settings.defaultEngine')} desc={t('launcher.settings.defaultEngineDesc')}>
            <select
              className="lzp-input"
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
          </Row>
          {s.webEngines.map((e, i) => (
            <div className="lzp-engine" key={e.id}>
              <input
                className="lzp-input"
                value={e.name}
                aria-label={t('launcher.settings.engineName')}
                onChange={(ev) => setEngine(i, { name: ev.target.value })}
              />
              <input
                className="lzp-input lzp-kw"
                value={e.keyword}
                aria-label={t('launcher.settings.keyword')}
                placeholder={t('launcher.settings.keyword')}
                onChange={(ev) => setEngine(i, { keyword: ev.target.value })}
              />
              <input
                className="lzp-input lzp-url"
                value={e.url}
                aria-label="URL"
                spellCheck={false}
                onChange={(ev) => setEngine(i, { url: ev.target.value })}
              />
              <Switch label={e.name} checked={e.enabled} onChange={(v) => setEngine(i, { enabled: v })} />
              <button
                type="button"
                className="lzp-btn lzp-ghost"
                aria-label={t('launcher.settings.remove')}
                onClick={() => void save({ webEngines: s.webEngines.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="lzp-row">
            <button
              type="button"
              className="lzp-btn"
              onClick={() =>
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
                })
              }
            >
              + {t('launcher.settings.addEngine')}
            </button>
            <span className="lzp-note">{t('launcher.settings.engineHelp')}</span>
          </div>
        </div>
      </section>

      <section className="lzp-sec">
        <h4 className="lzp-g">{t('launcher.settings.shell')}</h4>
        <div className="lzp-card">
          <Row title={t('launcher.settings.shellKind')}>
            <div className="lzp-seg" role="radiogroup">
              {(['cmd', 'powershell'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={s.shell.kind === v}
                  className={s.shell.kind === v ? 'on' : ''}
                  onClick={() => void save({ shell: { ...s.shell, kind: v } })}
                >
                  {v === 'cmd' ? 'cmd' : 'PowerShell'}
                </button>
              ))}
            </div>
          </Row>
          <Row title={t('launcher.settings.keepOpen')} desc={t('launcher.settings.keepOpenDesc')}>
            <Switch
              label={t('launcher.settings.keepOpen')}
              checked={s.shell.keepOpen}
              onChange={(v) => void save({ shell: { ...s.shell, keepOpen: v } })}
            />
          </Row>
        </div>
      </section>

      <section className="lzp-sec">
        <h4 className="lzp-g">{t('launcher.settings.files')}</h4>
        <div className="lzp-card">
          <Row
            title={t('launcher.settings.backend')}
            desc={info.stats.everything ? t('launcher.settings.everythingFound') : t('launcher.settings.everythingMissing')}
          >
            <select
              className="lzp-input"
              value={s.fileBackend}
              onChange={(e) => void save({ fileBackend: e.target.value as Settings['fileBackend'] })}
            >
              {(['auto', 'everything', 'windows', 'walk'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`launcher.settings.backend.${v}`)}
                </option>
              ))}
            </select>
          </Row>
          <Row title={t('launcher.settings.folders')} desc={t('launcher.settings.foldersDesc')}>
            <button type="button" className="lzp-btn" onClick={() => void addFolder()}>
              + {t('launcher.settings.addFolder')}
            </button>
          </Row>
          {s.indexedFolders.map((dir) => (
            <div className="lzp-row lzp-folder" key={dir}>
              <code>{dir}</code>
              <button
                type="button"
                className="lzp-btn lzp-ghost"
                aria-label={t('launcher.settings.remove')}
                onClick={() => void save({ indexedFolders: s.indexedFolders.filter((d) => d !== dir) })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="lzp-col">
            <label className="lzp-tx" htmlFor="lzp-excl">
              <b>{t('launcher.settings.excludes')}</b>
              <span>{t('launcher.settings.excludesDesc')}</span>
            </label>
            <textarea
              id="lzp-excl"
              className="lzp-input lzp-area"
              rows={4}
              spellCheck={false}
              value={excludesText}
              onChange={(e) => setExcludesText(e.target.value)}
              onBlur={() => void save({ excludes: excludesText.split('\n') })}
            />
          </div>
        </div>
      </section>

      <section className="lzp-sec">
        <h4 className="lzp-g">{t('launcher.settings.data')}</h4>
        <div className="lzp-card">
          <Row
            title={t('launcher.settings.index')}
            desc={t('launcher.settings.indexStats', {
              programs: info.stats.programs,
              bookmarks: info.stats.bookmarks,
              at: indexedAt
            })}
          >
            <button
              type="button"
              className="lzp-btn"
              disabled={busy === 'reindex'}
              onClick={() =>
                void task('reindex', async () => {
                  const stats = await window.api.launcher.reindex();
                  setInfo((cur) => (cur ? { ...cur, stats } : cur));
                })
              }
            >
              {busy === 'reindex' ? t('launcher.settings.indexing') : t('launcher.settings.reindex')}
            </button>
          </Row>
          <Row title={t('launcher.settings.clearHistory')} desc={t('launcher.settings.clearHistoryDesc')}>
            <button type="button" className="lzp-btn" onClick={() => void task('h', () => window.api.launcher.clearHistory())}>
              {t('launcher.settings.clear')}
            </button>
          </Row>
          <Row title={t('launcher.settings.clearUsage')} desc={t('launcher.settings.clearUsageDesc')}>
            <button type="button" className="lzp-btn" onClick={() => void task('u', () => window.api.launcher.clearUsage())}>
              {t('launcher.settings.clear')}
            </button>
          </Row>
          <Row title={t('launcher.settings.reset')} desc={t('launcher.settings.resetDesc')}>
            <button
              type="button"
              className="lzp-btn lzp-danger"
              onClick={() =>
                void task('r', async () => {
                  const next = await window.api.launcher.resetSettings();
                  setInfo(next);
                  setExcludesText(next.settings.excludes.join('\n'));
                })
              }
            >
              {t('launcher.settings.resetBtn')}
            </button>
          </Row>
        </div>
      </section>

      <p className="lzp-credit">{t('launcher.credit')}</p>
    </div>
  );
}
