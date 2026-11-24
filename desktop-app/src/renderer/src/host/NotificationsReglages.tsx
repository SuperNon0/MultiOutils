/**
 * Réglages → Notifications : toutes les notifications de MultiOutils passent
 * par les mêmes pop-ups (celles de Home Assistant). On choisit ici ce qui
 * s'affiche (par outil, ne pas déranger), où, combien de temps et avec quel son.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { AppSettings } from '../../../common/types';
import type { HaSoundList, HaToastSize } from '../../../common/launcher';
import { HA_TOAST_POSITIONS } from '../../../common/launcher';
import { NOTIF_DURATIONS, NOTIF_KINDS, NOTIF_SIZES, type NotifKind, type NotifSettings } from '../../../common/notifications';
import { playHaSound } from '../modules/launcher/ha/sounds';
import '../modules/launcher/ha/ha.css';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { RegLigne, RegSec, RegSwitch } from './reglages';

const KIND_ICONS: Record<NotifKind, string> = {
  capture: 'camera',
  clipboard: 'clipboard',
  colorpicker: 'eyedropper',
  autoclick: 'mouse',
  desktop: 'grid',
  launcher: 'search',
  homeassistant: 'home',
  app: 'bell'
};

/** Son par défaut, volume, dossier des sons personnalisés. */
export function SoundSettings({
  soundName,
  volume,
  disabled,
  onSave
}: {
  soundName: string;
  volume: number;
  disabled: boolean;
  onSave(patch: { soundName?: string; volume?: number }): void;
}): ReactNode {
  const { t } = useI18n();
  const [list, setList] = useState<HaSoundList | null>(null);
  const [vol, setVol] = useState(volume);
  const refresh = (): void => void window.api.ha.sounds().then(setList);
  useEffect(refresh, []);
  useEffect(() => setVol(volume), [volume]);
  // le son enregistré peut être un fichier supprimé depuis : on le garde dans la liste
  const files = list ? list.files : [];
  const known = (list?.builtin ?? []).includes(soundName) || files.includes(soundName);
  const preview = async (name: string): Promise<void> => {
    const r = await window.api.ha.soundPreview(name);
    if (r) playHaSound(r, r.volume);
  };
  return (
    <>
      <RegLigne titre={t('ha.notif.soundName')} sous={t('ha.notif.soundNameDesc')}>
        <div className="ha-son">
          <select
            className="select reg-select"
            value={soundName}
            disabled={disabled}
            aria-label={t('ha.notif.soundName')}
            onFocus={refresh}
            onChange={(e) => {
              onSave({ soundName: e.target.value });
              void preview(e.target.value);
            }}
          >
            <optgroup label={t('ha.notif.soundBuiltin')}>
              {(list?.builtin ?? ['carillon']).map((n) => (
                <option key={n} value={n}>
                  {t(`ha.sound.${n}`)}
                </option>
              ))}
            </optgroup>
            {(files.length > 0 || !known) && (
              <optgroup label={t('ha.notif.soundFiles')}>
                {!known && <option value={soundName}>{soundName}</option>}
                {files.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            className="btn sm gh"
            disabled={disabled}
            aria-label={t('ha.notif.soundPlay')}
            title={t('ha.notif.soundPlay')}
            onClick={() => void preview(soundName)}
          >
            <Icon name="play" size={16} />
          </button>
        </div>
      </RegLigne>
      <RegLigne titre={t('ha.notif.volume')}>
        <div className="ha-son">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={vol}
            disabled={disabled}
            aria-label={t('ha.notif.volume')}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => {
              onSave({ volume: vol });
              void preview(soundName);
            }}
            onKeyUp={() => onSave({ volume: vol })}
          />
          <span className="ha-son-val">{vol} %</span>
        </div>
      </RegLigne>
      <RegLigne titre={t('ha.notif.soundFolder')} sous={t('ha.notif.soundFolderDesc')}>
        <button type="button" className="btn sm gh" onClick={() => void window.api.ha.openSoundsFolder().then(refresh)}>
          <Icon name="folder" size={16} />
          {t('ha.notif.soundFolderBtn')}
        </button>
      </RegLigne>
    </>
  );
}


export function NotificationsSection({
  settings,
  update
}: {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}): ReactNode {
  const { t } = useI18n();
  const n = settings.notifications;
  const save = (patch: Partial<NotifSettings>): void => void update({ notifications: { ...n, ...patch } });
  const off = !n.enabled;
  return (
    <>
      <RegSec>
        <RegSwitch
          titre={t('notif.set.enabled')}
          sous={t('notif.set.enabledDesc')}
          checked={n.enabled}
          onChange={(v) => save({ enabled: v })}
        />
        <RegSwitch
          titre={t('ha.notif.dnd')}
          sous={t('notif.set.dndDesc')}
          checked={n.doNotDisturb}
          disabled={off}
          onChange={(v) => save({ doNotDisturb: v })}
        />
        <RegLigne titre={t('ha.notif.test')} sous={t('notif.set.testDesc')}>
          <button type="button" className="btn sm" onClick={() => void window.api.notifications.test()}>
            <Icon name="bell" size={16} />
            {t('ha.notif.testBtn')}
          </button>
        </RegLigne>
      </RegSec>

      <RegSec titre={t('notif.set.display')}>
        <RegLigne titre={t('ha.notif.position')}>
          <select
            className="select reg-select"
            value={n.position}
            disabled={off}
            aria-label={t('ha.notif.position')}
            onChange={(e) => save({ position: e.target.value as NotifSettings['position'] })}
          >
            {HA_TOAST_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`ha.notif.pos.${p}`)}
              </option>
            ))}
          </select>
        </RegLigne>
        <RegLigne titre={t('notif.set.size')}>
          <div className="seg" role="group" aria-label={t('notif.set.size')}>
            {NOTIF_SIZES.map((z: HaToastSize) => (
              <button
                key={z}
                type="button"
                className={n.size === z ? 'on' : ''}
                aria-pressed={n.size === z}
                disabled={off}
                onClick={() => save({ size: z })}
              >
                {t(`notif.set.size.${z}`)}
              </button>
            ))}
          </div>
        </RegLigne>
        <RegLigne titre={t('ha.notif.duration')} sous={t('notif.set.durationDesc')}>
          <select
            className="select reg-select"
            value={n.duration}
            disabled={off}
            aria-label={t('ha.notif.duration')}
            onChange={(e) => save({ duration: Number(e.target.value) })}
          >
            {[...new Set<number>([...NOTIF_DURATIONS, n.duration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} s` : `${d / 60} min`}
              </option>
            ))}
          </select>
        </RegLigne>
      </RegSec>

      <RegSec titre={t('notif.set.sound')}>
        <RegSwitch
          titre={t('ha.notif.sound')}
          checked={n.sound}
          disabled={off}
          onChange={(v) => save({ sound: v })}
        />
        <SoundSettings
          soundName={n.soundName}
          volume={n.volume}
          disabled={off || !n.sound}
          onSave={(patch) => save(patch)}
        />
      </RegSec>

      <RegSec titre={t('notif.set.kinds')}>
        {NOTIF_KINDS.map((k) => (
          <RegSwitch
            key={k}
            titre={
              <>
                <Icon name={KIND_ICONS[k]} size={16} className="acc" /> {t(`notif.kind.${k}`)}
              </>
            }
            sous={t(`notif.kind.${k}.desc`)}
            checked={n.kinds[k]}
            disabled={off}
            onChange={(v) => save({ kinds: { ...n.kinds, [k]: v } })}
          />
        ))}
        <RegSwitch
          titre={t('notif.set.errorsAlways')}
          sous={t('notif.set.errorsAlwaysDesc')}
          checked={n.errorsAlways}
          disabled={off}
          onChange={(v) => save({ errorsAlways: v })}
        />
      </RegSec>
    </>
  );
}
