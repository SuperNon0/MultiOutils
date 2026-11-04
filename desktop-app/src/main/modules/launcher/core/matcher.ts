/**
 * Correspondance floue — portage TypeScript du StringMatcher de Flow Launcher
 * (Flow.Launcher.Infrastructure/StringMatcher.cs, licence MIT,
 * © 2019 Flow-Launcher, © 2015 Wox — voir THIRD_PARTY_NOTICES.md).
 *
 * Deux passes, comme l'original :
 * - Acronymes : les caractères « acronymes » de la chaîne (1er caractère,
 *   caractère après un espace, majuscule, groupe de chiffres) doivent tous
 *   correspondre à la requête (« vsc » → « Visual Studio Code »).
 * - Recherche floue : la requête est découpée en mots ; chaque mot doit se
 *   retrouver dans l'ordre dans la chaîne, avec préférence pour les mots
 *   entiers et les correspondances proches du début.
 * Les accents et la casse sont ignorés (« ecran » trouve « Écran »).
 */

export interface MatchResult {
  success: boolean;
  /** Score brut (0 si échec). Plus haut = meilleur. */
  score: number;
  /** Indices des caractères correspondants dans la chaîne d'origine. */
  indices: number[];
}

/** Seuils de précision de Flow (SearchPrecisionScore). */
export const PRECISION = { regular: 50, low: 20, none: 0 } as const;

const NO_MATCH: MatchResult = { success: false, score: 0, indices: [] };

const charCache = new Map<string, string>();

/** Minuscule sans accent, en gardant UN caractère pour UN caractère (indices stables). */
export function normalizeChar(c: string): string {
  let out = charCache.get(c);
  if (out !== undefined) return out;
  const stripped = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  out = (stripped.length > 0 ? stripped[0] : c).toLowerCase();
  if (out.length !== 1) out = c.toLowerCase().length === 1 ? c.toLowerCase() : c;
  if (c === 'ß') out = 's';
  if (c === 'œ' || c === 'Œ') out = 'o';
  if (c === 'æ' || c === 'Æ') out = 'a';
  charCache.set(c, out);
  return out;
}

/** Chaîne entière normalisée (même longueur que l'entrée). */
export function normalizeText(s: string): string {
  let out = '';
  for (const c of s) {
    // les caractères hors BMP (emoji…) comptent pour 2 unités UTF-16 : on
    // garde l'alignement des indices en ne normalisant que le BMP
    out += c.length === 1 ? normalizeChar(c) : c;
  }
  return out;
}

const isWhite = (c: string | undefined): boolean => c === ' ' || c === '\t';
const isDigit = (s: string, i: number): boolean => s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57;
const isUpper = (c: string): boolean => c !== c.toLowerCase() && c === c.toUpperCase();

function isAcronymChar(s: string, i: number): boolean {
  return isUpper(s[i]) || i === 0 || isWhite(s[i - 1]);
}
function isAcronym(s: string, i: number): boolean {
  return isAcronymChar(s, i) || isDigit(s, i);
}
/** Compte un groupe de chiffres contigus comme UN acronyme. */
function isAcronymCount(s: string, i: number): boolean {
  if (isAcronymChar(s, i)) return true;
  if (isDigit(s, i)) return i === 0 || !isDigit(s, i - 1);
  return false;
}

function countDistinctAcronymGroups(matched: number[], s: string): number {
  let groups = 0;
  const processed = new Set<number>();
  for (const idx of matched) {
    if (processed.has(idx)) continue;
    processed.add(idx);
    groups += 1;
    if (!isDigit(s, idx)) continue;
    let end = idx;
    while (end < s.length - 1 && isDigit(s, end + 1)) {
      end += 1;
      processed.add(end);
    }
  }
  return groups;
}

function closestSpaceIndex(spaces: number[], firstMatchIndex: number): number {
  let closest = -1;
  for (const index of spaces) {
    if (index < firstMatchIndex) closest = index;
    else break;
  }
  return closest;
}

function searchScore(
  query: string,
  compare: string,
  firstIndex: number,
  spaces: number[],
  matchLen: number,
  allContained: boolean
): number {
  // Une correspondance proche du début et resserrée vaut plus.
  let score = Math.trunc((100 * (query.length + 1)) / (1 + firstIndex + (matchLen + 1)));
  if (firstIndex === 0 && allContained) score -= spaces.length;
  // Chaîne courte = meilleure correspondance.
  if (compare.length - query.length < 5) score += 20;
  else if (compare.length - query.length < 10) score += 10;
  if (allContained) {
    const count = [...query].filter((c) => !isWhite(c)).length;
    const threshold = 4;
    score += count <= threshold ? count * 10 : threshold * 10 + (count - threshold) * 5;
  }
  return score;
}

