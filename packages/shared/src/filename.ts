/**
 * Construction du nom de fichier d'une capture à partir d'un modèle.
 * Variables supportées (docs/00 §1.3) : {date}, {time}, {counter}, {app}.
 * Modèle par défaut → `Capture_AAAA-MM-JJ_HH-MM-SS` (docs/00 §1.1).
 */

export const DEFAULT_FILENAME_TEMPLATE = 'Capture_{date}_{time}';

export interface FilenameContext {
  date: Date;
  counter?: number;
  appName?: string;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function formatDatePart(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTimePart(d: Date): string {
  return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Retire les caractères interdits dans un nom de fichier Windows. */
export function sanitizeFilename(name: string): string {
  const forbidden = /[<>:"/\\|?*\x00-\x1f]/g;
  return name.replace(forbidden, '').replace(/[. ]+$/g, '').trim();
}

export function buildCaptureName(template: string, ctx: FilenameContext): string {
  const name = template
    .replace(/\{date\}/g, formatDatePart(ctx.date))
    .replace(/\{time\}/g, formatTimePart(ctx.date))
    .replace(/\{counter\}/g, ctx.counter != null ? String(ctx.counter) : '')
    .replace(/\{app\}/g, ctx.appName ? sanitizeFilename(ctx.appName) : '')
    // nettoie les séparateurs orphelins laissés par des variables vides
    .replace(/_{2,}/g, '_')
    .replace(/^[_\s]+|[_\s]+$/g, '');
  return sanitizeFilename(name) || `Capture_${formatDatePart(ctx.date)}_${formatTimePart(ctx.date)}`;
}
