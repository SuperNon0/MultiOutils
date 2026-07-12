import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from './env';

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

// ── Mise à jour en ARRIÈRE-PLAN + état consultable ─────────────────────────
// La requête POST répond immédiatement et la page /admin/update/status suit
// la progression : indispensable derrière Cloudflare Tunnel (délai HTTP
// ~100 s) alors que npm install + build prennent plusieurs minutes.

export interface UpdateState {
  status: 'idle' | 'running' | 'ok' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  log: string;
}

const state: UpdateState = { status: 'idle', startedAt: null, finishedAt: null, log: '' };

export function updateState(): UpdateState {
  return { ...state };
}

function persistLog(): void {
  try {
    fs.writeFileSync(
      path.join(env.dataDir, 'last-update.log'),
      `# ${state.startedAt} → ${state.finishedAt} · ${state.status}\n${state.log}\n`
    );
  } catch {
    // le log persistant est best-effort
  }
}

/**
 * Bouton « Mettre à jour le site » (docs/00 §7.2, docs/02 §5.2) :
 * git pull + npm install + build, PUIS redémarrage du service.
 * Retourne false si une mise à jour est déjà en cours.
 */
export function startUpdate(): boolean {
  if (state.status === 'running') return false;
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.log = '';

  // ⚠️ Le service tourne avec NODE_ENV=production (EnvironmentFile). Si npm
  // l'hérite, `npm install` SUPPRIME les devDependencies… dont TypeScript,
  // indispensable au build → « tsc: not found ». On retire NODE_ENV de
  // l'environnement des étapes et on force --include=dev.
  const { NODE_ENV: _omitted, ...childEnv } = process.env;

  const step = async (cmd: string, args: string[], cwd: string): Promise<void> => {
    state.log += `$ ${cmd} ${args.join(' ')}\n`;
    const { stdout, stderr } = await run(cmd, args, {
      cwd,
      timeout: 600_000,
      env: childEnv
    });
    if (stdout.trim()) state.log += `${stdout.trim()}\n`;
    if (stderr.trim()) state.log += `${stderr.trim()}\n`;
  };

  void (async () => {
    try {
      await step('git', ['pull', '--ff-only'], repoRoot);
      // On installe/compile UNIQUEMENT le serveur, en ignorant le monorepo
      // (--no-workspaces) : inutile — et coûteux — d'installer l'app Electron
      // sur le serveur. --no-package-lock garde l'arbre git propre.
      await step(
        'npm',
        [
          'install',
          '--no-workspaces',
          '--include=dev',
          '--no-package-lock',
          '--no-audit',
          '--no-fund'
        ],
        serverDir
      );
      await step('npm', ['run', 'build'], serverDir);
      state.status = 'ok';
      state.finishedAt = new Date().toISOString();
      state.log += 'Mise à jour appliquée — redémarrage du service…\n';
      persistLog();
      scheduleRestart();
    } catch (err) {
      state.log += `${err instanceof Error ? err.message : String(err)}\n`;
      state.status = 'failed';
      state.finishedAt = new Date().toISOString();
      persistLog();
    }
  })();
  return true;
}

/**
 * Redémarrage fiable du service.
 *
 * ⚠️ Un simple process.exit(0) ne suffit PAS sous systemd : avec
 * Restart=on-failure (unités historiques), une sortie propre n'est JAMAIS
 * relancée → site mort après une mise à jour réussie. On passe donc par un
 * timer transitoire systemd (systemd-run), qui vit HORS de notre cgroup et
 * exécute `systemctl restart` après notre mort. Sans systemd (Docker), on
 * retombe sur exit(0) : la politique `restart: unless-stopped` relance.
 */
export function scheduleRestart(delayMs = 2000): void {
  setTimeout(() => {
    try {
      const child = spawn(
        'systemd-run',
        ['--on-active=2', '--timer-property=AccuracySec=1s', 'systemctl', 'restart', 'multioutils'],
        { detached: true, stdio: 'ignore' }
      );
      child.on('error', () => process.exit(0)); // systemd-run absent (Docker)
      child.on('exit', (code) => {
        if (code === 0) process.exit(0); // le timer transitoire prend le relais
        else process.exit(1); // dernier recours : sortie en échec → Restart=on-failure relance
      });
      child.unref();
    } catch {
      process.exit(0);
    }
  }, delayMs).unref();
}
