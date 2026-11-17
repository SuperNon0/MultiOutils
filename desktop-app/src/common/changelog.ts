import data from './changelog.json';
import { compareVersions } from './types';

/**
 * Historique des versions de MultiOutils, livré DANS l'app (lisible hors
 * ligne) : fenêtre « Quoi de neuf » après une mise à jour et liste complète
 * dans Réglages → Mises à jour. La même source alimente les notes des
 * releases GitHub (scripts/release-notes.mjs).
 *
 * À chaque nouvelle version : ajouter une entrée EN TÊTE de changelog.json
 * (un test vérifie qu'elle correspond à la version de package.json).
 */
export interface ChangelogEntry {
  version: string;
  /** Première version couverte quand l'entrée regroupe plusieurs versions. */
  depuis?: string;
  /** Date de publication, AAAA-MM-JJ. */
  date: string;
  titre: string;
  nouveautes?: string[];
  corrections?: string[];
}

/** Toutes les versions, de la plus récente à la plus ancienne. */
export const CHANGELOG: ChangelogEntry[] = [...(data as ChangelogEntry[])].sort((a, b) =>
  compareVersions(b.version, a.version)
);

/** Versions publiées après `from` (exclue) jusqu'à `to` (incluse), plus récentes d'abord. */
export function changelogBetween(from: string, to: string): ChangelogEntry[] {
  return CHANGELOG.filter(
    (e) => compareVersions(e.version, from) > 0 && compareVersions(e.version, to) <= 0
  );
}

/**
 * Entrées à montrer dans « Quoi de neuf » au démarrage, ou [] s'il n'y a rien
 * à montrer. `lastSeen` vide = première installation ou app mise à jour depuis
 * une version qui ne retenait pas encore la dernière version vue.
 */
export function changelogToShow(
  lastSeen: string,
  current: string,
  freshInstall: boolean
): ChangelogEntry[] {
  if (freshInstall) return [];
  if (!lastSeen) return CHANGELOG.filter((e) => e.version === current);
  if (compareVersions(current, lastSeen) <= 0) return [];
  return changelogBetween(lastSeen, current);
}

/** Notes Markdown d'une version (corps de la release GitHub). */
export function releaseNotesMarkdown(entry: ChangelogEntry): string {
  const lines = [`## ${entry.titre}`, ''];
  if (entry.nouveautes?.length) {
    lines.push('### Nouveautés', '', ...entry.nouveautes.map((p) => `- ${p}`), '');
  }
  if (entry.corrections?.length) {
    lines.push('### Corrections', '', ...entry.corrections.map((p) => `- ${p}`), '');
  }
  return lines.join('\n');
}

/**
 * Notes d'une release lues par electron-updater (HTML de GitHub, ou texte)
 * → lignes de texte simples, puces conservées. Jamais de HTML injecté.
 */
export function releaseNotesToText(notes: unknown): string | undefined {
  const raw = Array.isArray(notes)
    ? notes.map((n) => (n && typeof n === 'object' ? (n as { note?: unknown }).note : n)).join('\n')
    : notes;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const text = raw
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|h[1-6]|li|ul|ol|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return text || undefined;
}
