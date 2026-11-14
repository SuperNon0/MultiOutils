import type { AiUsage, AiErrorCode } from '../../../common/types';
import { AiError } from './provider';

export interface MeasuredReply { model: string; usage?: AiUsage }
export interface RequestSink {
  start(): number | null;
  finish(id: number, result: { status: 'success' | 'error'; model?: string; usage?: AiUsage; costUsd: number | null; durationMs: number; error: AiErrorCode | null }): void;
  record(reply: MeasuredReply): number | null;
}

/** Logging never stores prompts, responses, keys or raw provider errors. */
export async function runLoggedRequest<T extends MeasuredReply>(sink: RequestSink, call: () => Promise<T>): Promise<{ result: T; costUsd: number | null }> {
  const began = Date.now();
  let id: number | null = null;
  try { id = sink.start(); } catch { /* logging must not prevent a request */ }
  try {
    const result = await call();
    let costUsd: number | null = null;
    try { costUsd = sink.record(result); } catch { /* preserve the reply */ }
    try { if (id !== null) sink.finish(id, { status: 'success', model: result.model, usage: result.usage, costUsd, durationMs: Date.now() - began, error: null }); } catch { /* preserve the reply */ }
    return { result, costUsd };
  } catch (err) {
    const error = err instanceof AiError ? err.code : err instanceof TypeError ? 'network' : 'api';
    try { if (id !== null) sink.finish(id, { status: 'error', costUsd: null, durationMs: Date.now() - began, error }); } catch { /* preserve the original error */ }
    throw err;
  }
}
