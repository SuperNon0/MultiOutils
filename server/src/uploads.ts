import fs from 'node:fs';
import { getSetting, setSetting } from './db';
import { env } from './env';

/**
 * Taille maximale d'envoi (docs/00 §7 · Administration → Taille maximale
 * d'envoi) : réglable depuis l'admin, sans redémarrage. Multer, lui, est
 * configuré une fois au démarrage avec un plafond fixe généreux
 * (UPLOAD_CEILING_MB) qui borne la mémoire tampon ; la limite RÉELLE — celle
 * que l'utilisateur règle — est appliquée après coup dans chaque route via
 * `rejectIfTooLarge`, ce qui permet de la changer à chaud.
 */
export const UPLOAD_CEILING_MB = 1024;

const KEY = 'maxUploadMb';

export function getMaxUploadMb(): number {
  const raw = getSetting(KEY);
  const n = raw !== null ? Number(raw) : env.maxUploadMb;
  return Number.isFinite(n) && n > 0 ? Math.min(n, UPLOAD_CEILING_MB) : env.maxUploadMb;
}

export function setMaxUploadMb(mb: number): number {
  const clamped = Math.min(Math.max(1, Math.round(mb)), UPLOAD_CEILING_MB);
  setSetting(KEY, String(clamped));
  return clamped;
}

/**
 * Rejette (et supprime le fichier temporaire) si au-delà de la limite
 * configurée. Appeler AVANT que la route ne déplace le fichier hors de
 * `.tmp` (les fonctions insert*Clip le font via fs.renameSync).
 */
export function rejectIfTooLarge(file: Express.Multer.File | undefined): boolean {
  if (!file) return false;
  const maxBytes = getMaxUploadMb() * 1024 * 1024;
  if (file.size > maxBytes) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // fichier déjà absent
    }
    return true;
  }
  return false;
}
