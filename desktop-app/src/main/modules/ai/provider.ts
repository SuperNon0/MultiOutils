import type { AiErrorCode, AiProviderInfo, AiTranslation } from '../../../common/types';

/**
 * Traduction IA d'une capture : contrat commun à tous les fournisseurs
 * (Claude d'Anthropic, OpenAI, Google Gemini). Ajouter un fournisseur =
 * écrire un `TranslateProvider` et l'ajouter à la liste de ./providers.ts.
 *
 * Ce fichier ne dépend pas d'Electron : la logique est testée par vitest.
 */

/** Image envoyée à l'IA (déjà réduite si besoin, voir ./image.ts). */
export interface TranslateImage {
  /** Contenu en base64 (sans préfixe data:). */
  data: string;
  mediaType: 'image/png' | 'image/jpeg';
}

export interface TranslateRequest {
  image: TranslateImage;
  /** Langue cible en clair (« Français », « English », « 日本語 »…). */
  targetLang: string;
  apiKey: string;
  model: string;
}

export interface TranslateProvider {
  info: AiProviderInfo;
  translate(req: TranslateRequest): Promise<AiTranslation>;
  /** Petit appel qui vérifie la clé (ne coûte rien ou presque). */
  testKey(apiKey: string, model: string): Promise<void>;
  /** Modèles réellement proposés par le fournisseur pour cette clé (liste vive). */
  listModels?(apiKey: string): Promise<string[]>;
}

/** Numéro de version d'un nom de modèle (« gemini-3.8-flash » → [3, 8]). */
function versionOf(id: string): number[] {
  const m = id.match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : [];
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Choisit un modèle de remplacement dans la liste vive : le plus récent dont le
 * nom correspond au motif préféré (p. ex. « gemini-X-flash »), sinon le plus
 * récent de la famille. null si rien ne convient.
 */
export function pickModel(available: string[], preferred: RegExp, family: RegExp): string | null {
  const best = (ids: string[]): string | null =>
    ids.length === 0
      ? null
      : [...ids].sort((a, b) => compareVersions(versionOf(b), versionOf(a)))[0];
  return best(available.filter((id) => preferred.test(id))) ?? best(available.filter((id) => family.test(id)));
}

/** Erreur typée remontée au renderer (message traduit côté interface). */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'AiError';
  }
}

const FIELDS = {
  source_language: 'Language of the text found in the image, named in the target language.',
  original_text: 'All the visible text of the image, transcribed exactly, keeping line breaks.',
  translated_text: 'The full translation of original_text into the target language, keeping line breaks.'
};

/** Le JSON attendu de l'IA (structured outputs, JSON Schema). */
export const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(
    Object.entries(FIELDS).map(([k, description]) => [k, { type: 'string', description }])
  ),
  required: Object.keys(FIELDS),
  additionalProperties: false
};

/** Même schéma au format de Gemini (sous-ensemble OpenAPI, sans additionalProperties). */
export const TRANSLATION_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: Object.fromEntries(
    Object.entries(FIELDS).map(([k, description]) => [k, { type: 'STRING', description }])
  ),
  required: Object.keys(FIELDS),
  propertyOrdering: Object.keys(FIELDS)
};

/** Nettoie la langue cible saisie (champ libre) : jamais vide, longueur bornée. */
export function cleanTargetLang(lang: string | undefined | null): string {
  const v = (lang ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
  return v || 'Français';
}

export function systemPrompt(targetLang: string): string {
  const lang = cleanTargetLang(targetLang);
  return [
    'You read screenshots for a desktop tool.',
    'Extract ALL the text visible in the image, in natural reading order, keeping line breaks.',
    `Then translate that text into ${lang}.`,
    'Translate faithfully: keep names, numbers, code, URLs and formatting; do not add comments or explanations.',
    `If the text is already in ${lang}, copy it unchanged as the translation.`,
    'If the image contains no readable text, return empty strings for original_text and translated_text.',
    `Write source_language as the name of the detected language, in ${lang}.`,
    'Answer only with the JSON object described by the schema.'
  ].join('\n');
}

export function userPrompt(targetLang: string): string {
  return `Extract the text of this screenshot and translate it into ${cleanTargetLang(targetLang)}.`;
}

/** Nombre de jetons lu dans une réponse (0 si absent ou invalide). */
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** Lit le JSON renvoyé par l'IA et vérifie sa forme. */
export function parseTranslationJson(text: string, model: string): AiTranslation {
  let value: unknown;
  try {
    // tolère un éventuel bloc ```json … ``` (fournisseurs sans sortie stricte)
    value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('badResponse', 'invalid JSON');
  }
  const v = (value && typeof value === 'object' ? value : null) as Record<string, unknown> | null;
  if (!v || typeof v.original_text !== 'string' || typeof v.translated_text !== 'string') {
    throw new AiError('badResponse', 'missing fields');
  }
  return {
    sourceLanguage: typeof v.source_language === 'string' ? v.source_language.trim() : '',
    original: v.original_text.trim(),
    translated: v.translated_text.trim(),
    model
  };
}

/**
 * Modèle effectif : liste fermée → un modèle connu (sinon le défaut) ;
 * champ libre → la saisie nettoyée (sinon le défaut).
 */
export function resolveModel(info: AiProviderInfo, requested: string | undefined | null): string {
  const v = (requested ?? '').trim();
  if (info.fixedModels) {
    return info.models.some((m) => m.id === v) ? v : info.defaultModel;
  }
  return /^[\w.\-:]{1,100}$/.test(v) ? v : info.defaultModel;
}

/** Erreur HTTP d'un fournisseur appelé par fetch → code clair. */
export function httpError(status: number, body: unknown): AiError {
  const message = errorMessageFrom(body) ?? `HTTP ${status}`;
  if (status === 401 || status === 403) return new AiError('invalidKey', message);
  if (status === 429) return new AiError('rateLimit', message);
  if (status === 404) return new AiError('notFound', message);
  if (status >= 500) return new AiError('server', message);
  return new AiError('api', message);
}

export function errorMessageFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const err = (body as { error?: unknown }).error;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return null;
}

/** fetch avec délai et erreurs réseau traduites ; renvoie le statut et le JSON. */
export async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 120_000
): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new AiError('network', err instanceof Error ? err.message : String(err));
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}
