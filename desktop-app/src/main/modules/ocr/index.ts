import { app, ipcMain } from 'electron';
import path from 'node:path';
import { OCR_LANGS, type OcrLang } from '../../../common/types';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { CaptureRepo } from '../../storage/captures';

export type OcrResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Moteur OCR (docs/00 §9.1) : extrait le texte d'une capture via
 * Tesseract (tesseract.js). Le modèle de langue est téléchargé à la première
 * utilisation puis mis en cache localement (usage hors-ligne ensuite) —
 * compromis documenté dans docs/06. Plus d'onglet dédié : l'interface est
 * l'action « Extraire le texte » du menu ⋯ d'une capture (bibliothèque).
 */
export function createOcrMainModule(): MainToolModule {
  return {
    id: 'ocr',

    activate(ctx: MainHostContext): void {
      const repo = new CaptureRepo(ctx.db);

      ipcMain.handle(
        'ocr:extract',
        async (_event, captureId: string, requested?: OcrLang): Promise<OcrResult> => {
          // langue demandée par la feuille, sinon le réglage (Réglages → Capture d'écran)
          const lang: OcrLang = OCR_LANGS.includes(requested as OcrLang)
            ? (requested as OcrLang)
            : ctx.settings.get().ocrLang;
          const capture = repo.get(captureId);
          if (!capture) return { ok: false, error: 'capture introuvable' };
          try {
            // import paresseux : Tesseract n'est chargé qu'au premier usage
            const { createWorker } = await import('tesseract.js');
            const worker = await createWorker(lang, 1, {
              cachePath: path.join(app.getPath('userData'), 'ocr-cache')
            });
            try {
              const { data } = await worker.recognize(capture.path);
              return { ok: true, text: data.text.trim() };
            } finally {
              await worker.terminate();
            }
          } catch (err) {
            return {
              ok: false,
              error: err instanceof Error ? err.message : String(err)
            };
          }
        }
      );
    }
  };
}
