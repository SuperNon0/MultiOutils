import type { AiUsageEntry, AiUsageSummary, AiUsageTotals } from '../../../common/types';

/** Nombre de traductions montrées dans l'historique des Réglages. */
export const RECENT_LIMIT = 50;

function emptyTotals(): AiUsageTotals {
  return { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpriced: 0 };
}

function add(t: AiUsageTotals, e: AiUsageEntry): void {
  t.count += 1;
  t.inputTokens += e.inputTokens;
  t.outputTokens += e.outputTokens;
  if (e.costUsd === null) t.unpriced += 1;
  else t.costUsd += e.costUsd;
}

/** Début du mois en cours (heure locale), au format ISO. */
export function monthStart(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * Résumé du suivi local : mois en cours, total et dernières traductions.
 * `entries` : toutes les lignes, dans n'importe quel ordre.
 */
export function summarizeUsage(
  entries: AiUsageEntry[],
  now: Date = new Date(),
  recentLimit = RECENT_LIMIT
): AiUsageSummary {
  const start = monthStart(now);
  const month = emptyTotals();
  const total = emptyTotals();
  let since: string | null = null;
  for (const e of entries) {
    add(total, e);
    if (e.createdAt >= start) add(month, e);
    if (!since || e.createdAt < since) since = e.createdAt;
  }
  const recent = [...entries]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
    .slice(0, recentLimit);
  return { month, total, since, recent };
}
