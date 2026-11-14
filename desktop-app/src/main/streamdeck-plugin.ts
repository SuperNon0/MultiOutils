import { app, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { compareVersions, type StreamDeckInstallResult, type StreamDeckPluginInfo } from '../common/types';

const UUID = 'com.supernon0.multioutils';
const PACKAGE = 'MultiOutils-StreamDeck.streamDeckPlugin';
const REPO = 'SuperNon0/MultiOutils';

/** Dossier des plugins de l'application Stream Deck (Elgato). */
function pluginsDir(): string | null {
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Elgato', 'StreamDeck', 'Plugins');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'com.elgato.StreamDeck', 'Plugins');
  return null;
}

/** Ressources Stream Deck livrées avec l'app (extraResources), ou le dépôt en dev. */
function bundledDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'streamdeck') : join(app.getAppPath(), '..', 'streamdeck-plugin', `${UUID}.sdPlugin`);
}

async function manifestVersion(file: string): Promise<string | null> {
  try {
    const raw = (await readFile(file, 'utf8')).replace(/^﻿/, '');
    const v = (JSON.parse(raw) as { Version?: unknown }).Version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function info(): Promise<StreamDeckPluginInfo> {
  const dir = pluginsDir();
  if (!dir) return { supported: false, installed: null, bundled: null, outdated: false };
  const installed = await manifestVersion(join(dir, `${UUID}.sdPlugin`, 'manifest.json'));
  const bundled = await manifestVersion(join(bundledDir(), 'manifest.json'));
  const outdated = !!bundled && (!installed || compareVersions(installed, bundled) < 0);
  return { supported: true, installed, bundled, outdated };
}

/** Le paquet .streamDeckPlugin : celui livré avec l'app, sinon celui de la
 *  release GitHub de cette version (téléchargé dans le dossier temporaire). */
async function packageFile(): Promise<string> {
  const local = join(bundledDir(), PACKAGE);
  if (existsSync(local)) return local;
  const url = `https://github.com/${REPO}/releases/download/v${app.getVersion()}/${PACKAGE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = join(app.getPath('temp'), PACKAGE);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

/**
 * Mise à jour du plugin Stream Deck en un clic (Réglages → Mises à jour) :
 * on ouvre le paquet .streamDeckPlugin, que l'application Stream Deck
 * installe elle-même (remplacement de l'ancienne version compris).
 */
export function setupStreamDeckPlugin(): void {
  ipcMain.handle('streamdeck:info', () => info());
  ipcMain.handle('streamdeck:install', async (): Promise<StreamDeckInstallResult> => {
    if (!pluginsDir()) return { ok: false, error: 'unsupported' };
    try {
      const file = await packageFile();
      const err = await shell.openPath(file);
      return err ? { ok: false, error: err } : { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
