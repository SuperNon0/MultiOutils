import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../../../i18n';
import { PALETTE } from './model';

const RECENT_KEY = 'multioutils.editor.recentColors';

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecentColor(color: string): void {
  const list = [color, ...readRecents().filter((c) => c !== color)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/** Couleur : palette + sélecteur natif + valeurs récentes (docs/00 §2.2). */
export function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange(color: string): void;
}): ReactNode {
  const { t } = useI18n();
  const [recents, setRecents] = useState<string[]>(readRecents);

  useEffect(() => {
    setRecents(readRecents());
  }, [value]);

  const pick = (color: string): void => {
    pushRecentColor(color);
    onChange(color);
  };

  return (
    <div className="prop-block">
      <div className="prop-label">{label}</div>
      <div className="color-row">
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch${value === color ? ' active' : ''}`}
            style={{ background: color }}
            aria-label={color}
            onClick={() => pick(color)}
          />
        ))}
        <input
          type="color"
          className="color-input"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#e8c547'}
          onChange={(e) => pick(e.target.value)}
          aria-label={label}
        />
      </div>
      {recents.length > 0 && (
        <div className="color-row color-recents">
          <span className="prop-mini muted">{t('editor.props.recent')}</span>
          {recents.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-swatch small${value === color ? ' active' : ''}`}
              style={{ background: color }}
              aria-label={color}
              onClick={() => pick(color)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
