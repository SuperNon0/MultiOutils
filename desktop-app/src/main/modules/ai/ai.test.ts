import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_INFO,
  buildAnthropicParams,
  createAnthropicProvider,
  mapAnthropicError,
  parseAnthropicMessage,
  type AnthropicClientLike
} from './anthropic';
import { buildGeminiRequest, createGeminiProvider, GEMINI_INFO, parseGeminiResponse } from './gemini';
import { canSendAsIs, candidateSizes, MAX_IMAGE_BYTES } from './image';
import { AiKeyStore, type Cipher } from './keys';
import { buildOpenAiRequest, createOpenAiProvider, OPENAI_INFO, parseOpenAiResponse } from './openai';
import {
  AiError,
  cleanTargetLang,
  parseTranslationJson,
  resolveModel,
  TRANSLATION_SCHEMA,
  type TranslateRequest
} from './provider';

const REQ: TranslateRequest = {
  image: { data: 'QUJD', mediaType: 'image/png' },
  targetLang: 'Français',
  apiKey: 'sk-test',
  model: 'claude-opus-5-5'
};
const JSON_OK = JSON.stringify({
  source_language: 'Anglais',
  original_text: 'Hello world',
  translated_text: 'Bonjour le monde'
});

function message(over: Partial<BetaMessage>): BetaMessage {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON_OK, citations: null }],
    stop_reason: 'end_turn',
    stop_details: null,
    ...over
  } as unknown as BetaMessage;
}

/** Faux fetch : enregistre l'appel et renvoie la réponse prévue. */
function fakeFetch(status: number, body: unknown): typeof fetch & { calls: Array<[string, RequestInit]> } {
  const calls: Array<[string, RequestInit]> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch & { calls: Array<[string, RequestInit]> };
  f.calls = calls;
  return f;
}

describe('logique commune', () => {
  it('choisit le modèle : liste fermée ou champ libre', () => {
    expect(resolveModel(ANTHROPIC_INFO, 'claude-haiku-5-5')).toBe('claude-haiku-5-5');
    expect(resolveModel(ANTHROPIC_INFO, 'gpt-4.1')).toBe('claude-opus-5-5');
    expect(resolveModel(ANTHROPIC_INFO, undefined)).toBe('claude-opus-5-5');
    expect(resolveModel(OPENAI_INFO, '  gpt-5-mini ')).toBe('gpt-5-mini');
    expect(resolveModel(OPENAI_INFO, '')).toBe('gpt-4.1');
    expect(resolveModel(GEMINI_INFO, 'bad model/../x')).toBe('gemini-2.5-flash');
  });

  it('nettoie la langue cible', () => {
    expect(cleanTargetLang('  Español\n')).toBe('Español');
    expect(cleanTargetLang('')).toBe('Français');
  });

  it('lit le JSON de traduction', () => {
    expect(parseTranslationJson(JSON_OK, 'm')).toEqual({
      sourceLanguage: 'Anglais',
      original: 'Hello world',
      translated: 'Bonjour le monde',
      model: 'm'
    });
    expect(parseTranslationJson('```json\n' + JSON_OK + '\n```', 'm').translated).toBe('Bonjour le monde');
    expect(() => parseTranslationJson('pas du json', 'm')).toThrow(AiError);
    expect(() => parseTranslationJson('{"original_text": 1}', 'm')).toThrow(/missing/);
  });

  it('schéma strict', () => {
    expect(TRANSLATION_SCHEMA.additionalProperties).toBe(false);
    expect(TRANSLATION_SCHEMA.required).toEqual(['source_language', 'original_text', 'translated_text']);
  });
});

