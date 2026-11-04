import type { ReactNode } from 'react';

/**
 * Petites briques « encre » pour écrire un réglage (utilisées par l'hôte et
 * par les settingsPanel() des modules) : une ligne `reg-l` avec son titre, son
 * explication et son contrôle à droite ; une section `reg-sec`.
 */
export function RegLigne({
  titre,
  sous,
  children,
  htmlFor,
  className = ''
}: {
  titre: ReactNode;
  sous?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
  className?: string;
}): ReactNode {
  const Tag = htmlFor ? 'label' : 'div';
  return (
    <Tag className={`reg-l${className ? ` ${className}` : ''}`} htmlFor={htmlFor}>
      <span className="tx">
        <b>{titre}</b>
        {sous && <span>{sous}</span>}
      </span>
      {children}
    </Tag>
  );
}

/** Interrupteur du kit (`<input type="checkbox" class="sw">`) dans une ligne. */
export function RegSwitch({
  titre,
  sous,
  checked,
  disabled,
  onChange
}: {
  titre: ReactNode;
  sous?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}): ReactNode {
  return (
    <label className={`reg-l${disabled ? ' off' : ''}`}>
      <span className="tx">
        <b>{titre}</b>
        {sous && <span>{sous}</span>}
      </span>
      <input
        type="checkbox"
        className="sw"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function RegSec({ titre, children }: { titre?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="reg-sec">
      {titre && <div className="lbl-mono">{titre}</div>}
      <div className="reg-lignes">{children}</div>
    </div>
  );
}
