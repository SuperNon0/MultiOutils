/**
 * Classement des résultats : score de correspondance + bonus d'usage
 * (équivalent de UserSelectedRecord de Flow Launcher, licence MIT) + priorité
 * du fournisseur, puis fusion, dédoublonnage et limite.
 */

export interface RankInput {
  id: string;
  /** Clé stable du résultat pour mémoriser les sélections (ex. chemin du programme). */
  recordKey: string;
  /** Score de correspondance (0 si pas de correspondance textuelle). */
  score: number;
  /** Bonus/malus du fournisseur (calculatrice en tête, recherche web en dernier). */
  priority?: number;
  /** Toujours en dernier quelle que soit la note (moteur web par défaut). */
  pinBottom?: boolean;
}

/**
 * Mémoire des sélections : `count(requête + résultat) × 5 + count(résultat)`,
 * comme Flow. Sérialisable en JSON (clé → nombre).
 */
export class UsageRecord {
  private counts: Map<string, number>;

  constructor(
    initial: Record<string, number> = {},
    private readonly maxEntries = 3000
  ) {
    this.counts = new Map(Object.entries(initial).filter(([, v]) => typeof v === 'number'));
  }

  static queryKey(search: string, recordKey: string): string {
    return `${search.trim().toLowerCase()}\u0001${recordKey}`;
  }

  add(search: string, recordKey: string): void {
    for (const key of [UsageRecord.queryKey(search, recordKey), recordKey]) {
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    }
    this.prune();
  }

  selectedCount(search: string, recordKey: string): number {
    return (
      (this.counts.get(UsageRecord.queryKey(search, recordKey)) ?? 0) * 5 +
      (this.counts.get(recordKey) ?? 0)
    );
  }

  clear(): void {
    this.counts.clear();
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  get size(): number {
    return this.counts.size;
  }

  private prune(): void {
    if (this.counts.size <= this.maxEntries) return;
    // on oublie d'abord les sélections les plus rares
    const sorted = [...this.counts.entries()].sort((a, b) => a[1] - b[1]);
    const drop = this.counts.size - Math.floor(this.maxEntries * 0.9);
    for (let i = 0; i < drop; i++) this.counts.delete(sorted[i][0]);
  }
}

/** Plafond du bonus d'usage : il départage sans écraser la pertinence. */
export const USAGE_CAP = 150;

export function finalScore(input: RankInput, usage: UsageRecord | null, search: string): number {
  const bonus = usage ? Math.min(USAGE_CAP, usage.selectedCount(search, input.recordKey)) : 0;
  return input.score + (input.priority ?? 0) + bonus;
}

/**
 * Trie (score décroissant, puis ordre d'arrivée), dédoublonne par recordKey
 * (le meilleur gagne) et applique la limite. Les `pinBottom` restent à la fin
 * et ne comptent pas dans la limite, comme le moteur web par défaut de Flow.
 */
export function rank<T extends RankInput>(
  items: T[],
  usage: UsageRecord | null,
  search: string,
  limit: number
): Array<T & { final: number }> {
  const scored = items.map((item, order) => ({
    ...item,
    final: finalScore(item, usage, search),
    order
  }));
  const best = new Map<string, (typeof scored)[number]>();
  for (const s of scored) {
    const prev = best.get(s.recordKey);
    if (!prev || s.final > prev.final) best.set(s.recordKey, s);
  }
  const unique = [...best.values()];
  const top = unique
    .filter((s) => !s.pinBottom)
    .sort((a, b) => b.final - a.final || a.order - b.order)
    .slice(0, Math.max(1, limit));
  const bottom = unique.filter((s) => s.pinBottom).sort((a, b) => a.order - b.order);
  return [...top, ...bottom].map(({ order: _order, ...rest }) => rest as T & { final: number });
}

/** Historique des requêtes (le plus récent d'abord, sans doublon). */
export function pushHistory(history: string[], query: string, max = 50): string[] {
  const q = query.trim();
  if (!q) return history;
  return [q, ...history.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, max);
}
