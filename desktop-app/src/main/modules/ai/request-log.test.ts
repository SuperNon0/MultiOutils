import { describe, expect, it, vi } from 'vitest';
import { runLoggedRequest, type RequestSink } from './request-log';
import { AiError } from './provider';
import { textUsage, textCall } from './text';

const sink = (): RequestSink => ({ start: vi.fn(() => 42), finish: vi.fn(), record: vi.fn(() => .25) });
describe('request journal lifecycle', () => {
  it('records the actual model, usage and cost on completion', async () => {
    const log = sink();
    const result = { model: 'actual-model', usage: { inputTokens: 100, outputTokens: 20 }, text: 'reply' };
    expect(await runLoggedRequest(log, async () => result)).toEqual({ result, costUsd: .25 });
    expect(log.finish).toHaveBeenCalledWith(42, expect.objectContaining({ status: 'success', model: 'actual-model', usage: result.usage, costUsd: .25 }));
  });
  it('records failure codes without keys or raw provider error messages', async () => {
    const log = sink();
    await expect(runLoggedRequest(log, async () => { throw new AiError('invalidKey', 'secret-provider-message'); })).rejects.toThrow();
    expect(log.record).not.toHaveBeenCalled();
    expect(log.finish).toHaveBeenCalledWith(42, expect.objectContaining({ status: 'error', error: 'invalidKey', costUsd: null }));
    expect(JSON.stringify(vi.mocked(log.finish).mock.calls)).not.toContain('secret-provider-message');
  });
  it('does not discard a valid answer when journal storage fails', async () => {
    const log = sink();
    log.start = () => { throw new Error('disk'); };
    log.record = () => { throw new Error('disk'); };
    expect((await runLoggedRequest(log, async () => ({ model: 'x' }))).result.model).toBe('x');
  });
});
describe('text request usage', () => {
  it('counts provider-specific tokens, including caching and reasoning', () => {
    expect(textUsage('anthropic', { usage: { input_tokens: 5, cache_read_input_tokens: 7, output_tokens: 3 } })).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(textUsage('openai', { usage: { prompt_tokens: 10, completion_tokens: 20 } })).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(textUsage('gemini', { usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2, thoughtsTokenCount: 4 } })).toEqual({ inputTokens: 8, outputTokens: 6 });
    expect(textUsage('openai', {})).toBeUndefined();
  });
  it('returns text, actual model and tokens from a text request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      model: 'actual', choices: [{ message: { content: 'zones' } }], usage: { prompt_tokens: 10, completion_tokens: 5 }
    }), { status: 200 }));
    try {
      expect(await textCall('openai', 'test-key', 'requested', 'system', 'prompt')).toEqual({
        text: 'zones', model: 'actual', usage: { inputTokens: 10, outputTokens: 5 }
      });
    } finally { fetcher.mockRestore(); }
  });
});
