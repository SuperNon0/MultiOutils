import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AiProviderInfo, AiTranslation } from '../../../common/types';
import {
  AiError,
  num,
  parseTranslationJson,
  systemPrompt,
  TRANSLATION_SCHEMA,
  userPrompt,
  type TranslateProvider,
  type TranslateRequest
} from './provider';

/** Fournisseur « Claude » (API d'Anthropic, SDK officiel @anthropic-ai/sdk). */
export const ANTHROPIC_INFO: AiProviderInfo = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  models: [
    { id: 'claude-opus-5-5', hint: 'ai.model.precise' },
    { id: 'claude-sonnet-5-5', hint: 'ai.model.faster' },
    { id: 'claude-haiku-5-5', hint: 'ai.model.cheapest' }
  ],
  defaultModel: 'claude-opus-5-5',
  fixedModels: true,
  keyUrl: 'https://platform.claude.com',
  billingUrl: 'https://platform.claude.com/settings/billing'
};

/** Le strict nécessaire du client du SDK (remplaçable par un faux dans les tests). */
export interface AnthropicClientLike {
  beta: { messages: { create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage> } };
  models: { retrieve(id: string): Promise<unknown> };
}

/** Corps de la requête Messages (beta) : image + consigne, réponse en JSON strict. */
export function buildAnthropicParams(req: TranslateRequest): MessageCreateParamsNonStreaming {
  return {
    model: req.model,
    max_tokens: 16000,
    // Repli côté serveur si le modèle décline la demande (catégorie de refus).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: TRANSLATION_SCHEMA }
    },
    system: systemPrompt(req.targetLang),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data }
          },
          { type: 'text', text: userPrompt(req.targetLang) }
        ]
      }
    ]
  };
}

/** Lit la réponse : refus et coupure gérés avant le contenu. */
export function parseAnthropicMessage(message: BetaMessage): AiTranslation {
  if (message.stop_reason === 'refusal') {
    throw new AiError('refusal', message.stop_details?.explanation ?? undefined);
  }
  if (message.stop_reason === 'max_tokens') throw new AiError('truncated');
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  if (!text.trim()) throw new AiError('badResponse', 'empty response');
  const result = parseTranslationJson(text, message.model);
  const u = message.usage as
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      }
    | undefined;
  if (u) {
    result.usage = {
      inputTokens:
        num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
      outputTokens: num(u.output_tokens)
    };
  }
  return result;
}

/** Erreurs typées du SDK → codes clairs (du plus précis au plus général). */
export function mapAnthropicError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError('invalidKey', err.message);
  }
  if (err instanceof Anthropic.RateLimitError) return new AiError('rateLimit', err.message);
  if (err instanceof Anthropic.NotFoundError) return new AiError('notFound', err.message);
  if (err instanceof Anthropic.APIConnectionError) return new AiError('network', err.message);
  if (err instanceof Anthropic.InternalServerError) return new AiError('server', err.message);
  if (err instanceof Anthropic.APIError) {
    if (typeof err.status === 'number' && err.status >= 500) return new AiError('server', err.message);
    return new AiError('api', err.message);
  }
  return new AiError('api', err instanceof Error ? err.message : String(err));
}

export function createAnthropicProvider(
  makeClient: (apiKey: string) => AnthropicClientLike = (apiKey) =>
    new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 })
): TranslateProvider {
  return {
    info: ANTHROPIC_INFO,
    async translate(req) {
      try {
        const message = await makeClient(req.apiKey).beta.messages.create(buildAnthropicParams(req));
        return parseAnthropicMessage(message);
      } catch (err) {
        throw mapAnthropicError(err);
      }
    },
    async testKey(apiKey, model) {
      try {
        // Lecture de la fiche du modèle : vérifie la clé sans consommer de jetons.
        await makeClient(apiKey).models.retrieve(model);
      } catch (err) {
        throw mapAnthropicError(err);
      }
    }
  };
}