describe('image', () => {
  it('envoie tel quel un PNG raisonnable', () => {
    expect(canSendAsIs({ width: 1920, height: 1080, bytes: 900_000, png: true })).toBe(true);
    expect(canSendAsIs({ width: 1920, height: 1080, bytes: 900_000, png: false })).toBe(false);
    expect(canSendAsIs({ width: 1920, height: 1080, bytes: MAX_IMAGE_BYTES + 1, png: true })).toBe(false);
    expect(canSendAsIs({ width: 9000, height: 1000, bytes: 100, png: true })).toBe(false);
  });

  it('propose des tailles décroissantes, jamais agrandies', () => {
    expect(candidateSizes(3840, 2160)).toEqual([
      { width: 3840, height: 2160 },
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
      { width: 1440, height: 810 },
      { width: 1024, height: 576 }
    ]);
    expect(candidateSizes(800, 600)).toEqual([{ width: 800, height: 600 }]);
    expect(candidateSizes(10000, 5000)[0]).toEqual({ width: 2560, height: 1280 });
  });
});

describe('clés API', () => {
  const cipher = (available = true): Cipher => ({
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`x${s}`),
    decryptString: (b) => b.toString().slice(1)
  });
  const kv = (): { map: Map<string, string>; get(k: string): string | undefined; set(k: string, v: string): void; delete(k: string): void } => {
    const map = new Map<string, string>();
    return { map, get: (k) => map.get(k), set: (k, v) => void map.set(k, v), delete: (k) => void map.delete(k) };
  };

  it('chiffre une clé par fournisseur, jamais en clair', () => {
    const store = kv();
    const keys = new AiKeyStore(store, cipher());
    keys.set('anthropic', ' sk-ant-123 ');
    keys.set('openai', 'sk-oa');
    expect(keys.get('anthropic')).toBe('sk-ant-123');
    expect(keys.get('openai')).toBe('sk-oa');
    expect(keys.has('gemini')).toBe(false);
    expect([...store.map.values()].join()).not.toContain('sk-ant-123');
    keys.set('anthropic', '');
    expect(keys.has('anthropic')).toBe(false);
  });

  it('refuse sans chiffrement disponible', () => {
    const keys = new AiKeyStore(kv(), cipher(false));
    expect(() => keys.set('anthropic', 'sk')).toThrow(expect.objectContaining({ code: 'encryptionUnavailable' }));
  });
});

describe('Anthropic', () => {
  it('construit la requête (image, JSON strict, repli, effort bas)', () => {
    const p = buildAnthropicParams(REQ);
    expect(p).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: TRANSLATION_SCHEMA } }
    });
    expect(p).not.toHaveProperty('temperature');
    expect(p).not.toHaveProperty('thinking');
    expect(p.system).toContain('Français');
    const content = p.messages[0].content as Array<{ type: string; source?: unknown }>;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
    expect(content[1].type).toBe('text');
  });

  it('lit la réponse, le refus et la coupure', () => {
    expect(parseAnthropicMessage(message({ model: 'claude-opus-5' })).model).toBe('claude-opus-5');
    expect(() =>
      parseAnthropicMessage(
        message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'non' } as never })
      )
    ).toThrow(expect.objectContaining({ code: 'refusal' }));
    expect(() => parseAnthropicMessage(message({ stop_reason: 'max_tokens' }))).toThrow(
      expect.objectContaining({ code: 'truncated' })
    );
  });

  it('traduit les erreurs typées du SDK', () => {
    const h = new Headers();
    expect(mapAnthropicError(new Anthropic.AuthenticationError(401, {}, 'bad key', h)).code).toBe('invalidKey');
    expect(mapAnthropicError(new Anthropic.RateLimitError(429, {}, 'slow', h)).code).toBe('rateLimit');
    expect(mapAnthropicError(new Anthropic.APIConnectionError({ message: 'offline' })).code).toBe('network');
    expect(mapAnthropicError(new Anthropic.InternalServerError(529, {}, 'overloaded', h)).code).toBe('server');
    expect(mapAnthropicError(new Anthropic.BadRequestError(400, {}, 'nope', h)).code).toBe('api');
  });

  it('passe par le faux client, sans réseau', async () => {
    const create = vi.fn(async () => message({}));
    const retrieve = vi.fn(async () => ({}));
    const client: AnthropicClientLike = { beta: { messages: { create } }, models: { retrieve } };
    const make = vi.fn(() => client);
    const provider = createAnthropicProvider(make);
    const out = await provider.translate(REQ);
    expect(out.translated).toBe('Bonjour le monde');
    expect(make).toHaveBeenCalledWith('sk-test');
    expect(create.mock.calls[0]).toBeDefined();
    await provider.testKey('sk-test', 'claude-sonnet-5-5');
    expect(retrieve).toHaveBeenCalledWith('claude-sonnet-5-5');

    const failing = createAnthropicProvider(() => ({
      beta: { messages: { create: async () => { throw new Anthropic.AuthenticationError(401, {}, 'x', new Headers()); } } },
      models: { retrieve }
    }));
    await expect(failing.translate(REQ)).rejects.toMatchObject({ code: 'invalidKey' });
  });
});

