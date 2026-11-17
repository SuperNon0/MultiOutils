import { useEffect, useState, type ReactNode } from 'react';
import type { HaEntity, HaWidgetAction } from '../../../../common/desktop';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';
import './widgets.css';

/** Icônes au trait propres à certains capteurs (absentes du sprite encre). */
const SENSOR_GLYPHS: Record<string, ReactNode> = {
  temperature: (
    <>
      <path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  humidity: <path d="M12 3.5c3 3.6 5.5 6.6 5.5 10a5.5 5.5 0 0 1-11 0c0-3.4 2.5-6.4 5.5-10Z" />,
  battery: (
    <>
      <rect x="3" y="7" width="16" height="10" rx="2.5" />
      <path d="M21 10.5v3M6.5 10v4M10 10v4" />
    </>
  )
};

const ONE_SHOT = ['scene', 'script', 'button', 'input_button'];

function EntityIcon({ entity }: { entity: HaEntity }): ReactNode {
  const glyph = entity.deviceClass ? SENSOR_GLYPHS[entity.deviceClass] : undefined;
  if (glyph) {
    return (
      <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
        {glyph}
      </svg>
    );
  }
  const byDomain: Record<string, string> = {
    light: 'sun',
    switch: 'plug',
    input_boolean: 'plug',
    fan: 'refresh',
    media_player: 'play',
    scene: 'sparkle',
    script: 'zap',
    button: 'zap',
    input_button: 'zap',
    lock: 'lock',
    cover: 'layers',
    climate: 'sun',
    binary_sensor: entity.deviceClass === 'door' || entity.deviceClass === 'window' ? 'home' : 'dot'
  };
  return <Icon name={byDomain[entity.domain] ?? 'signal'} size={16} />;
}

function Brightness({ entity, disabled, onChange }: { entity: HaEntity; disabled: boolean; onChange(value: number): void }): ReactNode {
  const { t } = useI18n();
  const [value, setValue] = useState(entity.brightness ?? 0);
  useEffect(() => setValue(entity.brightness ?? 0), [entity.brightness]);
  const commit = (v: number): void => onChange(v);
  return (
    <label className="ha-slider" style={{ '--v': `${value}%` } as React.CSSProperties}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={t('desktop.ha.brightness')}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            commit(Number(e.currentTarget.value));
          }
        }}
      />
      <span className="ha-slider-v">{value} %</span>
    </label>
  );
}

/**
 * Appareils Home Assistant d'une zone du Bureau : tuiles (2 colonnes) ou
 * liste compacte. Même balisage pour les deux dispositions ; seule la grille
 * change (voir widgets.css).
 */
