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
  type AppSettings
} from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { CaptureRepo } from '../../storage/captures';
import { canSendAsIs, candidateSizes, MAX_IMAGE_BYTES } from './image';
import { AiKeyStore, type KeyValue } from './keys';
import { AiError, cleanTargetLang, pickModel, resolveModel, type TranslateImage } from './provider';
import { pickGeminiModel } from './gemini';
import { createProviders } from './providers';

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
        const apiKey = keys.get(provider);
        if (!apiKey) return { ok: false, error: 'noKey' };
        const p = providers[provider];
        try {
          await p.testKey(apiKey, resolveModel(p.info, ctx.settings.get().aiModels[provider]));
          return { ok: true };
        } catch (err) {
          return fail(err);
        }
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
          const available = await p.listModels(apiKey);
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
        try {
          return await p.listModels(apiKey);
        } catch {
          return [];
        }
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

      ipcMain.handle(
        'ai:translate',
        async (_e, captureId: unknown, targetLang?: unknown): Promise<AiTranslateResult> => {
          const settings = ctx.settings.get();
          const provider = isProvider(settings.aiProvider) ? settings.aiProvider : 'anthropic';
          const p = providers[provider];
          const apiKey = keys.get(provider);
          if (!apiKey) return { ok: false, error: 'noKey' };
          const capture = typeof captureId === 'string' ? repo.get(captureId) : null;
          if (!capture || !fs.existsSync(capture.path)) return { ok: false, error: 'notFound' };
          try {
            const image = prepareImage(capture.path);
            const request = {
              image,
              apiKey,
              model: resolveModel(p.info, settings.aiModels[provider]),
              targetLang: cleanTargetLang(
                typeof targetLang === 'string' ? targetLang : settings.aiTargetLang
              )
            };
            try {
              const result = await p.translate(request);
              save(capture.id, request.targetLang, result);
              return { ok: true, ...result };
            } catch (err) {
              // Modèle retiré ou inconnu (champ libre) : on prend le plus récent
              // proposé par le fournisseur, on réessaie une fois et on le garde.
              const replacement =
                err instanceof AiError && err.code === 'notFound'
                  ? await findReplacement(provider, apiKey, request.model)
                  : null;
              if (!replacement) throw err;
              const result = await p.translate({ ...request, model: replacement });
              save(capture.id, request.targetLang, result);
              ctx.settings.set({ aiModels: { [provider]: replacement } as AppSettings['aiModels'] });
              return { ok: true, ...result };
            }
          } catch (err) {
            return fail(err);
          }
        }
      );
    }
  };
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
