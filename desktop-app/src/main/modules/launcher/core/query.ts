/**
 * Analyse d'une requête : mot-clé d'action + texte recherché
 * (équivalent du QueryBuilder de Flow Launcher, licence MIT).
 *
 * - Mot-clé alphanumérique (« g », « kill ») : doit être suivi d'un espace —
 *   « gmail » ne déclenche pas « g », et « g » seul reste une recherche
 *   globale (Flow l'active dès « g » ; on attend l'espace pour ne pas masquer
 *   les programmes qui commencent par cette lettre).
 * - Mot-clé symbolique (« > », « = ») : peut être collé (« >ipconfig »).
 * - Aucun mot-clé reconnu : requête globale.
 */

export interface KeywordBinding<T = string> {
  keyword: string;
  /** Ce que désigne ce mot-clé (fournisseur, moteur web…). */
  target: T;
}

export interface ParsedQuery<T = string> {
  /** Requête telle que tapée. */
  raw: string;
  /** Mot-clé reconnu ('' = global). */
  keyword: string;
  /** Cibles liées à ce mot-clé (plusieurs possibles). */
  targets: T[];
  /** Texte recherché, sans le mot-clé, espaces de bord retirés. */
  search: string;
  /** Termes du texte recherché. */
  terms: string[];
}

const isSymbolic = (kw: string): boolean => !/[\p{L}\p{N}]/u.test(kw);

export function parseQuery<T>(raw: string, bindings: KeywordBinding<T>[]): ParsedQuery<T> {
  const text = raw.replace(/^\s+/, '');
  const lower = text.toLowerCase();
  // le mot-clé le plus long gagne (« yt » avant « y »)
  const sorted = bindings
    .filter((b) => b.keyword.trim().length > 0)
    .sort((a, b) => b.keyword.length - a.keyword.length);

  for (const b of sorted) {
    const kw = b.keyword.toLowerCase();
    if (!lower.startsWith(kw)) continue;
    const rest = text.slice(kw.length);
    const glued = isSymbolic(kw);
    if (!glued && !/^\s/.test(rest)) continue;
    const targets = sorted.filter((o) => o.keyword.toLowerCase() === kw).map((o) => o.target);
    const search = rest.trim();
    return {
      raw,
      keyword: b.keyword,
      targets,
      search,
      terms: search ? search.split(/\s+/) : []
    };
  }

  const search = text.trim();
  return { raw, keyword: '', targets: [], search, terms: search ? search.split(/\s+/) : [] };
}

/** Motif d'exclusion : sous-chaîne, ou joker * / ? (insensible à la casse). */
export function compileExcludes(patterns: string[]): (path: string) => boolean {
  const tests = patterns
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (/[*?]/.test(p)) {
        const re = new RegExp(
          '^' +
            p
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.') +
            '$',
          'i'
        );
        return (s: string): boolean => re.test(s) || re.test(s.split(/[\\/]/).pop() ?? '');
      }
      const low = p.toLowerCase();
      return (s: string): boolean => s.toLowerCase().includes(low);
    });
  return (path) => tests.some((t) => t(path));
}
