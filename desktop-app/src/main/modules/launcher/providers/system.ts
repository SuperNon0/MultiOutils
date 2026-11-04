/**
 * Fournisseurs « système » : commandes (plugin Sys), Paramètres Windows
 * (plugin WindowsSettings), shell (plugin Shell), tueur de processus (plugin
 * ProcessKiller) et outils MultiOutils.
 */
import { spawn } from 'node:child_process';
import type { LauncherAction, LauncherExecMode, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import {
  SYSTEM_COMMANDS,
  TOOL_ENTRIES,
  WINDOWS_SETTINGS,
  type SystemCommand,
  type ToolEntry,
  type WinSetting
} from '../core/catalog';
import { fuzzyMatch } from '../core/matcher';
import { groupProcesses, parsePsOutput, parseTasklistCsv, type ProcessGroup } from '../core/parsers';
import { matchFields, pick, runAsAdmin, runCapture, runPowerShell, spawnDetached, type LauncherEnv } from './env';

// ── Commandes système ─────────────────────────────────────────────────────

async function runSystem(env: LauncherEnv, id: SystemCommand['id']): Promise<void> {
  const win = env.isWin;
  switch (id) {
    case 'shutdown':
      if (win) spawnDetached('shutdown', ['/s', '/t', '0']);
      else spawnDetached('systemctl', ['poweroff']);
      return;
    case 'restart':
      if (win) spawnDetached('shutdown', ['/r', '/t', '0']);
      else spawnDetached('systemctl', ['reboot']);
      return;
    case 'restartAdvanced':
      if (win) spawnDetached('shutdown', ['/r', '/o', '/t', '0']);
      return;
    case 'logoff':
      if (win) spawnDetached('shutdown', ['/l']);
      else spawnDetached('loginctl', ['terminate-session', process.env.XDG_SESSION_ID ?? '']);
      return;
    case 'lock':
      if (win) spawnDetached('rundll32.exe', ['user32.dll,LockWorkStation']);
      else spawnDetached('loginctl', ['lock-session']);
      return;
    case 'sleep':
      if (win) {
        // SetSuspendState(hibernate=false, force=false, wakeup=false)
        await runPowerShell(
          'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)',
          { timeoutMs: 15_000 }
        ).catch(() => undefined);
      } else spawnDetached('systemctl', ['suspend']);
      return;
    case 'hibernate':
      if (win) spawnDetached('shutdown', ['/h']);
      return;
    case 'emptyBin':
      if (win) {
        await runPowerShell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', { timeoutMs: 60_000 }).catch(
          () => undefined
        );
        env.notify(env.t('launcher.sys.binEmptied'));
      }
      return;
    case 'openBin':
      spawnDetached('explorer.exe', ['shell:RecycleBinFolder']);
      return;
    case 'settings':
      await env.openExternal('ms-settings:');
      return;
    case 'controlPanel':
      spawnDetached('control.exe', []);
      return;
    case 'taskManager':
      spawnDetached('taskmgr.exe', []);
      return;
    case 'explorer':
      spawnDetached('explorer.exe', []);
      return;
    case 'appOpen':
      env.showMainWindow();
      return;
    case 'appSettings':
      env.showMainWindow({ view: 'settings' });
      return;
    case 'launcherSettings':
      env.showMainWindow({ view: 'tool', toolId: 'launcher' });
      return;
    case 'launcherReindex':
      env.reindex();
      env.notify(env.t('launcher.sys.reindexing'));
      return;
    case 'appData':
      void env.openPath(env.userDataDir);
      return;
    case 'appQuit':
      env.quitApp();
      return;
  }
}

export function createSystemProvider(env: LauncherEnv): Provider {
  return {
    id: 'system',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      const search = parsed.search;
      if (!search) return [];
      const out: ProviderItem[] = [];
      for (const c of SYSTEM_COMMANDS) {
        if (c.winOnly && !env.isWin) continue;
        const title = pick(env, c.fr, c.en);
        const m = matchFields(search, title, [
          { text: env.lang() === 'en' ? c.fr : c.en, weight: 0.9 },
          { text: c.keywords, weight: 0.7 }
        ]);
        if (!m) continue;
        out.push({
          title,
          subtitle: pick(env, c.subFr, c.subEn),
          icon: { kind: 'sprite', name: c.icon },
          score: m.score,
          titleHl: m.titleHl,
          recordKey: c.id,
          confirm: c.confirm ? env.t('launcher.sys.confirm', { action: title.toLowerCase() }) : undefined,
          data: c
        });
      }
      return out;
    },
    execute(item): LauncherOutcome {
      void runSystem(env, (item.data as SystemCommand).id);
      return { kind: 'hide' };
    }
  };
}

// ── Paramètres Windows ────────────────────────────────────────────────────

