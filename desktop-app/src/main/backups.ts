/**
 * Sauvegardes locales SQLite. Les captures originales restent dans leur dossier:
 * une sauvegarde de la base ne copie PAS les images ni les fichiers externes.
 * Les secrets safeStorage restent chiffrés pour le compte Windows d'origine.
 */
import { app, dialog, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const KEEP = 7;
const PREFIX = 'multioutils-auto-';
const STAGED = 'restore-pending.sqlite';

function backupDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}
function dbPath(): string {
  return path.join(app.getPath('userData'), 'multioutils.db');
}
function validate(file: string): void {
  const source = new Database(file, { readonly: true, fileMustExist: true });
  try {
    if (source.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('La base de sauvegarde est corrompue.');
    }
    const required = ['settings', 'captures', 'folders', 'tags'];
    const tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    if (!required.every((name) => tables.some((table) => table.name === name))) {
      throw new Error('Ce fichier ne correspond pas à une sauvegarde MultiOutils.');
    }
  } finally {
    source.close();
  }
}

/**
 * Appliqué avant l'ouverture de la base par les modules. Garde une copie
 * de secours de l'ancienne base avant de remplacer quoi que ce soit.
 */
export function applyPendingRestore(): void {
  const pending = path.join(app.getPath('userData'), STAGED);
  if (!fs.existsSync(pending)) return;
  try {
    validate(pending);
  } catch (error) {
    // Ne pas empêcher MultiOutils de démarrer à chaque relance lorsqu'une
    // sauvegarde en attente a été corrompue ou modifiée entre deux lancements.
    fs.mkdirSync(backupDir(), { recursive: true });
    const rejected = path.join(backupDir(), `restauration-invalide-${Date.now()}.sqlite`);
    fs.renameSync(pending, rejected);
    dialog.showErrorBox(
      'Restauration annulée',
      `La sauvegarde n'a pas été appliquée car elle est invalide. La base actuelle reste intacte.\\nCopie conservée : ${rejected}\\n${String(error)}`
    );
    return;
  }
  const target = dbPath();
  const backup = path.join(backupDir(), `avant-restauration-${Date.now()}.sqlite`);
  fs.mkdirSync(backupDir(), { recursive: true });
  if (fs.existsSync(target)) {
    const old = new Database(target);
    try {
      void old.pragma('wal_checkpoint(TRUNCATE)');
      // La sauvegarde SQLite inclut toutes les transactions validées, même en WAL.
      // Elle constitue le point de retour en cas de problème.
      // NOTE: cette étape est synchrone côté initialisation.
      old.pragma('journal_mode = DELETE');
    } finally {
      old.close();
    }
    fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
    validate(backup);
  }
  // Préparer un nouveau fichier avant de remplacer la base actuelle. Si la
  // copie échoue, la base active reste intacte.
  const replacement = `${target}.restoring`;
  fs.copyFileSync(pending, replacement);
  try {
    validate(replacement);
    fs.renameSync(replacement, target);
    fs.rmSync(pending);
  } finally {
    if (fs.existsSync(replacement)) fs.rmSync(replacement);
  }
}

export function registerBackups(db: Database.Database): void {
  let busy = false;
  const automatic = async (): Promise<void> => {
    if (busy) return;
    const dir = backupDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const name = `${PREFIX}${new Date().toISOString().slice(0, 10)}.sqlite`;
    const dest = path.join(dir, name);
    if (fs.existsSync(dest)) return;
    busy = true;
    const temporary = path.join(dir, `${name}.tmp`);
    try {
      await db.backup(temporary);
      validate(temporary);
      fs.renameSync(temporary, dest);
      const names = (await fs.promises.readdir(dir)).filter((v) => /^multioutils-auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(v)).sort().reverse();
      for (const old of names.slice(KEEP)) await fs.promises.rm(path.join(dir, old));
    } finally {
      if (fs.existsSync(temporary)) await fs.promises.rm(temporary, { force: true });
      busy = false;
    }
  };

  ipcMain.handle('backup:create', async () => {
    if (busy) return { ok: false, error: 'Sauvegarde en cours' };
    const out = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), `MultiOutils-${new Date().toISOString().slice(0, 10)}.sqlite`),
      filters: [{ name: 'Sauvegarde MultiOutils', extensions: ['sqlite'] }]
    });
    if (out.canceled || !out.filePath) return { ok: false, canceled: true };
    busy = true;
    try {
      await db.backup(out.filePath);
      return { ok: true, path: out.filePath };
    } catch (e) {
      return { ok: false, error: String(e) };
    } finally {
      busy = false;
    }
  });

  ipcMain.handle('backup:restore', async () => {
    if (busy) return { ok: false, error: 'Sauvegarde en cours' };
    const input = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Sauvegarde MultiOutils', extensions: ['sqlite', 'db'] }]
    });
    if (input.canceled || !input.filePaths[0]) return { ok: false, canceled: true };
    try {
      validate(input.filePaths[0]);
      const confirmation = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Annuler', 'Restaurer et redémarrer'],
        defaultId: 0,
        cancelId: 0,
        title: 'Restaurer MultiOutils',
        message: 'Remplacer les réglages et la bibliothèque locale par cette sauvegarde ?',
        detail: "Une copie de secours de la base actuelle sera conservée. Les captures et fichiers physiques ne sont pas remplacés. Les clés chiffrées peuvent nécessiter une nouvelle connexion sur un autre PC."
      });
      if (confirmation.response !== 1) return { ok: false, canceled: true };
      const staged = path.join(app.getPath('userData'), STAGED);
      // Ne jamais remplacer le fichier courant pendant que SQLite est ouverte.
      await fs.promises.copyFile(input.filePaths[0], staged);
      app.relaunch();
      app.quit();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('backup:status', () => ({
    automaticFolder: backupDir(),
    latest: fs.existsSync(backupDir())
      ? fs.readdirSync(backupDir()).filter((v) => v.startsWith(PREFIX)).sort().reverse()[0] ?? null
      : null,
    retention: KEEP
  }));

  // Sauvegarde au lancement : pas de timer permanent ni d'accès au réseau.
  void automatic().catch((e) => console.error('[backups] Échec de la sauvegarde quotidienne', e));
}
