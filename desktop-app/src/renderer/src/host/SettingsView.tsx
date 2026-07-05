import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react';
import {
  DEFAULT_SHORTCUTS,
  type AppSettings,
  type Language,
  type ShortcutId,
  type ShortcutStatus,
  type UpdateStatus
} from '../../../common/types';
import { useI18n } from '../i18n';
import { displayAccelerator } from '../lib/format';
import { eventToAccelerator } from '../lib/shortcuts';
import type { ToolModule } from './types';

interface Props {
  settings: AppSettings;
  version: string;
  section?: string;
  modules: ToolModule[];
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

/**
 * Paramètres (docs/00 §5.4) : sections de l'hôte + une section par module
 * qui fournit un settingsPanel().
 */
export function SettingsView({
  settings,
  version,
  section,
  modules,
  update
}: Props): ReactNode {
  const { t } = useI18n();
  const moduleSections = modules.filter((m) => m.settingsPanel);
  const sections = [
    'general',
    ...moduleSections.map((m) => m.id),
    'shortcuts',
    'storage',
    'server',
    'updates',
    'about'
  ];
  const [active, setActive] = useState(section ?? 'general');

  useEffect(() => {
    if (section) setActive(section);
  }, [section]);

  const activeModule = moduleSections.find((m) => m.id === active);

  return (
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label={t('settings.title')}>
        <h2>{t('settings.title')}</h2>
        {sections.map((id) => (
          <button
            key={id}
            type="button"
            className={`nav-item${active === id ? ' active' : ''}`}
            onClick={() => setActive(id)}
          >
            {t(`settings.section.${id}`)}
          </button>
        ))}
      </nav>

      <div className="settings-body">
        <h3>{t(`settings.section.${active}`)}</h3>

        {active === 'general' && <GeneralSection settings={settings} update={update} />}
        {activeModule?.settingsPanel?.()}
        {active === 'shortcuts' && <ShortcutsSection />}
        {active === 'storage' && <StorageSection settings={settings} update={update} />}
        {active === 'server' && <p className="muted section-note">{t('settings.server.phase')}</p>}
        {active === 'updates' && <UpdatesSection version={version} />}
        {active === 'about' && (
          <div>
            <div className="about-brand">
              Multi<span className="accent">Outils</span>
            </div>
            <p className="section-note">{t('settings.about.blurb')}</p>
            <p className="muted">{t('settings.about.version', { v: version })}</p>
            <p>
              <a href="https://github.com/SuperNon0/MultiOutils" target="_blank" rel="noreferrer">
                github.com/SuperNon0/MultiOutils
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
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
    <div>
      <p>{t('settings.updates.current', { v: version })}</p>
      <p className="muted section-note">{t('settings.updates.how')}</p>

      {status.state === 'available' ? (
        <div className="card update-card">
          <p className="accent">
            {t('settings.updates.available', { v: status.version })}
          </p>
          {status.notes && <p className="muted update-notes">{status.notes}</p>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void window.api.update.download()}
          >
            {t('settings.updates.download')}
          </button>
        </div>
      ) : status.state === 'downloading' ? (
        <p className="accent">
          {t('settings.updates.downloading', { p: status.percent })}
        </p>
      ) : status.state === 'downloaded' ? (
        <div className="card update-card">
          <p className="accent">
            {t('settings.updates.ready', { v: status.version })}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void window.api.update.install()}
          >
            {t('settings.updates.install')}
          </button>
        </div>
      ) : (
        <>
          {status.state === 'none' && (
            <p className="accent">{t('settings.updates.upToDate')}</p>
          )}
          {status.state === 'dev' && (
            <p className="muted">{t('settings.updates.devMode')}</p>
          )}
          {status.state === 'error' && (
            <p className="shortcut-conflict">
              {t('settings.updates.error', { msg: status.message })}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={status.state === 'checking'}
            onClick={() => void window.api.update.check()}
          >
            {status.state === 'checking'
              ? t('settings.updates.checking')
              : t('settings.updates.check')}
          </button>
        </>
      )}
    </div>
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
    <div>
      <div className="setting-row">
        <span>{t('settings.general.language')}</span>
        <select
          className="select"
          value={settings.language}
          onChange={(e) => void update({ language: e.target.value as Language })}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="setting-row">
        <span>
          {t('settings.general.theme')}
          <div className="check-note">{t('settings.general.themeNote')}</div>
        </span>
        <select className="select" value="dark" disabled>
          <option value="dark">{t('settings.general.theme.dark')}</option>
        </select>
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.autostart}
          onChange={(e) => void update({ autostart: e.target.checked })}
        />
        <span>{t('settings.general.autostart')}</span>
      </label>

      <label className="check-row check-row-indent">
        <input
          type="checkbox"
          checked={settings.startMinimized}
          disabled={!settings.autostart}
          onChange={(e) => void update({ startMinimized: e.target.checked })}
        />
        <span>{t('settings.general.startMinimized')}</span>
      </label>

      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.closeToTray}
          onChange={(e) => void update({ closeToTray: e.target.checked })}
        />
        <span>{t('settings.general.closeToTray')}</span>
      </label>
    </div>
  );
}

function ShortcutsSection(): ReactNode {
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
  };

  return (
    <div>
      <p className="muted section-note">{t('settings.shortcuts.hint')}</p>
      {statuses.map((status) => (
        <div key={status.id} className="setting-row">
          <span>{t(`settings.shortcuts.${status.id}`)}</span>
          <div className="field-row">
            {!status.ok && (
              <span className="shortcut-conflict">
                {t('settings.shortcuts.conflict')}
              </span>
            )}
            <ShortcutRecorder
              accelerator={status.accelerator}
              ok={status.ok}
              onSet={(acc) => setShortcut(status.id, acc)}
            />
            {(DEFAULT_SHORTCUTS as Record<string, string>)[status.id] &&
              status.accelerator !==
                (DEFAULT_SHORTCUTS as Record<string, string>)[status.id] && (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void setShortcut(
                      status.id,
                      DEFAULT_SHORTCUTS[status.id as ShortcutId]
                    )
                  }
                >
                  {t('settings.shortcuts.reset')}
                </button>
              )}
          </div>
        </div>
      ))}
    </div>
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
      className={`btn shortcut-recorder${recording ? ' recording' : ''}${ok ? '' : ' conflict'}`}
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

  return (
    <div>
      <div className="setting-row">
        <span>{t('settings.storage.dir')}</span>
        <div className="field-row">
          <code className="storage-path" title={settings.storageDir}>
            {settings.storageDir}
          </code>
          <button type="button" className="btn" onClick={() => void chooseFolder()}>
            {t('settings.storage.change')}
          </button>
        </div>
      </div>

      <div className="setting-row">
        <span>{t('settings.storage.template')}</span>
        <input
          className="input template-input"
          value={template}
          spellCheck={false}
          onChange={(e) => setTemplate(e.target.value)}
          onBlur={commitTemplate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTemplate();
          }}
        />
      </div>
      <p className="muted section-note">{t('settings.storage.templateHelp')}</p>

      <div className="setting-row">
        <span>{t('settings.storage.trashRetention')}</span>
        <select
          className="select"
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
      </div>
    </div>
  );
}
