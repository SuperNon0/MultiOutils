import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ClipItem, ClipsSettings } from '../../../../common/types';
import { Icon } from '../../host/Icon';
import { useI18n, type TFunc } from '../../i18n';

/** Options de rétention proposées (heures ; 0 = jamais). */
const RETENTION_CHOICES = [1, 6, 24, 168, 720, 0] as const;

function retentionLabel(hours: number, t: TFunc): string {
  if (hours === 0) return t('clips.retention.never');
  if (hours < 24) return t('clips.retention.hours', { n: hours });
  return t('clips.retention.days', { n: Math.round(hours / 24) });
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString()} ${time}`;
}

/** Panneau « Presse-papiers » : historique des copies, épingle, envoi. */
export function ClipboardPanel(): ReactNode {
  const { t } = useI18n();
  const [items, setItems] = useState<ClipItem[]>([]);
  const [search, setSearch] = useState('');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const refresh = async (): Promise<void> => {
    setItems(await window.api.clips.list());
    setEnabled((await window.api.clips.getSettings()).enabled);
  };

  useEffect(() => {
    void refresh();
    return window.api.clips.onChanged(() => void refresh());
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyPinned && !item.pinned) return false;
      if (!query) return true;
      return (item.content ?? item.preview).toLowerCase().includes(query);
    });
  }, [items, search, onlyPinned]);

  const toggleEnabled = async (): Promise<void> => {
    const next = await window.api.clips.setSettings({ enabled: !enabled });
    setEnabled(next.enabled);
  };

  const sendItem = async (item: ClipItem): Promise<void> => {
    await window.api.clips.send(item.id);
  };

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>{t('clips.title')}</h2>
        <div className="capture-bar">
          <button
            type="button"
            className={enabled ? 'btn' : 'btn btn-primary'}
            onClick={() => void toggleEnabled()}
          >
            {enabled ? t('clips.pause') : t('clips.resume')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void window.api.clips.syncNow().then(() => refresh())}
            title={t('clips.syncTooltip')}
          >
            <Icon name="restore" />
            {t('clips.sync')}
          </button>
        </div>
        <div className="capture-hint muted">{t('clips.help')}</div>
      </header>

      <section className="cp-history">
        <div className="gallery-toolbar">
          <input
            type="search"
            className="input clips-search"
            placeholder={t('clips.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="gallery-toolbar-right">
            <button
              type="button"
              className={onlyPinned ? 'btn btn-primary' : 'btn'}
              onClick={() => setOnlyPinned((v) => !v)}
            >
              <Icon name="pin" />
              {t('clips.pinnedFilter')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void window.api.clips.clearUnpinned()}
              title={t('clips.clearTooltip')}
            >
              <Icon name="trash" />
              {t('clips.clear')}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="gallery-empty muted">
            {items.length === 0 ? t('clips.empty') : t('clips.noMatch')}
          </div>
        ) : (
          <div className="clips-list">
            {visible.map((item) => (
              <div key={item.id} className={`clip-row card${item.pinned ? ' pinned' : ''}`}>
                <button
                  type="button"
                  className="clip-main"
                  title={t('clips.copyTooltip')}
                  onClick={() => void window.api.clips.copy(item.id)}
                >
                  {item.kind === 'image' ? (
                    <img className="clip-thumb" src={item.preview} alt="" />
                  ) : (
                    <span className="clip-text">{item.preview}</span>
                  )}
                  <span className="clip-meta muted">
                    {item.source === 'remote' && (
                      <span className="clip-badge" title={t('clips.fromPhone')}>
                        <Icon name="phone" size={12} />
                      </span>
                    )}
                    {timeLabel(item.createdAt)}
                    {item.remoteId && item.source === 'local' && (
                      <span title={t('clips.sentTooltip')}> · ✓</span>
                    )}
                  </span>
                </button>
                <div className="clip-actions">
                  <button
                    type="button"
                    className={`btn btn-icon${item.pinned ? ' active' : ''}`}
                    title={item.pinned ? t('clips.unpin') : t('clips.pin')}
                    onClick={() => void window.api.clips.pin(item.id, !item.pinned)}
                  >
                    <Icon name={item.pinned ? 'starFilled' : 'pin'} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={t('clips.send')}
                    onClick={() => void sendItem(item)}
                  >
                    <Icon name="send" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={t('clips.delete')}
                    onClick={() => void window.api.clips.remove(item.id)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Section Paramètres du module : surveillance, rétention, sync serveur. */
export function ClipboardSettings(): ReactNode {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ClipsSettings | null>(null);

  useEffect(() => {
    void window.api.clips.getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const update = async (patch: Partial<ClipsSettings>): Promise<void> => {
    setSettings(await window.api.clips.setSettings(patch));
  };

  return (
    <>
      <div className="setting-row">
        <span>{t('clips.settings.enabled')}</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void update({ enabled: e.target.checked })}
        />
      </div>
      <div className="setting-row">
        <span>{t('clips.settings.retention')}</span>
        <select
          className="select"
          value={settings.retentionHours}
          onChange={(e) => void update({ retentionHours: Number(e.target.value) })}
        >
          {RETENTION_CHOICES.map((hours) => (
            <option key={hours} value={hours}>
              {retentionLabel(hours, t)}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>{t('clips.settings.sync')}</span>
        <input
          type="checkbox"
          checked={settings.sync}
          onChange={(e) => void update({ sync: e.target.checked })}
        />
      </div>
      <div className="setting-hint muted">{t('clips.settings.hint')}</div>
    </>
  );
}
