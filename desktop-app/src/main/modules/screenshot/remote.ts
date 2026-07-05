import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Capture, CaptureUploadMeta } from '@multioutils/shared';
import type { RemoteConfig, RemoteTestResult } from '../../../common/types';
import type { MainHostContext } from '../../module-registry';
import type { CaptureRepo } from '../../storage/captures';
import type { FolderRepo } from '../../storage/folders';

const URL_KEY = 'remote.url';
const TOKEN_KEY = 'remote.tokenEnc';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

/**
 * Client du serveur distant (docs/00 §6, docs/04) : l'app POUSSE les captures
 * choisies, UNIQUEMENT sur action explicite. Le jeton est stocké chiffré via
 * safeStorage (DPAPI sous Windows) et n'est jamais renvoyé au renderer.
 */
export class RemoteClient {
  constructor(
    private ctx: MainHostContext,
    private repo: CaptureRepo,
    private folders: FolderRepo
  ) {}

  private kvGet(key: string): string | null {
    const row = this.ctx.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private kvSet(key: string, value: string | null): void {
    if (value === null) {
      this.ctx.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    } else {
      this.ctx.db
        .prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        .run(key, value);
    }
  }

  getConfig(): RemoteConfig {
    return {
      url: this.kvGet(URL_KEY) ?? '',
      hasToken: this.kvGet(TOKEN_KEY) !== null
    };
  }

  /** token : undefined = inchangé · '' = effacé · sinon remplacé. */
  setConfig(url: string, token?: string): void {
    this.kvSet(URL_KEY, url.trim().replace(/\/+$/, ''));
    if (token === undefined) return;
    if (token === '') {
      this.kvSet(TOKEN_KEY, null);
      return;
    }
    const value = safeStorage.isEncryptionAvailable()
      ? `enc:${safeStorage.encryptString(token).toString('base64')}`
      : `plain:${token}`;
    this.kvSet(TOKEN_KEY, value);
  }

  private readToken(): string | null {
    const stored = this.kvGet(TOKEN_KEY);
    if (!stored) return null;
    if (stored.startsWith('enc:')) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
      } catch {
        return null;
      }
    }
    if (stored.startsWith('plain:')) return stored.slice(6);
    return null;
  }

  /** « Tester la connexion » (docs/02 §4) : santé du serveur PUIS jeton. */
  async test(): Promise<RemoteTestResult> {
    const { url } = this.getConfig();
    const token = this.readToken();
    if (!url) return { ok: false, error: 'unreachable' };
    let version: string;
    try {
      const res = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { ok: false, error: 'unreachable' };
      version = ((await res.json()) as { version?: string }).version ?? '?';
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    if (!token) return { ok: false, error: 'badToken', version };
    try {
      const res = await fetch(`${url}/api/captures?page=1`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000)
      });
      return res.ok
        ? { ok: true, version }
        : { ok: false, error: 'badToken', version };
    } catch {
      return { ok: false, error: 'unreachable', version };
    }
  }

  /** Chemin lisible du dossier (« Travail / Projet A ») pour le miroir web. */
  private folderPath(folderId: string | null): string | null {
    if (!folderId) return null;
    const all = this.folders.list();
    const parts: string[] = [];
    let current = all.find((f) => f.id === folderId);
    let guard = 0;
    while (current && guard++ < 20) {
      parts.unshift(current.name);
      const parentId: string | null = current.parentId;
      current = parentId ? all.find((f) => f.id === parentId) : undefined;
    }
    return parts.length > 0 ? parts.join(' / ') : null;
  }

  private async sendOne(capture: Capture, url: string, token: string): Promise<void> {
    const buffer = await fs.promises.readFile(capture.path);
    const ext = path.extname(capture.path).toLowerCase();
    const meta: CaptureUploadMeta = {
      filename: capture.filename,
      createdAt: capture.createdAt,
      width: capture.width,
      height: capture.height,
      folder: this.folderPath(capture.folderId),
      tags: this.repo.tagsFor(capture.id).map((t) => t.name)
    };
    const form = new FormData();
    form.append(
      'file',
      new Blob([buffer], { type: MIME_BY_EXT[ext] ?? 'image/png' }),
      capture.filename
    );
    form.append('meta', JSON.stringify(meta));

    const res = await fetch(`${url}/api/captures`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60_000)
    });
    if (res.status !== 201) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { id: string };
    this.repo.setRemoteState(capture.id, 'sent', body.id);
  }

  /** Envoi explicite (bouton) d'une ou plusieurs captures. */
  async sendMany(ids: string[]): Promise<{ sent: number; failed: number }> {
    const { t } = this.ctx.i18n;
    const { url } = this.getConfig();
    const token = this.readToken();
    if (!url || !token) {
      this.ctx.notify(t('remote.notConfigured'));
      return { sent: 0, failed: ids.length };
    }
    let sent = 0;
    let failed = 0;
    for (const id of ids) {
      const capture = this.repo.get(id);
      if (!capture || capture.deletedAt) continue;
      try {
        await this.sendOne(capture, url, token);
        sent += 1;
      } catch {
        this.repo.setRemoteState(id, 'error', null);
        failed += 1;
      }
      this.ctx.broadcast('library:changed');
    }
    if (failed > 0) {
      this.ctx.notify(t('notif.sendErrors', { n: failed }));
    } else if (sent > 0) {
      this.ctx.notify(
        sent === 1 ? t('notif.sent') : t('notif.sentMany', { n: sent })
      );
    }
    return { sent, failed };
  }
}