export function HaCards({
  entities,
  layout,
  readOnly = false,
  preview = false,
  onRefresh
}: {
  entities: HaEntity[];
  layout: 'cards' | 'compact';
  readOnly?: boolean;
  preview?: boolean;
  onRefresh?(): Promise<void>;
}): ReactNode {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const numberFormat = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 });

  const act = async (entity: HaEntity, action?: HaWidgetAction, value?: number): Promise<void> => {
    if (preview || readOnly || busy.has(entity.id)) return;
    setBusy((old) => new Set(old).add(entity.id));
    setError(null);
    try {
      const ok = action
        ? (await window.api.ha.control(entity.id, action, value)).ok
        : await window.api.ha.toggle(entity.id);
      if (!ok) throw new Error('control');
      await onRefresh?.();
    } catch {
      setError(t('desktop.ha.controlError'));
    } finally {
      setBusy((old) => {
        const next = new Set(old);
        next.delete(entity.id);
        return next;
      });
    }
  };

  return (
    <div className={`ha-list ${layout}`} onPointerDown={(e) => e.stopPropagation()}>
      {entities.map((entity) => {
        const unavailable = ['unknown', 'unavailable'].includes(entity.state);
        const sensor = entity.domain === 'sensor';
        const binary = entity.domain === 'binary_sensor';
        const media = entity.domain === 'media_player';
        const oneShot = ONE_SHOT.includes(entity.domain);
        const disabled = preview || readOnly || busy.has(entity.id) || unavailable;
        const number = sensor && !unavailable && entity.state.trim() !== '' ? Number(entity.state) : NaN;
        const numeric = Number.isFinite(number);

        let stateText: string;
        if (unavailable) stateText = t('desktop.ha.unavailable');
        else if (binary) stateText = t(entity.on ? 'desktop.ha.detected' : 'desktop.ha.clear');
        else if (sensor) stateText = numeric ? '' : entity.state;
        else if (media) {
          stateText = entity.mediaTitle
            ? [entity.mediaTitle, entity.mediaArtist].filter(Boolean).join(' · ')
            : t(entity.state === 'playing' ? 'desktop.ha.playing' : entity.state === 'paused' ? 'desktop.ha.paused' : 'desktop.ha.media');
        } else if (oneShot) stateText = t('desktop.ha.ready');
        else {
          stateText = t(entity.on ? 'desktop.ha.isOn' : 'desktop.ha.isOff');
        }

        let end: ReactNode = null;
        if (sensor && numeric) {
          end = (
            <span className="ha-value">
              {numberFormat.format(number)}
              {entity.unit && <small>{entity.unit}</small>}
            </span>
          );
        } else if (oneShot) {
          end = (
            <button type="button" className="ha-run" disabled={disabled} onClick={() => void act(entity)}>
              <Icon name="play" size={12} />
              {t('desktop.ha.run')}
            </button>
          );
        } else if (!sensor && !binary && !(media && entity.mediaControls?.playPause)) {
          end = (
            <input
              type="checkbox"
              className="sw"
              checked={entity.on}
              disabled={disabled}
              aria-label={entity.name}
              onChange={() => void act(entity)}
            />
          );
        }

        const controls = entity.mediaControls;
        return (
          <article
            key={entity.id}
            title={entity.id}
            className={`ha-tile${entity.on ? ' on' : ''}${sensor || binary ? ' sensor' : ''}${unavailable ? ' unavailable' : ''}`}
          >
            <span className="ha-ico">
              <EntityIcon entity={entity} />
            </span>
            <span className="ha-txt">
              <b>{entity.name}</b>
              {stateText && <span>{stateText}</span>}
            </span>
            {end && <span className="ha-end">{end}</span>}
            {entity.supportsBrightness && (entity.brightness !== undefined || !entity.on) && (
              <Brightness entity={entity} disabled={disabled} onChange={(value) => void act(entity, 'brightness', value)} />
            )}
            {sensor && numeric && entity.unit === '%' && number >= 0 && number <= 100 && (
              <span className="ha-gauge" style={{ '--v': `${number}%` } as React.CSSProperties} aria-hidden="true" />
            )}
            {media && controls && (controls.previous || controls.playPause || controls.next) && (
              <span className="ha-media">
                {controls.previous && (
                  <button type="button" disabled={disabled} aria-label={t('desktop.ha.previous')} onClick={() => void act(entity, 'previous')}>
                    <Icon name="chevl" size={16} />
                  </button>
                )}
                {controls.playPause && (
                  <button
                    type="button"
                    className="pp"
                    disabled={disabled}
                    aria-label={t('desktop.ha.playPause')}
                    onClick={() => void act(entity, 'playPause')}
                  >
                    {entity.state === 'playing' ? (
                      <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 6.5v11M15 6.5v11" />
                      </svg>
                    ) : (
                      <Icon name="play" size={15} />
                    )}
                  </button>
                )}
                {controls.next && (
                  <button type="button" disabled={disabled} aria-label={t('desktop.ha.next')} onClick={() => void act(entity, 'next')}>
                    <Icon name="chev" size={16} />
                  </button>
                )}
              </span>
            )}
          </article>
        );
      })}
      {error && (
        <p className="ha-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
