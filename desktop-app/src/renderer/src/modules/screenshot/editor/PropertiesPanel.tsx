import type { ReactNode } from 'react';
import { useI18n } from '../../../i18n';
import { ColorField } from './ColorField';
import { FONT_FAMILIES, type AnnoObject, type StyleState, type ToolId } from './model';

interface Props {
  tool: ToolId;
  selected: AnnoObject | null;
  style: StyleState;
  onChange(patch: Partial<StyleState>): void;
}

/** Panneau de propriétés (droite) : agit sur l'objet sélectionné ou sur le
 * style des prochains objets (docs/00 §2.2). */
export function PropertiesPanel({ tool, selected, style, onChange }: Props): ReactNode {
  const { t } = useI18n();

  const target = selected?.type ?? tool;
  const showStroke = target !== 'blur' && target !== 'crop' && target !== 'eraser';
  const showWidth = [
    'rect', 'ellipse', 'triangle', 'line', 'arrow', 'pen', 'highlighter'
  ].includes(target);
  const showFill = ['rect', 'ellipse', 'triangle'].includes(target);
  const showHead = target === 'arrow';
  const showText = target === 'text';
  const showBlur = target === 'blur';
  const showOpacity = target !== 'crop' && target !== 'eraser' && target !== 'blur';

  return (
    <aside className="editor-props">
      <h3>{t('editor.props.title')}</h3>

      {showStroke && (
        <ColorField
          label={t('editor.props.stroke')}
          value={style.stroke}
          onChange={(stroke) => onChange({ stroke })}
        />
      )}

      {showWidth && (
        <SliderRow
          label={t('editor.props.strokeWidth')}
          min={1}
          max={24}
          value={style.strokeWidth}
          onChange={(strokeWidth) => onChange({ strokeWidth })}
        />
      )}

      {showOpacity && (
        <SliderRow
          label={t('editor.props.opacity')}
          min={10}
          max={100}
          value={Math.round(style.opacity * 100)}
          suffix="%"
          onChange={(v) => onChange({ opacity: v / 100 })}
        />
      )}

      {showFill && (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={style.fillOn}
              onChange={(e) => onChange({ fillOn: e.target.checked })}
            />
            <span>{t('editor.props.fill')}</span>
          </label>
          {style.fillOn && (
            <ColorField
              label={t('editor.props.fillColor')}
              value={style.fill}
              onChange={(fill) => onChange({ fill })}
            />
          )}
        </>
      )}

      {showHead && (
        <SliderRow
          label={t('editor.props.headSize')}
          min={4}
          max={40}
          value={style.headSize}
          onChange={(headSize) => onChange({ headSize })}
        />
      )}

      {showText && (
        <>
          <div className="prop-block">
            <div className="prop-label">{t('editor.props.font')}</div>
            <select
              className="select prop-wide"
              value={style.fontFamily}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <SliderRow
            label={t('editor.props.fontSize')}
            min={8}
            max={96}
            value={style.fontSize}
            onChange={(fontSize) => onChange({ fontSize })}
          />
          <div className="prop-block prop-inline">
            <button
              type="button"
              className={`btn text-style-btn${style.bold ? ' btn-primary' : ''}`}
              onClick={() => onChange({ bold: !style.bold })}
            >
              B
            </button>
            <button
              type="button"
              className={`btn text-style-btn italic${style.italic ? ' btn-primary' : ''}`}
              onClick={() => onChange({ italic: !style.italic })}
            >
              I
            </button>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={style.textStrokeOn}
              onChange={(e) => onChange({ textStrokeOn: e.target.checked })}
            />
            <span>{t('editor.props.textStroke')}</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={style.textBackgroundOn}
              onChange={(e) => onChange({ textBackgroundOn: e.target.checked })}
            />
            <span>{t('editor.props.textBackground')}</span>
          </label>
        </>
      )}

      {showBlur && (
        <>
          <div className="prop-block">
            <div className="prop-label">{t('editor.props.blurMode')}</div>
            <select
              className="select prop-wide"
              value={style.blurMode}
              onChange={(e) =>
                onChange({ blurMode: e.target.value as StyleState['blurMode'] })
              }
            >
              <option value="pixelate">{t('editor.props.pixelate')}</option>
              <option value="blur">{t('editor.props.blur')}</option>
            </select>
          </div>
          <SliderRow
            label={t('editor.props.strength')}
            min={4}
            max={40}
            value={style.blurStrength}
            onChange={(blurStrength) => onChange({ blurStrength })}
          />
        </>
      )}

      {selected && (
        <p className="muted prop-hint">{t('editor.props.editingSelection')}</p>
      )}
    </aside>
  );
}

function SliderRow({
  label,
  min,
  max,
  value,
  suffix = 'px',
  onChange
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  onChange(value: number): void;
}): ReactNode {
  return (
    <div className="prop-block">
      <div className="prop-label">
        {label} — {value}
        {suffix}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        className="prop-wide"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
