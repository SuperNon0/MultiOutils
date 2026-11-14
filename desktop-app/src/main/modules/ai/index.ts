import { ipcMain, nativeImage, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_PROVIDERS,
  type AiConfig,
  type AiProviderId,
  type AiSimpleResult,
  type AiSavedTranslation,
  type AiTranslateResult,
  type AiTranslation,
  type AiUsageEntry,
  type AiUsageSummary,
  type AppSettings
} from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { CaptureRepo } from '../../storage/captures';
import { canSendAsIs, candidateSizes, MAX_IMAGE_BYTES } from './image';
import { AiKeyStore, type KeyValue } from './keys';
import { AiError, cleanTargetLang, httpError, pickModel, resolveModel, type TranslateImage } from './provider';
import { pickGeminiModel } from './gemini';
import { costOf, priceFor } from '../../../common/aiPricing';
import { createProviders } from './providers';
import { summarizeUsage } from './usage';
import { textCall } from './text';
import { runLoggedRequest, type MeasuredReply } from './request-log';
import type { AiRequestEntry, AiRequestOperation } from '../../../common/types';

/**
 * Traduction IA d'une capture (« Traduire (IA) » dans le menu ⋯ de la
 * bibliothèque). Tout se passe ici, dans le process main : la clé API ne
 * quitte jamais ce process (le renderer ne sait que « une clé est enregistrée »).
 */
