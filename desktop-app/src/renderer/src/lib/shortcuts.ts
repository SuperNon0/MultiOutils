/** Conversion d'un KeyboardEvent en accélérateur Electron. */

const SPECIAL_KEYS: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Escape: 'Esc',
  '+': 'Plus',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  PrintScreen: 'PrintScreen'
};

/** Touches autorisées SANS modificateur (comme les outils de capture usuels). */
const STANDALONE = /^(F([1-9]|1[0-9]|2[0-4])|PrintScreen)$/;

export function eventToAccelerator(event: KeyboardEvent): string | null {
  const { key, code } = event;
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(key)) return null;

  let main: string | null = null;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    main = key;
  } else if (SPECIAL_KEYS[key]) {
    main = SPECIAL_KEYS[key];
  } else if (/^Key[A-Z]$/.test(code)) {
    main = code.slice(3); // indépendant de la disposition clavier
  } else if (/^Digit[0-9]$/.test(code)) {
    main = code.slice(5);
  } else if (/^Numpad[0-9]$/.test(code)) {
    main = `num${code.slice(6)}`;
  } else if (key.length === 1) {
    main = key.toUpperCase();
  }
  if (!main) return null;

  const mods: string[] = [];
  if (event.ctrlKey) mods.push('CommandOrControl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  if (event.metaKey) mods.push('Super');

  // Une lettre seule en raccourci global rendrait le clavier inutilisable.
  if (mods.length === 0 && !STANDALONE.test(main)) return null;

  return [...mods, main].join('+');
}
