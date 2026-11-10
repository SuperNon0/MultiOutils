/**
 * Réglages → Home Assistant : page à part entière (sortie du Lanceur à la
 * demande de Noë). Connexion (adresse + jeton, partagés avec le plugin « ha »
 * du lanceur), liaison PC ↔ HA, boutons, capteurs, notifications et mini
 * tableau de bord. Les valeurs restent rangées avec les réglages du lanceur
 * côté main (homeAssistant), pour que le plugin du lanceur les utilise aussi.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { LauncherSettingsInfo } from '../../../../../common/api';
import type {
  HaLinkStatus,
  HaNotification,
  HaSettingsPatch,
  HaToastPosition,
  LauncherSettings as Settings
} from '../../../../../common/launcher';
import { Aide, ui } from '../../../encre/ui';
import { Icon } from '../../../host/Icon';
import { RegLigne, RegSec, RegSwitch } from '../../../host/reglages';
import { useI18n } from '../../../i18n';
import { Champ, ShortcutRecorder } from '../LauncherSettings';
import './ha.css';

/** Home Assistant : adresse, jeton (chiffré côté main), test de connexion. */
function HomeAssistantSection({ url, onUrl }: { url: string; onUrl(v: string): void }): ReactNode {
  const { t } = useI18n();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.api.launcher.haStatus().then((r) => setHasToken(r.hasToken));
  }, []);
  const saveToken = async (v: string): Promise<void> => {
    try {
      const r = await window.api.launcher.haSetToken(v);
      setHasToken(r.hasToken);
      setToken('');
      setTest(null);
    } catch (err) {
      ui.toastErr(err);
    }
  };
  const runTest = async (): Promise<void> => {
    setBusy(true);
    const r = await window.api.launcher.haTest();
    setBusy(false);
    setTest(
      r.ok
        ? { ok: true, text: t('launcher.ha.testOk', { n: r.count }) }
        : {
            ok: false,
            text: t(
              r.error === 'not-configured'
                ? 'launcher.ha.notConfiguredSub'
                : r.error === 'unauthorized'
                  ? 'launcher.ha.badToken'
                  : 'launcher.ha.testFail',
              { msg: r.error }
            )
          }
    );
  };
  return (
    <RegSec titre={t('launcher.ha.connection')}>
      <RegLigne
        titre={t('launcher.ha.url')}
        aide={<Aide titre={t('launcher.ha.url')} texte={t('launcher.ha.urlHelp')} exemple="http://homeassistant.local:8123" />}
        sous={t('launcher.ha.urlDesc')}
      >
        <Champ
          value={url}
          onCommit={onUrl}
          className="input mono ha-champ"
          placeholder="http://homeassistant.local:8123"
          aria-label={t('launcher.ha.url')}
        />
      </RegLigne>
      <RegLigne
        titre={t('launcher.ha.token')}
        aide={<Aide titre={t('launcher.ha.token')} texte={t('launcher.ha.tokenHelp')} exemple={t('launcher.ha.tokenHelp.ex')} />}
        sous={hasToken ? t('launcher.ha.tokenSaved') : t('launcher.ha.tokenDesc')}
      >
        <form
          className="ligne"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void saveToken(token);
          }}
        >
          <input
            type="password"
            className="input mono ha-champ"
            value={token}
            placeholder={hasToken ? '••••••••' : 'eyJhbGciOi…'}
            aria-label={t('launcher.ha.token')}
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="btn sm" disabled={!token.trim()}>
            {t('common.save')}
          </button>
          {hasToken && (
            <button type="button" className="btn sm gh" onClick={() => void saveToken('')}>
              {t('launcher.settings.remove')}
            </button>
          )}
        </form>
      </RegLigne>
      <RegLigne titre={t('launcher.ha.test')} sous={test ? <span className={test.ok ? 'ok' : 'dan'}>{test.text}</span> : t('launcher.ha.testDesc')}>
        <button type="button" className={`btn sm${busy ? ' occupe' : ''}`} disabled={busy} onClick={() => void runTest()}>
          <Icon name="plug" size={16} />
          {t('launcher.ha.test')}
        </button>
      </RegLigne>
    </RegSec>
  );
}

/** Exemple d'automatisation affiché dans les réglages (à copier dans HA). */
const haExample = (service: string): string => `action: ${service}
data:
  title: "Machine à laver"
  message: "Le linge est prêt 🧺"
  data:
    icon: mdi:washing-machine
    color: menthe
    image: /api/camera_proxy/camera.entree
    tag: lessive
    actions:
      - action: LESSIVE_VUE
        title: "OK, j'y vais"`;

