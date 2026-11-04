import type { AiProviderId } from '../../../common/types';
import { createAnthropicProvider } from './anthropic';
import { createGeminiProvider } from './gemini';
import { createOpenAiProvider } from './openai';
import type { TranslateProvider } from './provider';

/** Les fournisseurs de traduction IA (ajouter ici un nouveau fournisseur). */
export function createProviders(): Record<AiProviderId, TranslateProvider> {
  return {
    anthropic: createAnthropicProvider(),
    openai: createOpenAiProvider(),
    gemini: createGeminiProvider()
  };
}