export function createWinSettingsProvider(env: LauncherEnv): Provider {
  const open = (s: WinSetting): void => {
    if (s.kind === 'settings') {
      void env.openExternal(s.target);
      return;
    }
    const [cmd, ...args] = s.target.split(' ');
    if (cmd.endsWith('.msc')) spawnDetached('mmc.exe', [cmd]);
    else spawnDetached(cmd === 'control' ? 'control.exe' : cmd, args);
  };
  return {
    id: 'winsettings',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      if (!env.isWin || !parsed.search) return [];
      const out: ProviderItem[] = [];
      const en = env.lang() === 'en';
      for (const s of WINDOWS_SETTINGS) {
        const title = en ? s.en : s.fr;
        const m = matchFields(parsed.search, title, [
          { text: en ? s.fr : s.en, weight: 0.9 },
          { text: s.keywords, weight: 0.6 }
        ]);
        if (!m) continue;
        out.push({
          title,
          subtitle: `${en ? s.area.en : s.area.fr} · ${s.target}`,
          icon: { kind: 'sprite', name: s.kind === 'settings' ? 'gear' : 'wrench' },
          score: m.score,
          // un réglage passe après un programme au score égal
          priority: -10,
          titleHl: m.titleHl,
          recordKey: s.target,
          data: s
        });
      }
      return out;
    },
    execute(item): LauncherOutcome {
      open(item.data as WinSetting);
      return { kind: 'hide' };
    }
  };
}

// ── Shell ─────────────────────────────────────────────────────────────────

export function createShellProvider(
  env: LauncherEnv,
  shellHistory: () => Array<{ cmd: string; count: number }>,
  remember: (cmd: string) => void
): Provider {
  const run = (cmd: string, mode: LauncherExecMode): void => {
    remember(cmd);
    const { kind, keepOpen } = env.settings().shell;
    if (!env.isWin) {
      const child = spawn('/bin/sh', ['-c', cmd], { detached: true, stdio: 'ignore' });
      child.on('error', () => undefined);
      child.unref();
      return;
    }
    // detached : Windows donne à la console sa propre fenêtre visible
    if (kind === 'powershell') {
      if (mode === 'admin') runAsAdmin('powershell.exe', `${keepOpen ? '-NoExit ' : ''}-Command ${cmd}`);
      else spawnDetached('powershell.exe', [...(keepOpen ? ['-NoExit'] : []), '-Command', cmd]);
      return;
    }
    const flag = keepOpen ? '/k' : '/c';
    if (mode === 'admin') runAsAdmin('cmd.exe', `${flag} ${cmd}`);
    // la commande est transmise telle quelle à cmd (pas de ré-échappement)
    else spawnDetached('cmd.exe', [flag, cmd], { windowsVerbatimArguments: true });
  };

  return {
    id: 'shell',
    global: false,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      const search = parsed.search;
      const shellName = env.settings().shell.kind === 'powershell' ? 'PowerShell' : 'cmd';
      const out: ProviderItem[] = [];
      if (search) {
        out.push({
          title: search,
          subtitle: env.t('launcher.shell.run', { shell: shellName }),
          icon: { kind: 'sprite', name: 'zap' },
          score: 1000,
          noRecord: true,
          recordKey: `run:${search}`,
          canAdmin: env.isWin,
          secondary: env.isWin ? env.t('launcher.action.admin') : undefined,
          data: search
        });
      }
      for (const h of shellHistory()) {
        if (h.cmd === search) continue;
        const m = search ? fuzzyMatch(search, h.cmd, 0) : { success: true, score: 50, indices: [] as number[] };
        if (!m.success) continue;
        out.push({
          title: h.cmd,
          subtitle: env.t('launcher.shell.history', { n: h.count }),
          icon: { kind: 'sprite', name: 'clock' },
          score: m.score + Math.min(50, h.count),
          titleHl: m.indices,
          recordKey: `hist:${h.cmd}`,
          autoComplete: `${parsed.keyword}${parsed.keyword && /\w$/.test(parsed.keyword) ? ' ' : ''}${h.cmd}`,
          canAdmin: env.isWin,
          data: h.cmd
        });
      }
      return out;
    },
    execute(item, mode): LauncherOutcome {
      // Ctrl+Entrée = en administrateur aussi (action secondaire du shell)
      run(String(item.data), mode === 'secondary' ? 'admin' : mode);
      return { kind: 'hide' };
    },
    actions(): LauncherAction[] {
      const list: LauncherAction[] = [{ id: 'run', title: env.t('launcher.shell.runAction'), icon: 'zap', hint: 'Entrée' }];
      if (env.isWin) list.push({ id: 'admin', title: env.t('launcher.action.admin'), icon: 'shield', hint: 'Ctrl Maj Entrée' });
      list.push({ id: 'copy', title: env.t('launcher.action.copy'), icon: 'copy' });
      return list;
    },
    runAction(item, actionId): LauncherOutcome {
      if (actionId === 'copy') {
        env.copyText(String(item.data));
        return { kind: 'hide' };
      }
      run(String(item.data), actionId === 'admin' ? 'admin' : 'primary');
      return { kind: 'hide' };
    }
  };
}

