import type { AiPrice, AiUsage } from './types';

/**
 * Prix publics (USD par million de jetons) des modèles connus, pour estimer
 * le coût de chaque traduction. Aucun fournisseur ne donne le solde restant
 * avec une simple clé API : MultiOutils compte donc lui-même ce qu'il dépense,
 * à partir des jetons renvoyés par chaque réponse. Un prix saisi dans les
 * Réglages (aiPrices) passe avant ce tableau.
 *
 * `from` : date (AAAA-MM-JJ) à partir de laquelle un tarif s'applique ; le
 * dernier tarif dont la date est passée l'emporte.
 */
export const KNOWN_PRICES: Record<string, Array<AiPrice & { from?: string }>> = {
  // Anthropic (platform.claude.com/docs/en/about-claude/pricing)
  'claude-opus-5-5': [{ input: 4, output: 20 }],
  'claude-sonnet-5-5': [{ input: 2, output: 10 }],
  'claude-haiku-5-5': [{ input: 0.1, output: 0.5 }],
  // OpenAI (openai.com/api/pricing)
  'gpt-4.1': [{ input: 2, output: 8 }],
  'gpt-4.1-mini': [{ input: 0.4, output: 1.6 }],
  // Google (ai.google.dev/gemini-api/docs/pricing) : tarif de lancement
  // jusqu'au 31/12/2026, doublé à partir du 1er janvier 2027.
  'gemini-3.8-flash': [
    { input: 0.75, output: 3.75 },
    { input: 1.5, output: 7.5, from: '2027-01-01' }
  ]
};

/**
 * Nom de modèle renvoyé par l'API → nom du tableau : « gpt-4.1-2025-04-14 »
 * ou « gemini-3.8-flash-001 » sont rattachés à leur modèle, mais jamais
 * « gpt-4.1-mini » à « gpt-4.1 » (seuls un suffixe de date, de version,
 * « latest » ou « preview » sont ignorés).
 */
export function baseModel(model: string, known: string[]): string | null {
  const m = model.trim().replace(/^models\//, '');
  if (known.includes(m)) return m;
  const candidates = known
    .filter((k) => m.startsWith(k) && /^(-\d[\d-]*|-latest|-preview[\w.-]*)$/.test(m.slice(k.length)))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? null;
}

/** Prix d'un modèle à une date : celui des Réglages, sinon le tableau, sinon null. */
export function priceFor(
  model: string,
  custom: Record<string, AiPrice> = {},
  date: Date = new Date()
): AiPrice | null {
  const own = baseModel(model, Object.keys(custom));
  if (own && validPrice(custom[own])) return custom[own];
  const key = baseModel(model, Object.keys(KNOWN_PRICES));
  if (!key) return null;
  const day = date.toISOString().slice(0, 10);
  const tiers = KNOWN_PRICES[key].filter((p) => !p.from || p.from <= day);
  const last = tiers[tiers.length - 1];
  return last ? { input: last.input, output: last.output } : null;
}

export function validPrice(p: unknown): p is AiPrice {
  const v = p as AiPrice | null;
  return (
    !!v &&
    typeof v.input === 'number' &&
    typeof v.output === 'number' &&
    Number.isFinite(v.input) &&
    Number.isFinite(v.output) &&
    v.input >= 0 &&
    v.output >= 0
  );
}

/** Coût en USD des jetons d'une réponse (null si le prix est inconnu). */
export function costOf(usage: AiUsage, price: AiPrice | null): number | null {
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
