import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Configuration par variables d'environnement (voir install/.env.example). */
export const env = {
  port: Number(process.env.PORT ?? 3010),
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production'
};

export const uploadsDir = path.join(env.dataDir, 'uploads');

export function ensureDirs(): void {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/** Secret de session persistant (généré au premier démarrage). */
export function sessionSecret(): string {
  const file = path.join(env.dataDir, '.session-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // pas encore de secret
  }
  const secret = randomBytes(32).toString('base64url');
  fs.mkdirSync(env.dataDir, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