// ── Tueur de processus ────────────────────────────────────────────────────

async function listProcesses(env: LauncherEnv, signal: AbortSignal): Promise<ProcessGroup[]> {
  if (env.isWin) {
    const out = await runCapture('tasklist.exe', ['/fo', 'csv', '/nh'], { signal, timeoutMs: 5000 });
    return groupProcesses(parseTasklistCsv(out), [env.ownPid, process.ppid]);
  }
  const out = await runCapture('ps', ['-eo', 'pid=,rss=,comm='], { signal, timeoutMs: 5000 });
  return groupProcesses(parsePsOutput(out), [env.ownPid, process.ppid]);
}

function kill(env: LauncherEnv, pids: number[]): void {
  if (env.isWin) {
    spawnDetached('taskkill.exe', ['/F', ...pids.flatMap((p) => ['/PID', String(p)])], { windowsHide: true });
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // déjà terminé ou interdit
    }
  }
}

export function createProcessProvider(env: LauncherEnv): Provider {
  const mb = (kb: number): string => `${Math.round(kb / 1024)} Mo`;
  return {
    id: 'processes',
    global: false,
    async query({ parsed, signal }: ProviderQuery): Promise<ProviderItem[]> {
      const groups = await listProcesses(env, signal);
      const search = parsed.search;
      const out: ProviderItem[] = [];
      for (const g of groups) {
        const m = search ? fuzzyMatch(search, g.name, 0) : { success: true, score: 0, indices: [] as number[] };
        if (!m.success) continue;
        out.push({
          title: g.name,
          subtitle: env.t('launcher.kill.subtitle', {
            n: g.pids.length,
            mem: mb(g.memKb),
            pids: g.pids.slice(0, 4).join(', ') + (g.pids.length > 4 ? '…' : '')
          }),
          icon: { kind: 'sprite', name: 'x' },
          // sans texte : les plus gourmands d'abord
          score: search ? m.score : Math.min(200, Math.round(g.memKb / 10_240)),
          titleHl: m.indices,
          recordKey: g.name.toLowerCase(),
          noRecord: true,
          data: g
        });
      }
      return out;
    },
    execute(item): LauncherOutcome {
      const g = item.data as ProcessGroup;
      kill(env, g.pids);
      env.notify(env.t('launcher.kill.done', { name: g.name }));
      return { kind: 'hide' };
    },
    actions(item): LauncherAction[] {
      const g = item.data as ProcessGroup;
      return [
        { id: 'all', title: env.t('launcher.kill.all', { n: g.pids.length }), icon: 'x', hint: 'Entrée', danger: true },
        ...g.pids.slice(0, 12).map((pid) => ({
          id: `pid:${pid}`,
          title: env.t('launcher.kill.one', { pid }),
          icon: 'minus'
        }))
      ];
    },
    runAction(item, actionId): LauncherOutcome {
      const g = item.data as ProcessGroup;
      const pid = actionId.startsWith('pid:') ? Number(actionId.slice(4)) : null;
      kill(env, pid ? [pid] : g.pids);
      env.notify(env.t('launcher.kill.done', { name: g.name }));
      return { kind: 'hide' };
    }
  };
}

// ── Outils MultiOutils ────────────────────────────────────────────────────

export function createToolsProvider(env: LauncherEnv): Provider {
  const available = (t: ToolEntry): boolean => (t.command ? env.hasLocalCommand(t.command) : true);
  return {
    id: 'tools',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      if (!parsed.search) return [];
      const out: ProviderItem[] = [];
      for (const t of TOOL_ENTRIES) {
        if (!available(t)) continue;
        const title = pick(env, t.fr, t.en);
        const m = matchFields(parsed.search, title, [
          { text: env.lang() === 'en' ? t.fr : t.en, weight: 0.9 },
          { text: t.keywords, weight: 0.7 }
        ]);
        if (!m) continue;
        out.push({
          title,
          subtitle: `MultiOutils · ${pick(env, t.subFr, t.subEn)}`,
          icon: { kind: 'sprite', name: t.icon },
          score: m.score,
          priority: 5,
          titleHl: m.titleHl,
          recordKey: t.command ?? `tool:${t.openTool}`,
          data: t
        });
      }
      return out;
    },
    execute(item): LauncherOutcome {
      const t = item.data as ToolEntry;
      env.hideLauncher();
      setTimeout(() => {
        if (t.command) {
          void env.runLocalCommand(t.command).then((ok) => {
            if (!ok) env.notify(env.t('launcher.error.tool'));
          });
        } else if (t.openTool) env.showMainWindow({ view: 'tool', toolId: t.openTool });
      }, t.delayMs ?? 0);
      return { kind: 'hide' };
    }
  };
}
