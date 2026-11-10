import { describe, expect, it } from 'vitest';
import { baseModel, costOf, KNOWN_PRICES, priceFor } from '../../../common/aiPricing';
import type { AiUsageEntry } from '../../../common/types';
import { parseAnthropicMessage } from './anthropic';
import { parseGeminiResponse } from './gemini';
import { parseOpenAiResponse } from './openai';
import { summarizeUsage } from './usage';

const JSON_OK = JSON.stringify({ source_language: 'Anglais', original_text: 'Hi', translated_text: 'Salut' });

describe('jetons renvoyés par chaque fournisseur', () => {
  it('Gemini : la réflexion compte en sortie', () => {
    const r = parseGeminiResponse(
      {
        modelVersion: 'gemini-3.8-flash',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON_OK }] } }],
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80, thoughtsTokenCount: 20 }
      },
      'gemini-3.8-flash'
    );
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 100 });
  });

  it('OpenAI', () => {
    const r = parseOpenAiResponse(
      {
        model: 'gpt-4.1-2025-04-14',
        choices: [{ finish_reason: 'stop', message: { content: JSON_OK } }],
        usage: { prompt_tokens: 900, completion_tokens: 50 }
      },
      'gpt-4.1'
    );
    expect(r.usage).toEqual({ inputTokens: 900, outputTokens: 50 });
  });

  it('Claude : le cache compte en entrée', () => {
    const r = parseAnthropicMessage({
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON_OK }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 40, cache_creation_input_tokens: 10, cache_read_input_tokens: null }
    } as never);
    expect(r.usage).toEqual({ inputTokens: 1010, outputTokens: 40 });
  });

  it('pas de jetons dans la réponse : pas de usage', () => {
    const r = parseOpenAiResponse({ choices: [{ message: { content: JSON_OK } }] }, 'gpt-4.1');
    expect(r.usage).toBeUndefined();
  });
});

describe('prix des modèles', () => {
  const known = Object.keys(KNOWN_PRICES);
  it('rattache les suffixes de date ou de version, pas les variantes', () => {
    expect(baseModel('gpt-4.1-2025-04-14', known)).toBe('gpt-4.1');
    expect(baseModel('gpt-4.1-mini', known)).toBe('gpt-4.1-mini');
    expect(baseModel('gpt-4.1-mini-2025-04-14', known)).toBe('gpt-4.1-mini');
    expect(baseModel('gemini-3.8-flash-001', known)).toBe('gemini-3.8-flash');
    expect(baseModel('gemini-3.8-flash-lite', known)).toBeNull();
    expect(baseModel('gemini-3.8-pro', known)).toBeNull();
  });

  it('Gemini 3.8 Flash : tarif doublé au 1er janvier 2027', () => {
    expect(priceFor('gemini-3.8-flash', {}, new Date('2026-11-09T12:00:00Z'))).toEqual({ input: 0.75, output: 3.75 });
    expect(priceFor('gemini-3.8-flash', {}, new Date('2027-01-02T12:00:00Z'))).toEqual({ input: 1.5, output: 7.5 });
  });

  it('le prix des Réglages passe avant le tableau', () => {
    expect(priceFor('gemini-3.8-flash', { 'gemini-3.8-flash': { input: 0, output: 0 } })).toEqual({ input: 0, output: 0 });
    expect(priceFor('gemini-3.8-pro', { 'gemini-3.8-pro': { input: 2, output: 12 } })).toEqual({ input: 2, output: 12 });
    expect(priceFor('modele-inconnu')).toBeNull();
  });

  it('coût = jetons × prix par million', () => {
    expect(costOf({ inputTokens: 1_000_000, outputTokens: 500_000 }, { input: 2, output: 8 })).toBe(6);
    expect(costOf({ inputTokens: 10, outputTokens: 10 }, null)).toBeNull();
  });
});

describe('résumé des dépenses', () => {
  const e = (id: number, createdAt: string, costUsd: number | null): AiUsageEntry => ({
    id,
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    inputTokens: 100,
    outputTokens: 10,
    costUsd,
    createdAt
  });

  it('sépare le mois en cours du total et trie l\'historique', () => {
    const now = new Date(2026, 10, 9, 12);
    const s = summarizeUsage(
      [
        e(1, new Date(2026, 9, 20).toISOString(), 0.5),
        e(2, new Date(2026, 10, 2).toISOString(), 0.25),
        e(3, new Date(2026, 10, 8).toISOString(), null)
      ],
      now
    );
    expect(s.month).toEqual({ count: 2, inputTokens: 200, outputTokens: 20, costUsd: 0.25, unpriced: 1 });
    expect(s.total.count).toBe(3);
    expect(s.total.costUsd).toBe(0.75);
    expect(s.since).toBe(new Date(2026, 9, 20).toISOString());
    expect(s.recent.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('vide', () => {
    const s = summarizeUsage([]);
    expect(s.total.count).toBe(0);
    expect(s.since).toBeNull();
    expect(s.recent).toEqual([]);
  });
});
