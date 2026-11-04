import type { AiProviderInfo, AiTranslation } from '../../../common/types';
import {
  AiError,
  errorMessageFrom,
  fetchJson,
  httpError,
  parseTranslationJson,
  systemPrompt,
  TRANSLATION_SCHEMA_GEMINI,
  userPrompt,
  type TranslateProvider,
  type TranslateRequest
} from './provider';

/** Fournisseur Google Gemini (API generateContent, appelée par fetch : aucun SDK). */
export const GEMINI_INFO: AiProviderInfo = {
  id: 'gemini',
  label: 'Google Gemini',
  models: [{ id: 'gemini-2.5-flash' }, { id: 'gemini-2.5-pro' }],
  defaultModel: 'gemini-2.5-flash',
  fixedModels: false,
  keyUrl: 'https://aistudio.google.com/apikey'
};

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function buildGeminiRequest(req: TranslateRequest): { url: string; init: RequestInit } {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(req.targetLang) }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: req.image.mediaType, data: req.image.data } },
          { text: userPrompt(req.targetLang) }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: TRANSLATION_SCHEMA_GEMINI,
      maxOutputTokens: 16000
    }
  };
  return {
    url: `${BASE}/models/${encodeURIComponent(req.model)}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'x-goog-api-key': req.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  };
}

const BLOCKED = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY'];

export function parseGeminiResponse(body: unknown, requestedModel: string): AiTranslation {
  const b = (body ?? {}) as {
    modelVersion?: string;
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (b.promptFeedback?.blockReason) throw new AiError('refusal', b.promptFeedback.blockReason);
  const cand = b.candidates?.[0];
  if (!cand) throw new AiError('badResponse', 'no candidate');
  if (cand.finishReason && BLOCKED.includes(cand.finishReason)) {
    throw new AiError('refusal', cand.finishReason);
  }
  if (cand.finishReason === 'MAX_TOKENS') throw new AiError('truncated');
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text.trim()) throw new AiError('badResponse', 'empty response');
  return parseTranslationJson(text, b.modelVersion ?? requestedModel);
}

/** Gemini répond 400 (et non 401) à une clé invalide : on le reconnaît. */
export function geminiHttpError(status: number, body: unknown): AiError {
  if (status === 400) {
    const err = (body as { error?: { status?: string; details?: Array<{ reason?: string }> } })?.error;
    const keyIssue =
      err?.details?.some((d) => d.reason === 'API_KEY_INVALID') ||
      /api key/i.test(errorMessageFrom(body) ?? '');
    if (keyIssue) return new AiError('invalidKey', errorMessageFrom(body) ?? undefined);
  }
  return httpError(status, body);
}

export function createGeminiProvider(fetchImpl: typeof fetch = fetch): TranslateProvider {
  return {
    info: GEMINI_INFO,
    async translate(req) {
      const { url, init } = buildGeminiRequest(req);
      const { status, body } = await fetchJson(fetchImpl, url, init);
      if (status < 200 || status >= 300) throw geminiHttpError(status, body);
      return parseGeminiResponse(body, req.model);
    },
    async testKey(apiKey) {
      const { status, body } = await fetchJson(
        fetchImpl,
        `${BASE}/models`,
        { method: 'GET', headers: { 'x-goog-api-key': apiKey } },
        20_000
      );
      if (status < 200 || status >= 300) throw geminiHttpError(status, body);
    }
  };
}
