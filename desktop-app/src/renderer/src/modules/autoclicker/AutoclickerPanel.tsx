import { useEffect, useState, type ReactNode } from 'react';
import type {
  AutoclickProfile,
  AutoclickState,
  AutoclickStore
} from '../../../../common/types';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

/** Construit un accélérateur Electron (« Control+Shift+K », « F6 ») depuis un
 *  évènement clavier, ou null (modificateur seul / Échap). */
function accelFromEvent(e: KeyboardEvent): string | null {
  if (e.key === 'Escape') return null;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (/^Arrow/.test(key)) key = key.replace('Arrow', '');
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

const EMPTY_STORE: AutoclickStore = { profiles: [], selectedId: null, shortcut: 'F6' };

/** Panneau Autoclic : profils configurables (liste + éditeur), gros bouton
 *  Démarrer / Arrêter avec compteur en direct, raccourci global. */
export function AutoclickerPanel(): ReactNode {
  const { t } = useI18n();
  const [store, setStore] = useState<AutoclickStore>(EMPTY_STORE);
  const [state, setState] = useState<AutoclickState>({
    runningProfileId: null,
    remaining: null,
    done: 0,
    available: true
  });
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    void window.api.autoclicker.getStore().then(setStore);
    void window.api.autoclicker.getState().then(setState);
    const offStore = window.api.autoclicker.onStore(setStore);
    const offState = window.api.autoclicker.onState(setState);
    return () => {
      offStore();
      offState();
    };
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const accel = accelFromEvent(e);
      if (accel) {
        void window.api.autoclicker.setShortcut(accel).then(setStore);
        setCapturing(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  const selected =
    store.profiles.find((p) => p.id === store.selectedId) ?? store.profiles[0] ?? null;
  const running = selected != null && state.runningProfileId === selected.id;

  const num = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  // Mise à jour optimiste d'un champ du profil sélectionné.
  const patchSelected = (patch: Partial<AutoclickProfile>): void => {
    if (!selected) return;
    setStore((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === selected.id ? { ...p, ...patch } : p))
    }));
    void window.api.autoclicker.updateProfile(selected.id, patch);
  };

  const summary = (p: AutoclickProfile): string => {
    const bits: string[] = [];
    const ms = p.hours * 3600000 + p.minutes * 60000 + p.seconds * 1000 + p.milliseconds;
    bits.push(ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 ? 2 : 0)} s` : `${ms} ms`);
    bits.push(t(`autoclick.btn.${p.button}`));
    if (p.clickType === 'double') bits.push(t('autoclick.click.double'));
    bits.push(p.repeat === 'infinite' ? '∞' : `×${p.repeatCount}`);
    return bits.join(' · ');
  };

  return (
    <div className="panel ac-panel">
      <header className="panel-header">
        <h2>{t('autoclick.title')}</h2>
        {!state.available && <div className="ac-warn">{t('autoclick.unavailable')}</div>}
        <div className="capture-hint muted">{t('autoclick.help')}</div>
      </header>

      <div className="ac-layout">
        {/* ── Colonne profils ─────────────────────────────────────────── */}
        <aside className="ac-profiles">
          <div className="ac-profiles-head">
            <span className="ac-profiles-title">{t('autoclick.profiles')}</span>
            <button
              type="button"
              className="btn btn-icon"
              title={t('autoclick.newProfile')}
              aria-label={t('autoclick.newProfile')}
              onClick={() =>
                void window.api.autoclicker.createProfile().then((r) => setStore(r.store))
              }
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div className="ac-profile-list">
            {store.profiles.map((p) => {
              const isRunning = state.runningProfileId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`ac-profile-card card${p.id === selected?.id ? ' active' : ''}`}
                  onClick={() => void window.api.autoclicker.setSelected(p.id).then(setStore)}
                >
                  <span className={`ac-dot${isRunning ? ' on' : ''}`} />
                  <span className="ac-profile-text">
                    <span className="ac-profile-name">{p.name}</span>
                    <span className="ac-profile-sub muted">{summary(p)}</span>
                  </span>
                  {isRunning && <span className="ac-badge">{t('autoclick.on')}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Éditeur du profil sélectionné ───────────────────────────── */}
        {selected && (
          <section className="ac-editor">
            <div className="ac-editor-top">
              <input
                className="input ac-name"
                value={selected.name}
                aria-label={t('autoclick.name')}
                onChange={(e) => patchSelected({ name: e.target.value })}
              />
              <div className="ac-editor-actions">
                <button
                  type="button"
                  className="btn btn-icon"
                  title={t('autoclick.duplicate')}
                  aria-label={t('autoclick.duplicate')}
                  onClick={() =>
                    void window.api.autoclicker
                      .duplicateProfile(selected.id)
                      .then((r) => setStore(r.store))
                  }
                >
                  <Icon name="copy" size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon ac-del"
                  title={t('autoclick.delete')}
                  aria-label={t('autoclick.delete')}
                  disabled={store.profiles.length <= 1}
                  onClick={() =>
                    void window.api.autoclicker.deleteProfile(selected.id).then(setStore)
                  }
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>

            <div className="ac-run">
              <button
                type="button"
                className={`btn ${running ? 'ac-stop' : 'btn-primary'} ac-toggle`}
                disabled={!state.available}
                onClick={() => void window.api.autoclicker.toggle(selected.id)}
              >
                <Icon name={running ? 'close' : 'cursor'} />
                {running ? t('autoclick.stop') : t('autoclick.start')}
                {store.shortcut && <span className="ac-kbd">{store.shortcut}</span>}
              </button>
              {running && (
                <span className="ac-live">
                  {t('autoclick.liveDone', { n: state.done })}
                  {state.remaining !== null &&
                    ` · ${t('autoclick.liveRemaining', { n: state.remaining })}`}
                </span>
              )}
            </div>

            <div className="ac-form">
              <div className="setting-row">
                <span>{t('autoclick.interval')}</span>
                <div className="ac-interval">
                  {(['hours', 'minutes', 'seconds', 'milliseconds'] as const).map((k) => (
                    <label key={k} className="ac-num">
                      <input
                        type="number"
                        min={0}
                        value={selected[k]}
                        onChange={(e) => patchSelected({ [k]: num(e.target.value) })}
                      />
                      <span className="muted">{t(`autoclick.unit.${k}`)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="setting-row">
                <span>{t('autoclick.button')}</span>
                <select
                  className="select"
                  value={selected.button}
                  onChange={(e) =>
                    patchSelected({ button: e.target.value as AutoclickProfile['button'] })
                  }
                >
                  <option value="left">{t('autoclick.btn.left')}</option>
                  <option value="right">{t('autoclick.btn.right')}</option>
                  <option value="middle">{t('autoclick.btn.middle')}</option>
                </select>
              </div>

              <div className="setting-row">
                <span>{t('autoclick.clickType')}</span>
                <select
                  className="select"
                  value={selected.clickType}
                  onChange={(e) =>
                    patchSelected({
                      clickType: e.target.value as AutoclickProfile['clickType']
                    })
                  }
                >
                  <option value="single">{t('autoclick.click.single')}</option>
                  <option value="double">{t('autoclick.click.double')}</option>
                </select>
              </div>

              <div className="setting-row">
                <span>{t('autoclick.repeat')}</span>
                <div className="ac-repeat">
                  <select
                    className="select"
                    value={selected.repeat}
                    onChange={(e) =>
                      patchSelected({ repeat: e.target.value as AutoclickProfile['repeat'] })
                    }
                  >
                    <option value="infinite">{t('autoclick.repeat.infinite')}</option>
                    <option value="count">{t('autoclick.repeat.count')}</option>
                  </select>
                  {selected.repeat === 'count' && (
                    <label className="ac-num">
                      <input
                        type="number"
                        min={1}
                        value={selected.repeatCount}
                        onChange={(e) =>
                          patchSelected({ repeatCount: Math.max(1, num(e.target.value)) })
                        }
                      />
                      <span className="muted">{t('autoclick.unit.clicks')}</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="setting-row">
                <span>{t('autoclick.startDelay')}</span>
                <label className="ac-num">
                  <input
                    type="number"
                    min={0}
                    value={selected.startDelayMs}
                    onChange={(e) => patchSelected({ startDelayMs: num(e.target.value) })}
                  />
                  <span className="muted">{t('autoclick.unit.milliseconds')}</span>
                </label>
              </div>

              <div className="setting-row">
                <span>{t('autoclick.shortcut')}</span>
                <div className="ac-repeat">
                  <button
                    type="button"
                    className={`btn ac-shortcut${capturing ? ' ac-capturing' : ''}`}
                    onClick={() => setCapturing((c) => !c)}
                  >
                    {capturing
                      ? t('autoclick.press')
                      : store.shortcut || t('autoclick.noShortcut')}
                  </button>
                  {store.shortcut && !capturing && (
                    <button
                      type="button"
                      className="btn btn-icon"
                      title={t('autoclick.clearShortcut')}
                      onClick={() => void window.api.autoclicker.setShortcut('').then(setStore)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="capture-hint muted">{t('autoclick.streamdeckHint')}</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