export function createAiMainModule(): MainToolModule {
  return {
    id: 'ai',

    activate(ctx: MainHostContext): void {
      const repo = new CaptureRepo(ctx.db);
      const providers = createProviders();
      const getStmt = ctx.db.prepare('SELECT value FROM settings WHERE key = ?');
      const setStmt = ctx.db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      );
      const delStmt = ctx.db.prepare('DELETE FROM settings WHERE key = ?');
      const kv: KeyValue = {
        get: (key) => {
          const row = getStmt.get(key) as { value: string } | undefined;
          if (!row) return undefined;
          try {
            const v = JSON.parse(row.value);
            return typeof v === 'string' ? v : undefined;
          } catch {
            return undefined;
          }
        },
        set: (key, value) => void setStmt.run(key, JSON.stringify(value)),
        delete: (key) => void delStmt.run(key)
      };
      const keys = new AiKeyStore(kv, safeStorage);

      const isProvider = (id: unknown): id is AiProviderId =>
        AI_PROVIDERS.includes(id as AiProviderId);
      const fail = (err: unknown): { ok: false; error: AiError['code']; message?: string } => {
        const e = err instanceof AiError ? err : new AiError('api', err instanceof Error ? err.message : String(err));
        return { ok: false, error: e.code, message: e.message !== e.code ? e.message : undefined };
      };

      ipcMain.handle('ai:getConfig', (): AiConfig => ({
        providers: AI_PROVIDERS.map((id) => providers[id].info),
        hasKey: Object.fromEntries(AI_PROVIDERS.map((id) => [id, keys.has(id)])) as AiConfig['hasKey'],
        encryptionAvailable: keys.encryptionAvailable
      }));

      ipcMain.handle('ai:setKey', (_e, provider: unknown, key: unknown): AiSimpleResult => {
        if (!isProvider(provider) || typeof key !== 'string') return { ok: false, error: 'api' };
        try {
          keys.set(provider, key);
          return { ok: true };
        } catch (err) {
          return fail(err);
        }
      });

      ipcMain.handle('ai:testKey', async (_e, provider: unknown): Promise<AiSimpleResult> => {
        if (!isProvider(provider)) return { ok: false, error: 'api' };
        const p = providers[provider];
        const model = resolveModel(p.info, ctx.settings.get().aiModels[provider]);
        try {
          await track(provider, model, 'keyTest', async () => {
            const apiKey = keys.get(provider);
            if (!apiKey) throw new AiError('noKey');
            await p.testKey(apiKey, model);
            return { model, usage: { inputTokens: 0, outputTokens: 0 } };
          });
          return { ok: true };
        } catch (err) { return fail(err); }
      });

      /** Modèle de remplacement quand le modèle demandé n'existe plus. */
      const findReplacement = async (
        provider: AiProviderId,
        apiKey: string,
        current: string
      ): Promise<string | null> => {
        const p = providers[provider];
        if (p.info.fixedModels || !p.listModels) return null;
        try {
          const available = (await track(provider, current, 'models', async () => ({ model: current, models: await p.listModels!(apiKey), usage: { inputTokens: 0, outputTokens: 0 } }))).result.models;
          const pick =
            provider === 'gemini'
              ? pickGeminiModel(available)
              : pickModel(available, /^gpt-[\d.]+$/, /^gpt-[\d.]+(-mini)?$/);
          return pick && pick !== current ? pick : null;
        } catch {
          return null;
        }
      };

      ipcMain.handle('ai:listModels', async (_e, provider: unknown): Promise<string[]> => {
        if (!isProvider(provider)) return [];
        const apiKey = keys.get(provider);
        const p = providers[provider];
        if (!apiKey || !p.listModels) return [];
        const model = resolveModel(p.info, ctx.settings.get().aiModels[provider]);
        try {
          return (await track(provider, model, 'models', async () => ({
            model, models: await p.listModels!(apiKey), usage: { inputTokens: 0, outputTokens: 0 }
          }))).result.models;
        } catch { return []; }
      });

      const getSaved = ctx.db.prepare(
        'SELECT * FROM capture_translations WHERE capture_id = ?'
      );
      const putSaved = ctx.db.prepare(
        `INSERT INTO capture_translations
           (capture_id, target_lang, source_language, original, translated, model, created_at)
         VALUES (@captureId, @targetLang, @sourceLanguage, @original, @translated, @model, @createdAt)
         ON CONFLICT(capture_id) DO UPDATE SET
           target_lang = excluded.target_lang, source_language = excluded.source_language,
           original = excluded.original, translated = excluded.translated,
           model = excluded.model, created_at = excluded.created_at`
      );
      const editSaved = ctx.db.prepare(
        'UPDATE capture_translations SET original = ?, translated = ? WHERE capture_id = ?'
      );
      const save = (captureId: string, targetLang: string, r: AiTranslation): void => {
        putSaved.run({
          captureId,
          targetLang,
          sourceLanguage: r.sourceLanguage,
          original: r.original,
          translated: r.translated,
          model: r.model,
          createdAt: new Date().toISOString()
        });
      };

      ipcMain.handle('ai:getSaved', (_e, captureId: unknown): AiSavedTranslation | null => {
        if (typeof captureId !== 'string') return null;
        const row = getSaved.get(captureId) as
          | {
              target_lang: string;
              source_language: string | null;
              original: string;
              translated: string;
              model: string | null;
              created_at: string;
            }
          | undefined;
        if (!row) return null;
        return {
          targetLang: row.target_lang,
          sourceLanguage: row.source_language ?? '',
          original: row.original,
          translated: row.translated,
          model: row.model ?? '',
          createdAt: row.created_at
        };
      });

      ipcMain.handle('ai:saveEdit', (_e, captureId: unknown, original: unknown, translated: unknown): void => {
        if (typeof captureId !== 'string' || typeof original !== 'string' || typeof translated !== 'string') return;
        editSaved.run(original, translated, captureId);
      });

      // ── Suivi local des dépenses (tokens × prix du modèle) ──────────────
      const putUsage = ctx.db.prepare(
        `INSERT INTO ai_usage (provider, model, input_tokens, output_tokens, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      /** Compte une traduction réussie ; renvoie son coût estimé (null si prix inconnu). */
      const record = (provider: AiProviderId, requested: string, r: MeasuredReply): number | null => {
        if (!r.usage) return null;
        const s = ctx.settings.get();
        const free = provider === 'gemini' && s.aiGeminiFreeTier;
        const price = free
          ? { input: 0, output: 0 }
          : (priceFor(r.model, s.aiPrices) ?? priceFor(requested, s.aiPrices));
        const cost = costOf(r.usage, price);
        try {
          putUsage.run(provider, r.model, r.usage.inputTokens, r.usage.outputTokens, cost, new Date().toISOString());
        } catch {
          // le suivi ne doit jamais faire échouer une traduction
        }
        return cost;
      };


      // Separate from spending totals: failures and requests without usage remain visible.
      ctx.db.exec(`CREATE TABLE IF NOT EXISTS ai_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, operation TEXT NOT NULL,
        model TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
        duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL, error TEXT
      )`);
      ctx.db.prepare("UPDATE ai_requests SET status = 'interrupted' WHERE status = 'running'").run();
      const notifyRequests = (): void => ctx.broadcast('ai:requestsChanged');
      const track = <T extends MeasuredReply>(provider: AiProviderId, model: string, operation: AiRequestOperation, call: () => Promise<T>) =>
        runLoggedRequest({
          start: () => {
            const row = ctx.db.prepare("INSERT INTO ai_requests (provider, operation, model, status, created_at) VALUES (?, ?, ?, 'running', ?)")
              .run(provider, operation, model, new Date().toISOString());
            // Bound the diagnostic journal, independently of cumulative consumption.
            ctx.db.prepare("DELETE FROM ai_requests WHERE status != 'running' AND id NOT IN (SELECT id FROM ai_requests ORDER BY id DESC LIMIT 1000)").run();
            notifyRequests();
            return Number(row.lastInsertRowid);
          },
          record: (reply) => operation === 'keyTest' || operation === 'models' ? 0 : record(provider, model, reply),
          finish: (id, result) => {
            ctx.db.prepare("UPDATE ai_requests SET status = ?, model = COALESCE(?, model), duration_ms = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, error = ? WHERE id = ?")
              .run(result.status, result.model ?? null, result.durationMs, result.usage?.inputTokens ?? null, result.usage?.outputTokens ?? null, result.costUsd, result.error, id);
            notifyRequests();
          }
        }, call);

      ipcMain.handle('ai:requests', (_e, provider?: unknown): AiRequestEntry[] => {
        const rows = (isProvider(provider)
          ? ctx.db.prepare('SELECT * FROM ai_requests WHERE provider = ? ORDER BY id DESC LIMIT 200').all(provider)
          : ctx.db.prepare('SELECT * FROM ai_requests ORDER BY id DESC LIMIT 200').all()) as Array<{
            id: number; provider: AiProviderId; operation: AiRequestOperation; model: string;
            status: AiRequestEntry['status']; created_at: string; duration_ms: number | null;
            input_tokens: number | null; output_tokens: number | null; cost_usd: number | null; error: AiRequestEntry['error'];
          }>;
        return rows.map((r) => ({ id: r.id, provider: r.provider, operation: r.operation, model: r.model,
          status: r.status, createdAt: r.created_at, durationMs: r.duration_ms,
          inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd, error: r.error }));
      });
      ipcMain.handle('ai:clearRequests', () => {
        ctx.db.prepare("DELETE FROM ai_requests WHERE status != 'running'").run();
        notifyRequests();
      });

      ipcMain.handle('ai:getUsage', (_e, provider?: unknown): AiUsageSummary => {
        const rows = (
          isProvider(provider)
            ? ctx.db.prepare('SELECT * FROM ai_usage WHERE provider = ?').all(provider)
            : ctx.db.prepare('SELECT * FROM ai_usage').all()
        ) as Array<{
          id: number;
          provider: AiProviderId;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number | null;
          created_at: string;
        }>;
        const prices = ctx.settings.get().aiPrices;
        const entries: AiUsageEntry[] = rows.map((r) => {
          const usage = { inputTokens: r.input_tokens, outputTokens: r.output_tokens };
          return {
            id: r.id,
            provider: r.provider,
            model: r.model,
            ...usage,
            // prix inconnu au moment de la traduction : on réessaie avec les prix actuels
            costUsd: r.cost_usd ?? costOf(usage, priceFor(r.model, prices, new Date(r.created_at))),
            createdAt: r.created_at
          };
        });
        return summarizeUsage(entries);
      });

      ipcMain.handle('ai:resetUsage', (_e, provider?: unknown): void => {
        if (isProvider(provider)) ctx.db.prepare('DELETE FROM ai_usage WHERE provider = ?').run(provider);
        else ctx.db.prepare('DELETE FROM ai_usage').run();
      });

      ipcMain.handle('ai:translate', async (_e, captureId: unknown, targetLang?: unknown): Promise<AiTranslateResult> => {
        const settings = ctx.settings.get();
        const provider = isProvider(settings.aiProvider) ? settings.aiProvider : 'anthropic';
        const p = providers[provider];
        const model = resolveModel(p.info, settings.aiModels[provider]);
        const apiKey = keys.get(provider);
        const capture = typeof captureId === 'string' ? repo.get(captureId) : null;
        const target = cleanTargetLang(typeof targetLang === 'string' ? targetLang : settings.aiTargetLang);
        const attempt = (requested: string) => track(provider, requested, 'translation', async () => {
          if (!apiKey) throw new AiError('noKey');
          if (!capture || !fs.existsSync(capture.path)) throw new AiError('notFound');
          return p.translate({ image: prepareImage(capture.path), apiKey, model: requested, targetLang: target });
        });
        try {
          let reply;
          try { reply = await attempt(model); }
          catch (err) {
            const replacement = apiKey && err instanceof AiError && err.code === 'notFound'
              ? await findReplacement(provider, apiKey, model) : null;
            if (!replacement) throw err;
            reply = await attempt(replacement);
            ctx.settings.set({ aiModels: { [provider]: replacement } as AppSettings['aiModels'] });
          }
          if (capture) save(capture.id, target, reply.result);
          return { ok: true, ...reply.result, costUsd: reply.costUsd };
        } catch (err) { return fail(err); }
      });

      // Texte libre pour les autres modules (ex. rangement du bureau proposé
      // par l'IA) : même fournisseur, même modèle et même clé que la traduction.
      ctx.events.on('ai:text', (req: AiTextRequest) => {
        void (async () => {
          try {
            const provider = ctx.settings.get().aiProvider;
            const apiKey = keys.get(provider);
            const p = providers[provider];
            const model = resolveModel(p.info, ctx.settings.get().aiModels[provider]);
            const { result } = await track(provider, model, req.operation === 'desktop' ? 'desktop' : 'text',
              async () => {
                if (!apiKey) throw new AiError('noKey');
                return textCall(provider, apiKey, model, req.system, req.prompt);
              });
            req.resolve(result.text);
          } catch (err) {
            req.reject(err instanceof Error ? err : new Error(String(err)));
          }
        })();
      });
    }
  };
}

/** Requête de texte libre envoyée par un autre module via ctx.events ('ai:text'). */
export interface AiTextRequest {
  operation?: 'desktop' | 'text';
  system: string;
  prompt: string;
  resolve(text: string): void;
  reject(err: Error): void;
}

/**
 * Le fichier de la capture, tel quel si possible (PNG, < ~3,7 Mo, ≤ 8000 px) ;
 * sinon réduit avec nativeImage (PNG, puis JPEG si le PNG reste trop lourd).
 */
function prepareImage(file: string): TranslateImage {
  const buf = fs.readFileSync(file);
  const png = path.extname(file).toLowerCase() === '.png';
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) throw new AiError('image');
  const { width, height } = img.getSize();
  if (canSendAsIs({ width, height, bytes: buf.length, png })) {
    return { data: buf.toString('base64'), mediaType: 'image/png' };
  }
  for (const size of candidateSizes(width, height)) {
    const scaled =
      size.width === width && size.height === height
        ? img
        : img.resize({ width: size.width, height: size.height, quality: 'best' });
    const asPng = scaled.toPNG();
    if (asPng.length <= MAX_IMAGE_BYTES) return { data: asPng.toString('base64'), mediaType: 'image/png' };
    const asJpg = scaled.toJPEG(88);
    if (asJpg.length <= MAX_IMAGE_BYTES) return { data: asJpg.toString('base64'), mediaType: 'image/jpeg' };
  }
  throw new AiError('image');
}