/**
 * Compare `query` à `target`. `precision` = score minimal (Flow : 50 par défaut).
 */
export function fuzzyMatch(
  rawQuery: string,
  target: string,
  precision: number = PRECISION.regular
): MatchResult {
  if (!target || !rawQuery) return NO_MATCH;
  const query = rawQuery.trim();
  if (!query) return NO_MATCH;

  const q = normalizeText(query);
  const subs = q.split(' ').filter((s) => s.length > 0);
  if (subs.length === 0) return NO_MATCH;

  let acronymQueryIndex = 0;
  const acronymMatches: number[] = [];
  let acronymsTotal = 0;
  let acronymsMatched = 0;

  let subIndex = 0;
  let sub = subs[0];
  let subCharIndex = 0;

  let firstMatchIndex = -1;
  let firstMatchIndexInWord = -1;
  let lastMatchIndex = 0;
  let allSubsMatched = false;
  let matchFoundInPreviousLoop = false;
  let allContained = true;

  let indexList: number[] = [];
  const spaces: number[] = [];

  for (let i = 0; i < target.length; i++) {
    if (acronymQueryIndex >= query.length && acronymsMatched === query.length) {
      if (isAcronymCount(target, i)) acronymsTotal++;
      continue;
    }
    if (acronymQueryIndex >= query.length) break;

    const c = normalizeChar(target[i]);
    if (c === ' ' && subIndex === 0) spaces.push(i);

    if (isAcronym(target, i) && c === q[acronymQueryIndex]) {
      acronymMatches.push(i);
      acronymsMatched++;
      acronymQueryIndex++;
    }
    if (isAcronymCount(target, i)) acronymsTotal++;

    if (allSubsMatched || c !== sub[subCharIndex]) {
      matchFoundInPreviousLoop = false;
      continue;
    }

    if (firstMatchIndex < 0) firstMatchIndex = i;

    if (subCharIndex === 0) {
      matchFoundInPreviousLoop = true;
      firstMatchIndexInWord = i;
    } else if (!matchFoundInPreviousLoop) {
      // Y a-t-il un meilleur départ (mot contigu) juste avant ?
      const start = i - subCharIndex;
      let allPrev = true;
      for (let k = 0; k < subCharIndex; k++) {
        if (normalizeChar(target[start + k]) !== sub[k]) {
          allPrev = false;
          break;
        }
      }
      if (allPrev) {
        matchFoundInPreviousLoop = true;
        if (subIndex === 0) firstMatchIndex = start;
        indexList = indexList.filter((x) => x < firstMatchIndexInWord);
        for (let k = 0; k < subCharIndex; k++) indexList.push(start + k);
      }
    }

    lastMatchIndex = i + 1;
    indexList.push(i);
    subCharIndex++;

    if (subCharIndex === sub.length) {
      allContained = matchFoundInPreviousLoop && allContained;
      subIndex++;
      allSubsMatched = subIndex >= subs.length;
      if (allSubsMatched) continue;
      sub = subs[subIndex];
      subCharIndex = 0;
    }
  }

  if (acronymsMatched > 0 && acronymsMatched === query.length) {
    const groups = countDistinctAcronymGroups(acronymMatches, target);
    const acronymScore = Math.trunc((groups * 100) / Math.max(1, acronymsTotal));
    if (acronymScore >= precision) {
      return { success: true, score: acronymScore, indices: [...new Set(acronymMatches)] };
    }
  }

  if (allSubsMatched) {
    const nearestSpace = closestSpaceIndex(spaces, firstMatchIndex);
    const score = searchScore(
      query,
      target,
      firstMatchIndex - nearestSpace - 1,
      spaces,
      lastMatchIndex - firstMatchIndex,
      allContained
    );
    if (score < precision) return NO_MATCH;
    return { success: true, score, indices: [...new Set(indexList)].sort((a, b) => a - b) };
  }
  return NO_MATCH;
}

/**
 * Meilleure correspondance parmi plusieurs champs (nom, description, exécutable…),
 * chacun avec un poids. Renvoie aussi l'indice du champ gagnant (pour le surlignage).
 */
export function bestMatch(
  query: string,
  fields: Array<{ text?: string | undefined; weight?: number }>,
  precision?: number
): (MatchResult & { field: number }) | null {
  let best: (MatchResult & { field: number }) | null = null;
  fields.forEach((f, field) => {
    if (!f.text) return;
    const m = fuzzyMatch(query, f.text, precision);
    if (!m.success) return;
    const score = Math.round(m.score * (f.weight ?? 1));
    if (!best || score > best.score) best = { ...m, score, field };
  });
  return best;
}
