/**
 * Fonctions pures de l'interface du lanceur (testées) : surlignage des
 * correspondances, navigation circulaire, affichage des raccourcis.
 */
export interface Segment {
  text: string;
  hl: boolean;
}

/** Découpe un texte en morceaux surlignés / normaux d'après les indices du moteur. */
export function splitHighlight(text: string, indices: number[] | undefined): Segment[] {
  if (!text) return [];
  if (!indices || indices.length === 0) return [{ text, hl: false }];
  const marks = new Set(indices.filter((i) => i >= 0 && i < text.length));
  const out: Segment[] = [];
  let cur = '';
  let curHl = marks.has(0);
  for (let i = 0; i < text.length; i++) {
    const hl = marks.has(i);
    if (hl !== curHl && cur) {
      out.push({ text: cur, hl: curHl });
      cur = '';
    }
    curHl = hl;
    cur += text[i];
  }
  if (cur) out.push({ text: cur, hl: curHl });
  return out;
}

/** Index suivant/précédent avec retour au début (navigation ↑↓ Tab). */
export function cycleIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}

/** Affichage lisible d'un accélérateur Electron (« Alt+Space » → « Alt Espace »). */
export function formatAccelerator(acc: string, lang: 'fr' | 'en' = 'fr'): string {
  if (!acc) return '';
  const fr: Record<string, string> = {
    CommandOrControl: 'Ctrl',
    CmdOrCtrl: 'Ctrl',
    Control: 'Ctrl',
    Space: 'Espace',
    Shift: 'Maj',
    Return: 'Entrée',
    Esc: 'Échap',
    Super: 'Win'
  };
  const en: Record<string, string> = { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl', Super: 'Win' };
  const map = lang === 'en' ? en : fr;
  return acc
    .split('+')
    .map((k) => map[k] ?? k)
    .join(' ');
}
