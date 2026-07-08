import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Racines : server/dist → server/ → racine du dépôt (monorepo). */
const serverDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverDir, '..');

export interface UpdateCheck {
  behind: number | null;
  error?: string;
}

/** Nombre de commits de retard sur la branche suivie (dépôt public). */
export async function checkForUpdate(): Promise<UpdateCheck> {
  try {
    await run('git', ['-C', repoRoot, 'fetch', '--quiet'], { timeout: 30_000 });
    const { stdout } = await run(
      'git',
      ['-C', repoRoot, 'rev-list', '--count', 'HEAD..@{upstream}'],
      { timeout: 10_000 }
    );
    return { behind: Number(stdout.trim()) };
  } catch (err) {
    return { behind: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface UpdateResult {
  ok: boolean;
  log: string;
}

/**
 * Bouton « Mettre à jour le site » (docs/00 §7.2, docs/02 §5.2) :
 * git pull + npm install + build. En cas de succès, le processus se termine
 * ensuite pour que systemd / Docker le redémarre sur le nouveau code.
 */
export async function runUpdate(): Promise<UpdateResult> {
  const log: string[] = [];
  const step = async (cmd: string, args: string[], cwd: string): Promise<void> => {
    log.push(`$ ${cmd} ${args.join(' ')}`);
    const { stdout, stderr } = await run(cmd, args, { cwd, timeout: 600_000 });
    if (stdout.trim()) log.push(stdout.trim());
    if (stderr.trim()) log.push(stderr.trim());
  };
  try {
    await step('git', ['pull', '--ff-only'], repoRoot);
    // On installe/compile UNIQUEMENT le serveur, en ignorant le monorepo
    // (--no-workspaces) : inutile — et coûteux — d'installer l'app Electron
    // sur le serveur. --no-package-lock garde l'arbre git propre pour git pull.
    await step(
      'npm',
      ['install', '--no-workspaces', '--no-package-lock', '--no-audit', '--no-fund'],
      serverDir
    );
    await step('npm', ['run', 'build'], serverDir);
    return { ok: true, log: log.join('\n') };
  } catch (err) {
    log.push(err instanceof Error ? err.message : String(err));
    return { ok: false, log: log.join('\n') };
  }
}

/** Redémarrage différé (laisse le temps de répondre à la requête). */
export function scheduleRestart(delayMs = 1500): void {
  setTimeout(() => process.exit(0), delayMs).unref();
}
