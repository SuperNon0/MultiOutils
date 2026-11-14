import type { AiProviderId, AiUsage } from '../../../common/types';
import { httpError, AiError } from './provider';

/** Keep absent usage unknown instead of reporting a free request. */
export function textUsage(provider: AiProviderId, response: unknown): AiUsage | undefined {
  const r = response as Record<string, unknown> | null;
  const u = (provider === 'gemini' ? r?.usageMetadata : r?.usage) as Record<string, unknown> | undefined;
  if (!u || typeof u !== 'object') return undefined;
  const num = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
  if (provider === 'anthropic') return { inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens), outputTokens: num(u.output_tokens) };
  if (provider === 'openai') return { inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens) };
  return { inputTokens: num(u.promptTokenCount), outputTokens: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount) };
}
export async function textCall(provider: AiProviderId, apiKey: string, model: string, system: string, prompt: string): Promise<{ text: string; model: string; usage?: AiUsage }> {
  const post = async (url: string, headers: Record<string, string>, body: unknown): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw httpError(res.status, json);
    if (!json || typeof json !== 'object') throw new AiError('badResponse');
    return json;
  };
  if (provider === 'anthropic') {
    const j = (await post(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: 4000, system, messages: [{ role: 'user', content: prompt }] }
    )) as { model?: string; content?: Array<{ type: string; text?: string }>; usage?: unknown };
    return { text: (j.content ?? []).map((c) => c.text ?? '').join(''), model: j.model ?? model, usage: textUsage('anthropic', j) };
  }
  if (provider === 'openai') {
    const j = (await post(
      'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${apiKey}` },
      { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }
    )) as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    return { text: j.choices?.[0]?.message?.content ?? '', model: j.model ?? model, usage: textUsage('openai', j) };
  }
  const j = (await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': apiKey },
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }
  )) as { modelVersion?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: unknown };
  return { text: (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? '').join(''), model: j.modelVersion ?? model, usage: textUsage('gemini', j) };
}

