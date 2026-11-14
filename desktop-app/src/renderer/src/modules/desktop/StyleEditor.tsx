import type { ReactNode } from 'react';
import type { SavedStyle, ZoneStyle } from '../../../../common/desktop';
import { ui } from '../../encre/ui';
import { Icon } from '../../host/Icon';
import { RegLigne, RegSwitch } from '../../host/reglages';
import { useI18n } from '../../i18n';
import { EncreColorPicker } from './EncreColorPicker';

type ColorField = 'bg' | 'titleColor' | 'iconTint';

/** Éditeur commun aux zones, utilisant la palette native Encre. */
function ColorPick({ value, fallbackLabel, onChange, onPick, label }: {
  value: string | null;
  fallbackLabel: string;
  onChange(v: string | null): void;
  onPick(): void;
  label: string;
}): ReactNode {
  return <EncreColorPicker value={value} label={label} onChange={onChange} onPick={onPick} onReset={() => onChange(null)} resetLabel={fallbackLabel} />;
}

/** Nombre au curseur, avec la valeur aussi saisissable au clavier (h1). */
function Slider({ id, value, min, max, step, unit, onChange }: { id: string; value: number; min: number; max: number; step: number; unit: string; onChange(v: number): void }): ReactNode {
  return (
    <span className="bs-slider">
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <label className="champ bs-num">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        <span className="muted petit">{unit}</span>
      </label>
    </span>
  );
}

/**
 * Apparence d'une zone ou des zones par défaut.
 * `value` = ce qui est choisi, `full` = le rendu effectif (défauts compris).
 */
export function StyleEditor({
  idPrefix,
  full,
  saved,
  onChange,
  onPick,
  onReset,
  onSaveStyle
}: {
  idPrefix: string;
  full: ZoneStyle & { opacity: number };
  saved: SavedStyle[];
  onChange(patch: Partial<ZoneStyle>): void;
  onPick(field: ColorField): void;
  onReset(): void;
  onSaveStyle(): void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className="bs">
      <RegLigne titre={t('desktop.style.bg')} sous={t('desktop.style.bgSub')}>
        <ColorPick label={t('desktop.style.bg')} value={full.bg} fallbackLabel={t('desktop.style.theme')} onChange={(bg) => onChange({ bg })} onPick={() => onPick('bg')} />
      </RegLigne>
      <RegLigne titre={t('desktop.set.opacity')} htmlFor={`${idPrefix}-op`}>
        <Slider id={`${idPrefix}-op`} value={full.opacity} min={0} max={100} step={1} unit="%" onChange={(opacity) => onChange({ opacity })} />
      </RegLigne>
      <RegSwitch titre={t('desktop.style.invisible')} sous={t('desktop.style.invisibleSub')} checked={full.invisible} onChange={(invisible) => onChange({ invisible })} />
      <RegLigne titre={t('desktop.style.radius')} htmlFor={`${idPrefix}-r`}>
        <Slider id={`${idPrefix}-r`} value={full.radius} min={0} max={24} step={1} unit="px" onChange={(radius) => onChange({ radius })} />
      </RegLigne>
      <RegLigne titre={t('desktop.style.titleBar')}>
        <div className="seg">
          {(['visible', 'hover', 'hidden'] as const).map((v) => (
            <button key={v} className={full.titleBar === v ? 'on' : ''} onClick={() => onChange({ titleBar: v })}>
              {t(`desktop.style.titleBar.${v}`)}
            </button>
          ))}
        </div>
      </RegLigne>
      {full.titleBar === 'hidden' && <p className="muted petit bs-note">{t('desktop.style.altMove')}</p>}
      <RegLigne titre={t('desktop.style.titleLook')}>
        <div className="seg">
          {(['flat', 'bold'] as const).map((v) => (
            <button key={v} className={full.titleLook === v ? 'on' : ''} onClick={() => onChange({ titleLook: v })}>
              {t(`desktop.style.titleLook.${v}`)}
            </button>
          ))}
        </div>
      </RegLigne>
      <RegLigne titre={t('desktop.style.titleFont')} htmlFor={`${idPrefix}-f`}>
        <select id={`${idPrefix}-f`} className="select sm" style={{ width: 140 }} value={full.titleFont} onChange={(e) => onChange({ titleFont: e.target.value as ZoneStyle['titleFont'] })}>
          {(['ui', 'mono', 'serif'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`desktop.style.font.${v}`)}
            </option>
          ))}
        </select>
      </RegLigne>
      <RegLigne titre={t('desktop.style.titleSize')} htmlFor={`${idPrefix}-ts`}>
        <Slider id={`${idPrefix}-ts`} value={full.titleSize} min={10} max={22} step={0.5} unit="px" onChange={(titleSize) => onChange({ titleSize })} />
      </RegLigne>
      <RegLigne titre={t('desktop.style.titleColor')}>
        <ColorPick
          label={t('desktop.style.titleColor')}
          value={full.titleColor}
          fallbackLabel={t('desktop.style.theme')}
          onChange={(titleColor) => onChange({ titleColor })}
          onPick={() => onPick('titleColor')}
        />
      </RegLigne>
      <RegLigne titre={t('desktop.style.iconTint')} sous={t('desktop.style.iconTintSub')}>
        <ColorPick
          label={t('desktop.style.iconTint')}
          value={full.iconTint}
          fallbackLabel={t('desktop.style.none')}
          onChange={(iconTint) => onChange({ iconTint })}
          onPick={() => onPick('iconTint')}
        />
      </RegLigne>
      <RegSwitch titre={t('desktop.style.iconFade')} sous={t('desktop.style.iconFadeSub')} checked={full.iconFade} onChange={(iconFade) => onChange({ iconFade })} />
      <RegSwitch titre={t('desktop.style.stripe')} sous={t('desktop.style.stripeSub')} checked={full.stripe} onChange={(stripe) => onChange({ stripe })} />
      <div className="bs-act">
        {saved.length > 0 && (
          <select
            className="select sm"
            aria-label={t('desktop.style.apply')}
            value=""
            onChange={(e) => {
              const s = saved.find((o) => o.id === e.target.value);
              if (s) onChange(s.style);
            }}
          >
            <option value="">{t('desktop.style.apply')}</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn sm" onClick={onSaveStyle}>
          <Icon name="bookmark" size={16} />
          {t('desktop.style.save')}
        </button>
        <button
          className="btn sm gh"
          onClick={async () => {
            if (await ui.confirmer(t('desktop.style.resetConfirm'), { ok: t('desktop.style.reset') })) onReset();
          }}
        >
          <Icon name="undo" size={16} />
          {t('desktop.style.reset')}
        </button>
      </div>
    </div>
  );
}
