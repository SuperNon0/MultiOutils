import { spawn, type SpawnOptions } from 'node:child_process';
import type { LauncherSettings } from '../../../../common/launcher';
import type { NavigateMsg } from '../../../../common/types';
import { bestMatch } from '../core/matcher';
import { encodePowerShell } from '../core/parsers';

/** Services fournis aux fournisseurs par le module (jamais un autre module). */
export interface LauncherEnv {
  isWin: boolean;
  settings(): LauncherSettings;
  lang(): 'fr' | 'en';
  t(key: string, vars?: Record<string, string | number>): string;
  notify(title: string, body?: string): void;
  showMainWindow(nav?: NavigateMsg): void;
  hasLocalCommand(id: string): boolean;
  runLocalCommand(id: string): Promise<boolean>;
  hideLauncher(): void;
  reindex(): void;
  quitApp(): void;
  copyText(text: string): void;
  openPath(path: string): Promise<string>;
  reveal(path: string): void;
  openExternal(url: string): Promise<void>;
  userDataDir: string;
  history(): string[];
  ownPid: number;
}

/** Texte FR ou EN selon la langue de l'app. */
export const pick = (env: LauncherEnv, fr: string, en: string): string => (env.lang() === 'en' ? en : fr);

/** Correspondance titre/sous-titre/mots-clés → score + surlignage. */
export function matchFields(
  search: string,
  title: string,
  extra: Array<{ text?: string; weight?: number; isSubtitle?: boolean }> = []
): { score: number; titleHl?: number[]; subtitleHl?: number[] } | null {
  const fields = [{ text: title, weight: 1 }, ...extra];
  const m = bestMatch(search, fields);
  if (!m) return null;
  if (m.field === 0) return { score: m.score, titleHl: m.indices };
  if (fields[m.field] && (fields[m.field] as { isSubtitle?: boolean }).isSubtitle) {
    return { score: m.score, subtitleHl: m.indices };
  }
  return { score: m.score };
}

/** Lance un processus détaché (n'attend pas sa fin, ne bloque pas la fermeture). */
export function spawnDetached(cmd: string, args: string[], opts: SpawnOptions = {}): void {
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      ...opts
    });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // commande introuvable : rien à faire
  }
}

/** Exécute et récupère la sortie standard (avec annulation et délai max). */
export function runCapture(
  cmd: string,
  args: string[],
  { signal, timeoutMs = 8000, maxBytes = 4_000_000 }: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    let done = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      reject(err);
      return;
    }
    const end = (err?: unknown): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(out);
    };
    const onAbort = (): void => {
      child.kill();
      end(new Error('annulé'));
    };
    const timer = setTimeout(() => {
      child.kill();
      end(new Error('délai dépassé'));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      out += chunk;
      if (out.length > maxBytes) child.kill();
    });
    child.on('error', (err) => end(err));
    child.on('close', () => end());
  });
}

/** PowerShell sans profil, script encodé (aucun problème de guillemets). */
export function runPowerShell(
  script: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<string> {
  return runCapture(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)],
    opts
  );
}

/** Littéral PowerShell entre apostrophes. */
export const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Lance en administrateur (UAC) via Start-Process -Verb RunAs. */
export function runAsAdmin(file: string, args?: string, cwd?: string): void {
  const parts = [`Start-Process -FilePath ${psQuote(file)} -Verb RunAs`];
  if (args) parts.push(`-ArgumentList ${psQuote(args)}`);
  if (cwd) parts.push(`-WorkingDirectory ${psQuote(cwd)}`);
  void runPowerShell(parts.join(' '), { timeoutMs: 60_000 }).catch(() => undefined);
}
