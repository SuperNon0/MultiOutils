import { useEffect, useState, type ReactNode } from 'react';
import type { HaEntity, HaWidgetAction } from '../../../../common/desktop';
import { Icon } from '../../host/Icon';
import { useI18n } from '../../i18n';

function EntityIcon({ entity }: { entity: HaEntity }): ReactNode {
  if (entity.deviceClass === 'temperature') return <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z"/><path d="M12 8v10"/></svg>;
  return <Icon name={entity.domain === 'light' ? 'sun' : entity.domain === 'media_player' ? 'play' : entity.domain === 'sensor' ? 'signal' : 'zap'} size={16}/>;
}

function Brightness({ entity, disabled, onChange }: { entity: HaEntity; disabled: boolean; onChange(value: number): void }): ReactNode {
  const { t } = useI18n();
  const [value, setValue] = useState(entity.brightness ?? 0);
  useEffect(() => setValue(entity.brightness ?? 0), [entity.brightness]);
  return <label className="ha-brightness"><span>{t('desktop.ha.brightness')}<b>{value} %</b></span>
    <input type="range" min={0} max={100} step={1} value={value} disabled={disabled} aria-label={t('desktop.ha.brightness')}
      onChange={(e) => setValue(Number(e.target.value))}
      onPointerUp={(e) => onChange(Number(e.currentTarget.value))}
      onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) onChange(Number(e.currentTarget.value)); }}/>
  </label>;
}

export function HaCards({ entities, layout, readOnly = false, preview = false, onRefresh }: {
  entities: HaEntity[]; layout: 'cards' | 'compact'; readOnly?: boolean; preview?: boolean; onRefresh?(): Promise<void>;
}): ReactNode {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const act = async (entity: HaEntity, action?: HaWidgetAction, value?: number): Promise<void> => {
    if (preview || readOnly || busy.has(entity.id)) return;
    setBusy((old) => new Set(old).add(entity.id)); setError(null);
    try {
      const ok = action ? (await window.api.ha.control(entity.id, action, value)).ok : await window.api.ha.toggle(entity.id);
      if (!ok) throw new Error('control');
      await onRefresh?.();
    } catch { setError(t('desktop.ha.controlError')); }
    finally { setBusy((old) => { const next = new Set(old); next.delete(entity.id); return next; }); }
  };
  return <div className={`ha-cards ${layout}`} onPointerDown={(e) => e.stopPropagation()}>
    {entities.map((entity) => {
      const sensor = ['sensor', 'binary_sensor'].includes(entity.domain);
      const unavailable = ['unknown', 'unavailable'].includes(entity.state);
      const number = !unavailable && entity.state.trim() !== '' ? Number(entity.state) : NaN;
      const numeric = Number.isFinite(number);
      const text = unavailable ? '—' : numeric ? new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 2 }).format(number) : entity.state;
      const disabled = preview || readOnly || busy.has(entity.id) || unavailable;
      const oneShot = ['scene', 'script', 'button', 'input_button'].includes(entity.domain);
      return <article className={`ha-card${entity.on ? ' on' : ''}${sensor ? ' sensor' : ''}${unavailable ? ' unavailable' : ''}`} key={entity.id} title={entity.id}>
        <div className="ha-card-head"><strong>{entity.name}</strong><EntityIcon entity={entity}/></div>
        {sensor ? <>
          <div className="ha-card-value">{text}{entity.unit && <span> {entity.unit}</span>}</div>
          {entity.unit === '%' && numeric && number >= 0 && number <= 100 && <progress value={number} max={100} aria-label={entity.name}/>}
          <div className="ha-card-caption">{unavailable ? t('desktop.ha.unavailable') : entity.deviceClass ? t('desktop.ha.live') : entity.id.split('.')[1]?.replace(/_/g, ' ')}</div>
        </> : entity.domain === 'media_player' ? <>
          <div className="ha-card-caption">{entity.mediaTitle ?? (entity.state === 'playing' ? t('desktop.ha.playing') : t('desktop.ha.media'))}</div>
          {entity.mediaArtist && <div className="ha-card-caption">{entity.mediaArtist}</div>}
          <div className="ha-media-actions">
            {entity.mediaControls?.previous && <button className="ha-media-button" disabled={disabled} aria-label={t('desktop.ha.previous')} onClick={() => void act(entity, 'previous')}><Icon name="chevl" size={18}/></button>}
            {entity.mediaControls?.playPause && <button className="ha-media-button main" disabled={disabled} aria-label={t('desktop.ha.playPause')} onClick={() => void act(entity, 'playPause')}>
              {entity.state === 'playing' ? <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" strokeWidth="3"/></svg> : <Icon name="play" size={19}/>}
            </button>}
            {entity.mediaControls?.next && <button className="ha-media-button" disabled={disabled} aria-label={t('desktop.ha.next')} onClick={() => void act(entity, 'next')}><Icon name="chev" size={18}/></button>}
          </div>
          {!entity.mediaControls?.playPause && !entity.mediaControls?.previous && !entity.mediaControls?.next &&
            <button className="ha-state-button" disabled={disabled} onClick={() => void act(entity)}>{t(entity.on ? 'desktop.ha.off' : 'desktop.ha.on')}</button>}
        </> : <>
          <div className="ha-card-state"><span>{unavailable ? t('desktop.ha.unavailable') : oneShot ? t('desktop.ha.ready') : t(entity.on ? 'desktop.ha.isOn' : 'desktop.ha.isOff')}</span>
            <button className={`ha-state-button${entity.on ? ' on' : ''}`} disabled={disabled} aria-pressed={!oneShot && entity.on}
              aria-label={entity.name} onClick={() => void act(entity)}>{t(oneShot ? 'desktop.ha.run' : entity.on ? 'desktop.ha.on' : 'desktop.ha.off')}</button></div>
          {entity.supportsBrightness && (entity.brightness !== undefined || !entity.on) && <Brightness entity={entity} disabled={disabled} onChange={(value) => void act(entity, 'brightness', value)}/>}
        </>}
      </article>;
    })}
    {error && <p className="ha-control-error" role="status">{error}</p>}
  </div>;
}
