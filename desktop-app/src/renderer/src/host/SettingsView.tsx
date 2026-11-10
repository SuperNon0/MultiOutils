import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react';
import {
  APPEARANCE_ACCENTS,
  APPEARANCE_THEMES,
  DEFAULT_SHORTCUTS,
  type AppSettings,
  type Language,
  type ShortcutId,
  type RemoteTestResult,
  type ShortcutStatus,
  type UpdateStatus
} from '../../../common/types';
import { applyAppearance } from '../encre/appearance';
import { Aide, ui } from '../encre/ui';
import { translate, useI18n } from '../i18n';
import { displayAccelerator } from '../lib/format';
import { eventToAccelerator } from '../lib/shortcuts';
import { Brand } from './Sidebar';
import { Icon } from './Icon';
import { RegLigne, RegSec, RegSwitch } from './reglages';
import { TraductionSection } from './TraductionReglages';
import { HaSettingsPage } from '../modules/launcher/ha/HaSettingsPage';
import type { ToolModule } from './types';

interface Props {
  settings: AppSettings;
  version: string;
  /** Section à ouvrir (n change à chaque demande, même section comprise). */
  section?: { id: string; n: number };
  modules: ToolModule[];
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

export interface SectionDef {
  id: string;
  group: string;
  title: string;
  sub: string;
  icon: string;
  /** Clés i18n des réglages de la section (pour la recherche). */
  keywords: string[];
}

/** Les sections des Réglages : hôte + une par module qui a un settingsPanel(). */
export function settingsSections(modules: ToolModule[]): SectionDef[] {
  return [
    {
      id: 'general',
      group: 'reglages.group.app',
      title: 'settings.section.general',
      sub: 'reglages.sub.general',
      icon: 'gear',
      keywords: [
        'settings.general.language',
        'settings.general.autostart',
        'settings.general.startMinimized',
        'settings.general.closeToTray'
      ]
    },
    {
      id: 'appearance',
      group: 'reglages.group.app',
      title: 'appearance.title',
      sub: 'appearance.sub',
      icon: 'palette',
      keywords: ['appearance.accent', 'appearance.theme', 'appearance.keywords']
    },
    {
      id: 'shortcuts',
      group: 'reglages.group.app',
      title: 'settings.section.shortcuts',
      sub: 'reglages.sub.shortcuts',
      icon: 'keyboard',
      keywords: [
        'settings.shortcuts.fullscreen',
        'settings.shortcuts.region',
        'settings.shortcuts.window',
        'settings.shortcuts.delayed'
      ]
    },
    {
      id: 'storage',
      group: 'reglages.group.app',
      title: 'settings.section.storage',
      sub: 'reglages.sub.storage',
      icon: 'folder',
      keywords: [
        'settings.storage.dir',
        'settings.storage.template',
        'settings.storage.trashRetention',
        'gallery.emptyTrash'
      ]
    },
    ...modules
      .filter((m) => m.settingsPanel)
      .map((m) => ({
        id: m.id,
        group: 'reglages.group.tools',
        title: `settings.section.${m.id}`,
        sub: `reglages.sub.${m.id}`,
        icon: m.icon,
        keywords: [m.name]
      })),
    {
      id: 'homeassistant',
      group: 'reglages.group.tools',
      title: 'ha.section',
      sub: 'reglages.sub.homeassistant',
      icon: 'home',
      keywords: ['ha.link.enabled', 'ha.notif.title', 'ha.buttons.title', 'ha.dash.title', 'ha.sensors.title', 'ha.keywords']
    },
    {
      id: 'ai',
      group: 'reglages.group.tools',
      title: 'ai.section',
      sub: 'reglages.sub.ai',
      icon: 'sparkle',
      keywords: ['ai.provider', 'ai.model', 'ai.target', 'ai.keywords']
    },
    {
      id: 'server',
      group: 'reglages.group.advanced',
      title: 'settings.section.server',
      sub: 'reglages.sub.server',
      icon: 'cloud',
      keywords: ['settings.server.url', 'settings.server.token', 'settings.server.test']
    },
    {
      id: 'updates',
      group: 'reglages.group.system',
      title: 'settings.section.updates',
      sub: 'reglages.sub.updates',
      icon: 'refresh',
      keywords: ['settings.updates.check']
    },
    {
      id: 'about',
      group: 'reglages.group.system',
      title: 'settings.section.about',
      sub: 'reglages.sub.about',
      icon: 'info',
      keywords: ['settings.about.blurb']
    }
  ];
}

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Réglages « encre » (docs/00 §5.4) : la liste à gauche, le réglage ouvert à
 * droite ; recherche dans les réglages ; « Avancé » à part ; zone sensible en
 * rouge ; tout s'enregistre tout seul, avec un petit « Enregistré ».
 */
export function SettingsView({ settings, version, section, modules, update }: Props): ReactNode {
  const { t, lang } = useI18n();
  const sections = useMemo(() => settingsSections(modules), [modules]);
  const [active, setActive] = useState(section?.id ?? 'general');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(0);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    if (section) setActive(section.id);
  }, [section]);

  // « Enregistré » : après chaque changement des réglages (hôte ou module).
  const flash = (): void => {
    setSaved(Date.now());
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(0), 2200);
  };
  useEffect(() => window.api.settings.onChanged(() => flash()), []);
  useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    },
    []
  );

  const sub = (s: SectionDef): string => {
    const text = t(s.sub);
    return text === s.sub ? '' : text;
  };

  const q = norm(query.trim());
  const visible = sections.filter(
    (s) =>
      !q ||
      norm([t(s.title), sub(s), ...s.keywords.map((k) => translate(lang, k))].join(' ')).includes(q)
  );
  const groups = ['reglages.group.app', 'reglages.group.tools', 'reglages.group.advanced', 'reglages.group.system']
    .map((g) => ({ g, items: visible.filter((s) => s.group === g) }))
    .filter((g) => g.items.length > 0);

  const current = sections.find((s) => s.id === active) ?? sections[0];
  const activeModule = modules.find((m) => m.id === current.id && m.settingsPanel);
  const [detail, setDetail] = useState(Boolean(section));

  return (
    <div className="reglages-page">
      <div className="page-h">
        <h1 className="page-t">{t('settings.title')}</h1>
      </div>
      <div className={`reglages${detail ? ' detail' : ''}`}>
        <div className="reg-liste">
          <label className="champ reg-cherche">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              placeholder={t('reglages.search')}
              aria-label={t('reglages.search')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {groups.map(({ g, items }) => (
            <div key={g}>
              <div className="reg-g">{t(g)}</div>
              <div className="liste-r">
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`li${current.id === s.id ? ' on' : ''}`}
                    aria-current={current.id === s.id ? 'true' : undefined}
                    onClick={() => {
                      setActive(s.id);
                      setDetail(true);
                    }}
                  >
                    <span className={`li-ic${current.id === s.id ? ' acc' : ''}`}>
                      <Icon name={s.icon} />
                    </span>
                    <span className="tx">
                      {t(s.title)}
                      {sub(s) && <small>{sub(s)}</small>}
                    </span>
                    <Icon name="chev" className="muted" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="vide">
              <Icon name="search" />
              <span>{t('reglages.noResult', { q: query.trim() })}</span>
            </div>
          )}
        </div>

        <div className="reg-det">
          <button type="button" className="btn gh sm reg-retour" onClick={() => setDetail(false)}>
            <Icon name="chevl" />
            {t('settings.title')}
          </button>
          <section className="carte reg-panneau" key={current.id} onChangeCapture={(e) => {
            // Contrôles appliqués tout de suite (les champs texte s'enregistrent en sortant)
            const el = e.target as HTMLInputElement;
            if (el.tagName === 'SELECT' || ['checkbox', 'radio', 'range'].includes(el.type)) flash();
          }}>
            <div className="reg-tete">
              <h2>
                <Icon name={current.icon} size={22} className="acc" />
                {t(current.title)}
              </h2>
              <span className={`statut ok enregistre${saved ? ' vu' : ''}`} aria-live="polite">
                {saved ? (
                  <>
                    <Icon name="check" size={16} />
                    {t('reglages.saved')}
                  </>
                ) : null}
              </span>
            </div>
            {sub(current) && <p className="intro">{sub(current)}</p>}

            {current.id === 'general' && <GeneralSection settings={settings} update={update} />}
            {current.id === 'appearance' && <AppearanceSection settings={settings} update={update} />}
            {activeModule?.settingsPanel?.()}
            {current.id === 'shortcuts' && <ShortcutsSection onSaved={flash} />}
            {current.id === 'storage' && <StorageSection settings={settings} update={update} />}
            {current.id === 'server' && <ServerSection onSaved={flash} />}
            {current.id === 'ai' && <TraductionSection settings={settings} update={update} />}
            {current.id === 'homeassistant' && <HaSettingsPage />}
            {current.id === 'updates' && <UpdatesSection version={version} />}
            {current.id === 'about' && (
              <div className="reg-sec apropos">
                <div className="apropos-marque">
                  <Brand />
                </div>
                <p className="soft">{t('settings.about.blurb')}</p>
                <p className="muted petit mono">{t('settings.about.version', { v: version })}</p>
                <p>
                  <a
                    className="lien"
                    href="https://github.com/SuperNon0/MultiOutils"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="external" size={16} />
                    github.com/SuperNon0/MultiOutils
                  </a>
                </p>
                <p className="muted petit">
                  {t('settings.about.flow')}{' '}
                  <a
                    className="lien"
                    href="https://github.com/Flow-Launcher/Flow.Launcher"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Flow Launcher (MIT)
                  </a>
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection({
  settings,
  update
}: {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}): ReactNode {
  const { t } = useI18n();
  const appearance = settings.appearance;
  const choose = (patch: Partial<AppSettings['appearance']>): void => {
    const next = { ...appearance, ...patch };
    applyAppearance(next); // tout de suite, sans attendre l'aller-retour
    void update({ appearance: next });
  };
  return (
    <>
      <div className="reg-sec">
        <div className="lbl-mono">{t('appearance.accent')}</div>
        <div className="pastilles" role="radiogroup" aria-label={t('appearance.accent')}>
          {APPEARANCE_ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              className={`past${appearance.accent === accent ? ' on' : ''}`}
              data-v={accent}
              role="radio"
              aria-checked={appearance.accent === accent}
              onClick={() => choose({ accent })}
            >
              <i />
              {t(`appearance.accent.${accent}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="reg-sec">
        <div className="lbl-mono">{t('appearance.theme')}</div>
        <div className="seg" role="group" aria-label={t('appearance.theme')}>
          {APPEARANCE_THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              className={appearance.theme === theme ? 'on' : ''}
              aria-pressed={appearance.theme === theme}
              onClick={() => choose({ theme })}
            >
              <Icon name={theme === 'auto' ? 'sparkle' : theme === 'clair' ? 'sun' : 'moon'} size={16} />
              {t(`appearance.theme.${theme}`)}
            </button>
          ))}
        </div>
        <p className="muted petit reg-note">{t('appearance.themeNote')}</p>
      </div>
    </>
  );
}

function ServerSection({ onSaved }: { onSaved(): void }): ReactNode {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<RemoteTestResult | null>(null);

  useEffect(() => {
    void window.api.remote.getConfig().then((config) => {
      setUrl(config.url);
      setHasToken(config.hasToken);
    });
  }, []);

  const save = async (): Promise<void> => {
    const config = await window.api.remote.setConfig(url, tokenInput ? tokenInput : undefined);
    setHasToken(config.hasToken);
    setUrl(config.url);
    setTokenInput('');
    onSaved();
  };

  const test = async (): Promise<void> => {
    setTesting(true);
    setResult(null);
    // enregistre d'abord ce qui est saisi, puis teste la config effective
    await save();
    setResult(await window.api.remote.test());
    setTesting(false);
  };

  return (
    <>
      <p className="intro">{t('settings.server.help')}</p>
      <div className="form">
        <div>
          <label className="lbl" htmlFor="srv-url">
            {t('settings.server.url')}
            <Aide
              titre={t('settings.server.url')}
              texte={t('settings.help.url')}
              exemple={t('settings.help.url.ex')}
            />
          </label>
          <input
            id="srv-url"
            className="input mono"
            type="text"
            value={url}
            spellCheck={false}
            placeholder={t('settings.server.urlPlaceholder')}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => void save()}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="srv-token">
            {t('settings.server.token')}
            <Aide
              titre={t('settings.server.token')}
              texte={t('settings.help.token')}
              exemple={t('settings.help.token.ex')}
            />
          </label>
          <input
            id="srv-token"
            className="input mono"
            type="password"
            value={tokenInput}
            placeholder="mo_…"
            onChange={(e) => setTokenInput(e.target.value)}
            onBlur={() => tokenInput && void save()}
          />
          {hasToken && (
            <p className="statut ok reg-note">
              <Icon name="lock" size={16} /> {t('settings.server.tokenSaved')}
            </p>
          )}
        </div>
        <p className="muted petit">{t('settings.server.howTo')}</p>
        <div className="ligne">
          <button
            type="button"
            className={`btn pri${testing ? ' occupe' : ''}`}
            disabled={testing}
            onClick={() => void test()}
          >
            <Icon name="wifi" />
            {testing ? t('settings.server.testing') : t('settings.server.test')}
          </button>
        </div>
        {result && (
          <p className={`statut ${result.ok ? 'ok' : 'err'}`}>
            <Icon name={result.ok ? 'check' : 'alert'} size={16} />{' '}
            {result.ok
              ? t('settings.server.testOk', { v: result.version })
              : result.error === 'badToken'
                ? t('settings.server.testBadToken')
                : t('settings.server.testUnreachable')}
          </p>
        )}
      </div>
    </>
  );
}

function UpdatesSection({ version }: { version: string }): ReactNode {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });

  useEffect(() => {
    void window.api.update.status().then(setStatus);
    return window.api.update.onStatus(setStatus);
  }, []);

  return (
    <>
      <div className="tuiles maj-tuiles">
        <div className="tuile">
          <div className="k">
            <Icon name="check" size={16} />
            {t('reglages.updates.installed')}
          </div>
          <div className="v">{version}</div>
        </div>
      </div>
      <p className="intro reg-note">{t('settings.updates.how')}</p>

      {status.state === 'available' ? (
        <div className="bloc maj-bloc">
          <p className="acc">{t('settings.updates.available', { v: status.version })}</p>
          {status.notes && <p className="muted petit maj-notes">{status.notes}</p>}
          <button type="button" className="btn pri" onClick={() => void window.api.update.download()}>
            <Icon name="download" />
            {t('settings.updates.download')}
          </button>
        </div>
      ) : status.state === 'downloading' ? (
        <div className="bloc maj-bloc">
          <p>{t('settings.updates.downloading', { p: status.percent })}</p>
          <div className="pg epais">
            <i style={{ width: `${status.percent}%` }} />
          </div>
          <p className="muted petit">{t('settings.updates.autoRestart')}</p>
        </div>
      ) : status.state === 'installing' ? (
        <div className="bloc maj-bloc">
          <p className="acc">{t('settings.updates.installing', { v: status.version })}</p>
        </div>
      ) : status.state === 'downloaded' ? (
        <div className="bloc maj-bloc">
          <p className="acc">{t('settings.updates.ready', { v: status.version })}</p>
          <button type="button" className="btn pri" onClick={() => void window.api.update.install()}>
            <Icon name="refresh" />
            {t('settings.updates.install')}
          </button>
        </div>
      ) : (
        <div className="form">
          {status.state === 'none' && (
            <p className="statut ok">
              <Icon name="check" size={16} /> {t('settings.updates.upToDate')}
            </p>
          )}
          {status.state === 'dev' && <p className="muted">{t('settings.updates.devMode')}</p>}
          {status.state === 'error' && (
            <p className="statut err">
              <Icon name="alert" size={16} /> {t('settings.updates.error', { msg: status.message })}
            </p>
          )}
          <div className="ligne">
            <button
              type="button"
              className={`btn pri${status.state === 'checking' ? ' occupe' : ''}`}
              disabled={status.state === 'checking'}
              onClick={() => void window.api.update.check()}
            >
              <Icon name="refresh" />
              {status.state === 'checking' ? t('settings.updates.checking') : t('settings.updates.check')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function GeneralSection({
  settings,
  update
}: {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}): ReactNode {
  const { t } = useI18n();
  return (
    <RegSec>
      <RegLigne titre={t('settings.general.language')}>
        <select
          className="select reg-select"
          value={settings.language}
          onChange={(e) => void update({ language: e.target.value as Language })}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </RegLigne>
      <RegSwitch
        titre={t('settings.general.autostart')}
        checked={settings.autostart}
        onChange={(v) => void update({ autostart: v })}
      />
      <RegSwitch
        titre={t('settings.general.startMinimized')}
        checked={settings.startMinimized}
        disabled={!settings.autostart}
        onChange={(v) => void update({ startMinimized: v })}
      />
      <RegSwitch
        titre={t('settings.general.closeToTray')}
        checked={settings.closeToTray}
        onChange={(v) => void update({ closeToTray: v })}
      />
    </RegSec>
  );
}

/** Raccourcis qui ont une bulle « ? » (les autres parlent d'eux-mêmes). */
const SHORTCUT_HELP = ['region', 'delayed'];

function ShortcutsSection({ onSaved }: { onSaved(): void }): ReactNode {
  const { t } = useI18n();
  const [statuses, setStatuses] = useState<ShortcutStatus[]>([]);

  const refresh = async (): Promise<void> => {
    setStatuses(await window.api.shortcuts.status());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const setShortcut = async (id: string, accelerator: string): Promise<void> => {
    await window.api.shortcuts.set(id, accelerator);
    await refresh();
    onSaved();
  };

  return (
    <>
      <p className="intro">{t('settings.shortcuts.hint')}</p>
      <RegSec>
        {statuses.map((status) => {
          const def = (DEFAULT_SHORTCUTS as Record<string, string>)[status.id];
          return (
            <RegLigne
              key={status.id}
              titre={t(`settings.shortcuts.${status.id}`)}
              aide={
                SHORTCUT_HELP.includes(status.id) ? (
                  <Aide
                    titre={t(`settings.shortcuts.${status.id}`)}
                    texte={t(`settings.help.${status.id}`)}
                    exemple={t(`settings.help.${status.id}.ex`)}
                  />
                ) : undefined
              }
              sous={
                !status.ok ? (
                  <span className="dan">{t('settings.shortcuts.conflict')}</span>
                ) : undefined
              }
            >
              <div className="ligne raccourci">
                {def && status.accelerator !== def && (
                  <button
                    type="button"
                    className="btn gh xs"
                    onClick={() => void setShortcut(status.id, DEFAULT_SHORTCUTS[status.id as ShortcutId])}
                  >
                    <Icon name="undo" size={16} />
                    {t('settings.shortcuts.reset')}
                  </button>
                )}
                <ShortcutRecorder
                  accelerator={status.accelerator}
                  ok={status.ok}
                  onSet={(acc) => setShortcut(status.id, acc)}
                />
              </div>
            </RegLigne>
          );
        })}
      </RegSec>
    </>
  );
}

function ShortcutRecorder({
  accelerator,
  ok,
  onSet
}: {
  accelerator: string;
  ok: boolean;
  onSet(accelerator: string): Promise<void>;
}): ReactNode {
  const { t, lang } = useI18n();
  const [recording, setRecording] = useState(false);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    const acc = eventToAccelerator(event.nativeEvent);
    if (!acc) return;
    setRecording(false);
    void onSet(acc);
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
        <span className="kbd">{displayAccelerator(accelerator, lang)}</span>
      )}
    </button>
  );
}

function StorageSection({
  settings,
  update
}: {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}): ReactNode {
  const { t } = useI18n();
  const [template, setTemplate] = useState(settings.filenameTemplate);

  useEffect(() => {
    setTemplate(settings.filenameTemplate);
  }, [settings.filenameTemplate]);

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.api.settings.chooseFolder();
    if (dir) await update({ storageDir: dir });
  };

  const commitTemplate = (): void => {
    const value = template.trim();
    if (value && value !== settings.filenameTemplate) {
      void update({ filenameTemplate: value });
    }
  };

  const emptyTrash = async (): Promise<void> => {
    const ok = await ui.confirmer(t('gallery.confirmEmptyTrash'), {
      titre: t('gallery.emptyTrash'),
      ok: t('gallery.emptyTrash'),
      danger: true
    });
    if (!ok) return;
    await window.api.library.update({ action: 'emptyTrash' });
    ui.toast(t('reglages.trashEmptied'));
  };

  return (
    <>
      <RegSec
        titre={
          <>
            {t('settings.storage.dir')}
            <Aide titre={t('settings.storage.dir')} texte={t('settings.help.dir')} exemple={t('settings.help.dir.ex')} />
          </>
        }
      >
        <div className="copie">
          <code title={settings.storageDir}>{settings.storageDir}</code>
          <button type="button" className="btn sm" onClick={() => void chooseFolder()}>
            <Icon name="folder" />
            {t('settings.storage.change')}
          </button>
        </div>
      </RegSec>

      <RegSec
        titre={
          <>
            {t('settings.storage.template')}
            <Aide
              titre={t('settings.storage.template')}
              texte={t('settings.help.template')}
              exemple={t('settings.help.template.ex')}
            />
          </>
        }
      >
        <input
          className="input mono"
          value={template}
          spellCheck={false}
          aria-label={t('settings.storage.template')}
          onChange={(e) => setTemplate(e.target.value)}
          onBlur={commitTemplate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTemplate();
          }}
        />
        <p className="muted petit reg-note">{t('settings.storage.templateHelp')}</p>
      </RegSec>

      <RegSec>
        <RegLigne
          titre={t('settings.storage.trashRetention')}
          aide={
            <Aide
              titre={t('settings.storage.trashRetention')}
              texte={t('settings.help.trash')}
              exemple={t('settings.help.trash.ex')}
            />
          }
        >
          <select
            className="select reg-select"
            value={settings.trashRetentionDays}
            onChange={(e) => void update({ trashRetentionDays: Number(e.target.value) })}
          >
            <option value={0}>{t('settings.storage.trashRetentionNever')}</option>
            {[7, 14, 30, 90].map((days) => (
              <option key={days} value={days}>
                {days}
              </option>
            ))}
          </select>
        </RegLigne>
      </RegSec>

      <div className="reg-sec">
        <div className="zone-d">
          <h3>
            <Icon name="alert" />
            {t('reglages.danger')}
          </h3>
          <p>{t('reglages.danger.trash')}</p>
          <div className="ligne zone-d-actions">
            <button type="button" className="btn dn sm" onClick={() => void emptyTrash()}>
              <Icon name="trash" />
              {t('gallery.emptyTrash')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