/** Liaison PC ↔ Home Assistant : appareil, capteurs, boutons, notifications, mini fenêtre. */
function HaLinkSections({
  s,
  shortcutOk,
  onSave
}: {
  s: Settings['homeAssistant'];
  shortcutOk: boolean;
  onSave(patch: HaSettingsPatch): void;
}): ReactNode {
  const { t } = useI18n();
  const [st, setSt] = useState<HaLinkStatus | null>(null);
  const [historique, setHistorique] = useState<HaNotification[]>([]);
  useEffect(() => {
    void window.api.ha.status().then(setSt);
    void window.api.ha.history().then(setHistorique);
    const a = window.api.ha.onStatus(setSt);
    const b = window.api.ha.onHistory(setHistorique);
    return () => {
      a();
      b();
    };
  }, []);
  const service = st?.notifyService ?? 'notify.mobile_app_pc';
  const etat = st?.state ?? 'off';
  const etatTexte =
    etat === 'error' && st?.error
      ? t('ha.link.state.errorMsg', {
          msg: st.error === 'unauthorized' ? t('launcher.ha.badToken') : st.error === 'not-configured' ? t('launcher.ha.notConfiguredSub') : st.error
        })
      : t(`ha.link.state.${etat}`);
  const copier = (v: string): void => {
    void navigator.clipboard.writeText(v).then(() => ui.toast(t('ha.copied')));
  };
  const link = s.link;
  const notif = s.notifications;
  const dash = s.dashboard;
  return (
    <>
      <RegSec titre={t('ha.link.title')}>
        <RegSwitch
          titre={t('ha.link.enabled')}
          aide={<Aide titre={t('ha.link.enabled')} texte={t('ha.link.enabledHelp')} exemple={t('ha.link.enabledHelp.ex')} />}
          sous={t('ha.link.enabledDesc')}
          checked={link.enabled}
          onChange={(v) => onSave({ link: { enabled: v } })}
        />
        <RegLigne
          titre={t('ha.link.state')}
          sous={<span className={etat === 'connected' ? 'ok' : etat === 'error' ? 'dan' : ''}>{etatTexte}</span>}
        >
          {link.enabled && (
            <button type="button" className="btn sm" onClick={() => void window.api.ha.reconnect().then(setSt)}>
              <Icon name="refresh" size={16} />
              {t('ha.link.reconnect')}
            </button>
          )}
        </RegLigne>
        <RegLigne titre={t('ha.link.name')} sous={t('ha.link.nameDesc')}>
          <Champ
            value={link.deviceName}
            onCommit={(v) => onSave({ link: { deviceName: v.trim() } })}
            className="input ha-champ"
            placeholder="PC"
            maxLength={60}
            aria-label={t('ha.link.name')}
          />
        </RegLigne>
        {st?.registered && (
          <RegLigne titre={t('ha.link.service')} sous={t('ha.link.serviceDesc')}>
            <button type="button" className="btn sm" onClick={() => copier(service)}>
              <Icon name="copy" size={16} />
              <code>{service}</code>
            </button>
          </RegLigne>
        )}
      </RegSec>

      <RegSec titre={t('ha.buttons.title')}>
        <RegSwitch
          titre={t('ha.buttons.enabled')}
          aide={<Aide titre={t('ha.buttons.enabled')} texte={t('ha.buttons.help')} exemple={t('ha.buttons.help.ex')} />}
          sous={t('ha.buttons.enabledDesc')}
          checked={link.commands && link.buttons}
          disabled={!link.enabled}
          onChange={(v) => onSave({ link: v ? { buttons: true, commands: true } : { buttons: false } })}
        />
        <RegSwitch
          titre={t('ha.buttons.power')}
          sous={t('ha.buttons.powerDesc')}
          checked={link.powerCommands}
          disabled={!link.enabled || !link.commands}
          onChange={(v) => onSave({ link: { powerCommands: v } })}
        />
        <RegSwitch
          titre={t('ha.buttons.commands')}
          sous={t('ha.buttons.commandsDesc')}
          checked={link.commands}
          disabled={!link.enabled}
          onChange={(v) => onSave({ link: { commands: v } })}
        />
        {st && st.buttons.length > 0 && (
          <RegLigne titre={t('ha.buttons.created')} sous={t('ha.buttons.createdDesc')}>
            <div className="ha-mono-list">
              {st.buttons.map((b) => (
                <code key={b}>{b}</code>
              ))}
            </div>
          </RegLigne>
        )}
      </RegSec>

      <RegSec titre={t('ha.sensors.title')}>
        <RegSwitch
          titre={t('ha.sensors.enabled')}
          aide={<Aide titre={t('ha.sensors.enabled')} texte={t('ha.sensors.help')} exemple={t('ha.sensors.help.ex')} />}
          sous={t('ha.sensors.enabledDesc')}
          checked={link.sensors}
          disabled={!link.enabled}
          onChange={(v) => onSave({ link: { sensors: v } })}
        />
        <RegLigne titre={t('ha.sensors.interval')} sous={t('ha.sensors.intervalDesc')}>
          <select
            className="select reg-select"
            value={link.sensorInterval}
            disabled={!link.enabled || !link.sensors}
            aria-label={t('ha.sensors.interval')}
            onChange={(e) => onSave({ link: { sensorInterval: Number(e.target.value) } })}
          >
            {[15, 30, 60, 120, 300, 600].map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} s` : `${n / 60} min`}
              </option>
            ))}
          </select>
        </RegLigne>
      </RegSec>

      <RegSec titre={t('ha.notif.title')}>
        <RegSwitch
          titre={t('ha.notif.enabled')}
          aide={<Aide titre={t('ha.notif.enabled')} texte={t('ha.notif.help')} exemple={t('ha.notif.help.ex')} />}
          sous={t('ha.notif.enabledDesc')}
          checked={notif.enabled}
          onChange={(v) => onSave({ notifications: { enabled: v } })}
        />
        <RegLigne titre={t('ha.notif.position')}>
          <select
            className="select reg-select"
            value={notif.position}
            aria-label={t('ha.notif.position')}
            onChange={(e) => onSave({ notifications: { position: e.target.value as HaToastPosition } })}
          >
            {(['bottom-right', 'top-right', 'bottom-left', 'top-left'] as const).map((p) => (
              <option key={p} value={p}>
                {t(`ha.notif.pos.${p}`)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegLigne titre={t('ha.notif.duration')} sous={t('ha.notif.durationDesc')}>
          <select
            className="select reg-select"
            value={notif.duration}
            aria-label={t('ha.notif.duration')}
            onChange={(e) => onSave({ notifications: { duration: Number(e.target.value) } })}
          >
            {[4, 6, 8, 12, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </RegLigne>
        <RegSwitch
          titre={t('ha.notif.sound')}
          checked={notif.sound}
          onChange={(v) => onSave({ notifications: { sound: v } })}
        />
        <RegSwitch
          titre={t('ha.notif.dnd')}
          sous={t('ha.notif.dndDesc')}
          checked={notif.doNotDisturb}
          onChange={(v) => onSave({ notifications: { doNotDisturb: v } })}
        />
        <RegLigne titre={t('ha.notif.test')} sous={t('ha.notif.testDesc')}>
          <button type="button" className="btn sm" onClick={() => void window.api.ha.testToast()}>
            <Icon name="bell" size={16} />
            {t('ha.notif.testBtn')}
          </button>
        </RegLigne>
        <RegLigne titre={t('ha.notif.example')} sous={t('ha.notif.exampleDesc')}>
          <button type="button" className="btn sm gh" onClick={() => copier(haExample(service))}>
            <Icon name="copy" size={16} />
            {t('ha.notif.copyExample')}
          </button>
        </RegLigne>
        <div className="ha-exemple-boite">
          <pre className="ha-exemple">{haExample(service)}</pre>
        </div>
        {historique.length > 0 && (
          <RegLigne
            titre={t('ha.notif.history', { n: historique.length })}
            sous={t('ha.notif.historyDesc')}
          >
            <button type="button" className="btn sm gh" onClick={() => void window.api.ha.clearHistory()}>
              {t('ha.notif.clearHistory')}
            </button>
          </RegLigne>
        )}
      </RegSec>

      <RegSec titre={t('ha.dash.title')}>
        <RegLigne titre={t('ha.dash.shortcut')} sous={t('ha.dash.shortcutDesc')}>
          <div className="ligne">
            <ShortcutRecorder value={dash.shortcut} ok={shortcutOk} onSet={(v) => onSave({ dashboard: { shortcut: v } })} />
            {dash.shortcut && (
              <button type="button" className="btn sm gh" onClick={() => onSave({ dashboard: { shortcut: '' } })}>
                {t('launcher.settings.remove')}
              </button>
            )}
          </div>
        </RegLigne>
        <RegLigne
          titre={t('ha.dash.path')}
          aide={<Aide titre={t('ha.dash.path')} texte={t('ha.dash.pathHelp')} exemple="/lovelace/0 · /dashboard-pc" />}
          sous={t('ha.dash.pathDesc')}
        >
          <Champ
            value={dash.path}
            onCommit={(v) => onSave({ dashboard: { path: v.trim() } })}
            className="input mono ha-champ"
            placeholder="/lovelace/0"
            aria-label={t('ha.dash.path')}
          />
        </RegLigne>
        <RegLigne titre={t('ha.dash.size')} sous={t('ha.dash.sizeDesc')}>
          <select
            className="select reg-select"
            value={`${dash.width}x${dash.height}`}
            aria-label={t('ha.dash.size')}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              onSave({ dashboard: { width: w, height: h } });
            }}
          >
            {[
              [400, 640],
              [460, 760],
              [560, 860],
              [800, 900],
              [1100, 900]
            ]
              .concat(
                [[400, 640], [460, 760], [560, 860], [800, 900], [1100, 900]].some(([w, h]) => w === dash.width && h === dash.height)
                  ? []
                  : [[dash.width, dash.height]]
              )
              .map(([w, h]) => (
                <option key={`${w}x${h}`} value={`${w}x${h}`}>
                  {w} × {h}
                </option>
              ))}
          </select>
        </RegLigne>
        <RegSwitch
          titre={t('ha.dash.hideOnBlur')}
          sous={t('ha.dash.hideOnBlurDesc')}
          checked={dash.hideOnBlur}
          onChange={(v) => onSave({ dashboard: { hideOnBlur: v } })}
        />
        <RegLigne titre={t('ha.dash.open')} sous={t('ha.dash.openDesc')}>
          <button type="button" className="btn sm" disabled={!s.url} onClick={() => void window.api.ha.openDashboard()}>
            <Icon name="home" size={16} />
            {t('ha.dash.open')}
          </button>
        </RegLigne>
      </RegSec>
    </>
  );
}


/** Page complète, affichée dans Réglages → Home Assistant. */
export function HaSettingsPage(): ReactNode {
  const { t } = useI18n();
  const [info, setInfo] = useState<LauncherSettingsInfo | null>(null);
  useEffect(() => {
    void window.api.launcher.getSettings().then(setInfo);
    return window.api.launcher.onState((st) =>
      setInfo((cur) => (cur ? { ...cur, settings: st.settings, shortcutOk: st.shortcutOk } : cur))
    );
  }, []);
  if (!info) return null;
  const ha = info.settings.homeAssistant;
  const save = async (patch: HaSettingsPatch): Promise<void> => {
    // affichage immédiat, puis valeur nettoyée renvoyée par le main
    setInfo({
      ...info,
      settings: {
        ...info.settings,
        homeAssistant: {
          url: patch.url ?? ha.url,
          link: { ...ha.link, ...patch.link },
          notifications: { ...ha.notifications, ...patch.notifications },
          dashboard: { ...ha.dashboard, ...patch.dashboard }
        }
      }
    });
    try {
      setInfo(await window.api.launcher.setSettings({ homeAssistant: patch }));
    } catch (error) {
      ui.toastErr(error);
    }
  };
  return (
    <div className="ha-page">
      <p className="ha-intro soft">{t('ha.page.intro')}</p>
      <HomeAssistantSection url={ha.url} onUrl={(url) => void save({ url })} />
      <HaLinkSections s={ha} shortcutOk={info.haShortcutOk ?? true} onSave={(p) => void save(p)} />
      <RegSec titre={t('ha.launcher.title')}>
        <RegLigne titre={t('ha.launcher.keyword', { kw: info.settings.providers.homeassistant.keyword || '—' })} sous={t('ha.launcher.desc')}>
          <button
            type="button"
            className="btn sm gh"
            onClick={() => window.dispatchEvent(new CustomEvent('mo:open-settings', { detail: 'launcher' }))}
          >
            <Icon name="search" size={16} />
            {t('ha.launcher.open')}
          </button>
        </RegLigne>
      </RegSec>
    </div>
  );
}

