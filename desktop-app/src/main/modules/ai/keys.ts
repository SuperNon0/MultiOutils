import type { AiProviderId } from '../../../common/types';
import { AiError } from './provider';

/** Chiffrement du système (safeStorage d'Electron : DPAPI sous Windows). */
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

/** Clé/valeur persistant (la table `settings`). */
export interface KeyValue {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const PREFIX = 'enc:';
const storageKey = (provider: AiProviderId): string => `ai.key.${provider}`;

/**
 * Clés API des fournisseurs de traduction, UNE PAR FOURNISSEUR, toujours
 * chiffrées. Jamais en clair dans la base, jamais renvoyées au renderer.
 * Sans chiffrement disponible, on refuse de les enregistrer.
 */
export class AiKeyStore {
  constructor(
    private kv: KeyValue,
    private cipher: Cipher
  ) {}

  get encryptionAvailable(): boolean {
    try {
      return this.cipher.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  has(provider: AiProviderId): boolean {
    return (this.kv.get(storageKey(provider)) ?? '').startsWith(PREFIX);
  }

  /** '' efface la clé. */
  set(provider: AiProviderId, key: string): void {
    const value = key.trim();
    if (!value) {
      this.kv.delete(storageKey(provider));
      return;
    }
    if (!this.encryptionAvailable) throw new AiError('encryptionUnavailable');
    const enc = this.cipher.encryptString(value).toString('base64');
    this.kv.set(storageKey(provider), `${PREFIX}${enc}`);
  }

  get(provider: AiProviderId): string | null {
    const stored = this.kv.get(storageKey(provider));
    if (!stored?.startsWith(PREFIX)) return null;
    try {
      return this.cipher.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'));
    } catch {
      return null;
    }
  }
}
