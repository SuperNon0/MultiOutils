import type { AiProviderInfo, AiTranslation } from '../../../common/types';
import {
  AiError,
  num,
  fetchJson,
  httpError,
  parseTranslationJson,
  systemPrompt,
  TRANSLATION_SCHEMA,
  userPrompt,
  type TranslateProvider,
  type TranslateRequest
} from './provider';

/** Fournisseur OpenAI (API Chat Completions, appelée par fetch : aucun SDK). */
export const OPENAI_INFO: AiProviderInfo = {
  id: 'openai',
  label: 'OpenAI',
  models: [{ id: 'gpt-4.1' }, { id: 'gpt-4.1-mini' }],
  defaultModel: 'gpt-4.1',
  fixedModels: false,
  keyUrl: 'https://platform.openai.com/api-keys',
  billingUrl: 'https://platform.openai.com/settings/organization/billing/overview'
};

const BASE = 'https://api.openai.com/v1';

export function buildOpenAiRequest(req: TranslateRequest): { url: string; init: RequestInit } {
  const body = {
    model: req.model,
    messages: [
      { role: 'system', content: systemPrompt(req.targetLang) },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${req.image.mediaType};base64,${req.image.data}` } },
          { type: 'text', text: userPrompt(req.targetLang) }
        ]
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'screenshot_translation', strict: true, schema: TRANSLATION_SCHEMA }
    }
  };
  return {
    url: `${BASE}/chat/completions`,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${req.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  };
}

interface OpenAiChoice {
  finish_reason?: string;
  message?: { content?: string | null; refusal?: string | null };
}

export function parseOpenAiResponse(body: unknown, requestedModel: string): AiTranslation {
  const b = (body ?? {}) as {
    model?: string;
    choices?: OpenAiChoice[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = b.choices?.[0];
  if (!choice?.message) throw new AiError('badResponse', 'no choice');
  if (choice.message.refusal) throw new AiError('refusal', choice.message.refusal);
  if (choice.finish_reason === 'content_filter') throw new AiError('refusal');
  if (choice.finish_reason === 'length') throw new AiError('truncated');
  const text = choice.message.content ?? '';
  if (!text.trim()) throw new AiError('badResponse', 'empty response');
  const result = parseTranslationJson(text, b.model ?? requestedModel);
  if (b.usage) {
    result.usage = { inputTokens: num(b.usage.prompt_tokens), outputTokens: num(b.usage.completion_tokens) };
  }
  return result;
}

export function createOpenAiProvider(fetchImpl: typeof fetch = fetch): TranslateProvider {
  return {
    info: OPENAI_INFO,
    async translate(req) {
      const { url, init } = buildOpenAiRequest(req);
      const { status, body } = await fetchJson(fetchImpl, url, init);
      if (status < 200 || status >= 300) throw httpError(status, body);
      return parseOpenAiResponse(body, req.model);
    },
    async testKey(apiKey) {
      const { status, body } = await fetchJson(
        fetchImpl,
        `${BASE}/models`,
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } },
        20_000
      );
      if (status < 200 || status >= 300) throw httpError(status, body);
    },
    async listModels(apiKey) {
      const { status, body } = await fetchJson(
        fetchImpl,
        `${BASE}/models`,
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } },
        20_000
      );
      if (status < 200 || status >= 300) throw httpError(status, body);
      const data = (body as { data?: unknown })?.data;
      if (!Array.isArray(data)) return [];
      return data
        .map((m) => (m && typeof (m as { id?: unknown }).id === 'string' ? (m as { id: string }).id : ''))
        .filter((id) => /^gpt-[\d.]+(-mini)?$/.test(id));
    }
  };
}