describe('OpenAI', () => {
  const ok = {
    model: 'gpt-4.1-2025',
    choices: [{ finish_reason: 'stop', message: { content: JSON_OK, refusal: null } }]
  };

  it('construit la requête Chat Completions', () => {
    const { url, init } = buildOpenAiRequest({ ...REQ, model: 'gpt-4.1' });
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'screenshot_translation', strict: true, schema: TRANSLATION_SCHEMA }
    });
    expect(body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,QUJD' }
    });
  });

  it('lit la réponse et ses cas particuliers', () => {
    expect(parseOpenAiResponse(ok, 'gpt-4.1')).toMatchObject({ translated: 'Bonjour le monde', model: 'gpt-4.1-2025' });
    expect(() => parseOpenAiResponse({ choices: [{ message: { refusal: 'no' } }] }, 'm')).toThrow(
      expect.objectContaining({ code: 'refusal' })
    );
    expect(() => parseOpenAiResponse({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }, 'm')).toThrow(
      expect.objectContaining({ code: 'truncated' })
    );
  });

  it('erreurs HTTP et réseau', async () => {
    await expect(createOpenAiProvider(fakeFetch(401, { error: { message: 'Incorrect API key' } })).translate(REQ)).rejects.toMatchObject({ code: 'invalidKey', message: 'Incorrect API key' });
    await expect(createOpenAiProvider(fakeFetch(429, {})).translate(REQ)).rejects.toMatchObject({ code: 'rateLimit' });
    await expect(createOpenAiProvider(fakeFetch(503, {})).translate(REQ)).rejects.toMatchObject({ code: 'server' });
    const offline = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(createOpenAiProvider(offline).translate(REQ)).rejects.toMatchObject({ code: 'network' });
  });

  it('teste la clé avec GET /v1/models', async () => {
    const f = fakeFetch(200, { data: [] });
    await createOpenAiProvider(f).testKey('sk-x', 'gpt-4.1');
    expect(f.calls[0][0]).toBe('https://api.openai.com/v1/models');
    expect(f.calls[0][1].method).toBe('GET');
  });
});

describe('Gemini', () => {
  const ok = {
    modelVersion: 'gemini-2.5-flash',
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON_OK }] } }]
  };

  it('construit la requête generateContent', () => {
    const { url, init } = buildGeminiRequest({ ...REQ, model: 'gemini-2.5-pro' });
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/png', data: 'QUJD' } });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual(['source_language', 'original_text', 'translated_text']);
  });

  it('lit la réponse, le blocage et la coupure', () => {
    expect(parseGeminiResponse(ok, 'g').translated).toBe('Bonjour le monde');
    expect(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }, 'g')).toThrow(
      expect.objectContaining({ code: 'refusal' })
    );
    expect(() => parseGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }, 'g')).toThrow(
      expect.objectContaining({ code: 'truncated' })
    );
  });

  it('reconnaît une clé invalide (400) et les autres erreurs', async () => {
    const bad = { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } };
    await expect(createGeminiProvider(fakeFetch(400, bad)).translate(REQ)).rejects.toMatchObject({ code: 'invalidKey' });
    await expect(createGeminiProvider(fakeFetch(400, { error: { message: 'Bad schema' } })).translate(REQ)).rejects.toMatchObject({ code: 'api' });
    await expect(createGeminiProvider(fakeFetch(429, {})).translate(REQ)).rejects.toMatchObject({ code: 'rateLimit' });
    const f = fakeFetch(200, { models: [] });
    await createGeminiProvider(f).testKey('k', 'gemini-2.5-flash');
    expect(f.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models');
  });
});
