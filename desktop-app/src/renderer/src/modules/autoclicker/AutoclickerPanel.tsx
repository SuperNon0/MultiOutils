import { useEffect, useState, type ReactNode } from 'react';
import type { AutoclickConfig, AutoclickState } from '../../../../common/types';
import { DEFAULT_AUTOCLICK } from '../../../../common/types';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

/** Construit un accélérateur Electron (« Control+Shift+K », « F6 ») depuis un
 *  évènement clavier. Renvoie null tant qu'aucune touche « réelle » n'est
 *  pressée (modificateur seul) ou si l'on annule avec Échap. */
function accelFromEvent(e: KeyboardEvent): string | null {
  if (e.key === 'Escape') return null;
  const mods = ['Control', 'Alt', 'Shift', 'Meta'];
  if (mods.includes(e.key)) return null; // attendre une vraie touche
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

/** Panneau Autoclic : réglages (intervalle, bouton, répétition, raccourci) et
 *  grand bouton Démarrer / Arrêter avec compteur en direct. */
export function AutoclickerPanel(): ReactNode {
  const { t } = useI18n();
  const [config, setConfigState] = useState<AutoclickConfig>(DEFAULT_AUTOCLICK);
  const [state, setState] = useState<AutoclickState>({
    running: false,
    remaining: null,
    done: 0,
    available: true
  });
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    void window.api.autoclicker.getConfig().then(setConfigState);
    void window.api.autoclicker.getState().then(setState);
    return window.api.autoclicker.onState(setState);
  }, []);

  // Capture du raccourci : écoute la prochaine frappe puis l'enregistre.
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
        update({ shortcut: accel });
        setCapturing(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const update = (patch: Partial<AutoclickConfig>): void => {
    setConfigState((prev) => ({ ...prev, ...patch }));
    void window.api.autoclicker.setConfig(patch);
  };

  const num = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>{t('autoclick.title')}</h2>

        <div className="ac-controls">
          <button
            type="button"
            className={`btn ${state.running ? 'ac-stop' : 'btn-primary'} ac-toggle`}
            disabled={!state.available}
            onClick={() => void window.api.autoclicker.toggle()}
          >
            <Icon name={state.running ? 'close' : 'cursor'} />
            {state.running ? t('autoclick.stop') : t('autoclick.start')}
            {config.shortcut && <span className="ac-kbd">{config.shortcut}</span>}
          </button>
          {state.running && (
            <span className="ac-live">
              {t('autoclick.liveDone', { n: state.done })}
              {state.remaining !== null &&
                ` · ${t('autoclick.liveRemaining', { n: state.remaining })}`}
            </span>
          )}
        </div>

        {!state.available && <div className="ac-warn">{t('autoclick.unavailable')}</div>}
        <div className="capture-hint muted">{t('autoclick.help')}</div>
      </header>

      <section className="ac-form">
        {/* Intervalle entre les clics */}
        <div className="setting-row">
          <span>{t('autoclick.interval')}</span>
          <div className="ac-interval">
            {(['hours', 'minutes', 'seconds', 'milliseconds'] as const).map((k) => (
              <label key={k} className="ac-num">
                <input
                  type="number"
                  min={0}
                  value={config[k]}
                  onChange={(e) => update({ [k]: num(e.target.value) })}
                />
                <span className="muted">{t(`autoclick.unit.${k}`)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Bouton de la souris */}
        <div className="setting-row">
          <span>{t('autoclick.button')}</span>
          <select
            className="select"
            value={config.button}
            onChange={(e) =>
              update({ button: e.target.value as AutoclickConfig['button'] })
            }
          >
            <option value="left">{t('autoclick.btn.left')}</option>
            <option value="right">{t('autoclick.btn.right')}</option>
            <option value="middle">{t('autoclick.btn.middle')}</option>
          </select>
        </div>

        {/* Type de clic */}
        <div className="setting-row">
          <span>{t('autoclick.clickType')}</span>
          <select
            className="select"
            value={config.clickType}
            onChange={(e) =>
              update({ clickType: e.target.value as AutoclickConfig['clickType'] })
            }
          >
            <option value="single">{t('autoclick.click.single')}</option>
            <option value="double">{t('autoclick.click.double')}</option>
          </select>
        </div>

        {/* Répétition */}
        <div className="setting-row">
          <span>{t('autoclick.repeat')}</span>
          <div className="ac-repeat">
            <select
              className="select"
              value={config.repeat}
              onChange={(e) =>
                update({ repeat: e.target.value as AutoclickConfig['repeat'] })
              }
            >
              <option value="infinite">{t('autoclick.repeat.infinite')}</option>
              <option value="count">{t('autoclick.repeat.count')}</option>
            </select>
            {config.repeat === 'count' && (
              <label className="ac-num">
                <input
                  type="number"
                  min={1}
                  value={config.repeatCount}
                  onChange={(e) =>
                    update({ repeatCount: Math.max(1, num(e.target.value)) })
                  }
                />
                <span className="muted">{t('autoclick.unit.clicks')}</span>
              </label>
            )}
          </div>
        </div>

        {/* Délai avant le premier clic */}
        <div className="setting-row">
          <span>{t('autoclick.startDelay')}</span>
          <label className="ac-num">
            <input
              type="number"
              min={0}
              value={config.startDelayMs}
              onChange={(e) => update({ startDelayMs: num(e.target.value) })}
            />
            <span className="muted">{t('autoclick.unit.milliseconds')}</span>
          </label>
        </div>

        {/* Raccourci global de bascule */}
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
                : config.shortcut || t('autoclick.noShortcut')}
            </button>
            {config.shortcut && !capturing && (
              <button
                type="button"
                className="btn btn-icon"
                title={t('autoclick.clearShortcut')}
                onClick={() => update({ shortcut: '' })}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="capture-hint muted">{t('autoclick.streamdeckHint')}</div>
      </section>
    </div>
  );
}
