import type { Language } from '../../../common/types';

/** Affichage lisible d'un accélérateur Electron. */
export function displayAccelerator(accelerator: string, lang: Language): string {
  return accelerator
    .replace(/CommandOrControl|CmdOrCtrl/g, 'Ctrl')
    .replace(/PrintScreen/g, lang === 'fr' ? 'Impr. écran' : 'PrtScn');
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDate(iso: string, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
