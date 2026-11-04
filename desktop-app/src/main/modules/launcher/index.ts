/**
 * Module « Lanceur » : recréation des fonctions de base de Flow Launcher
 * (https://github.com/Flow-Launcher/Flow.Launcher, licence MIT — voir
 * THIRD_PARTY_NOTICES.md). Le système de plugins tiers, le magasin de
 * plugins et les plugins Python/Node/JSON-RPC sont volontairement laissés de
 * côté : seuls les fournisseurs intégrés existent.
 *
 * Ce module ne référence aucun autre module : les outils de l'app sont lancés
 * via les commandes locales enregistrées auprès de l'hôte.
 */
import { app, clipboard, ipcMain, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type {
  LauncherExecMode,
  LauncherOutcome,
  LauncherSettings,
  LauncherState,
  LauncherStats
} from '../../../common/launcher';
import type { MainHostContext, MainToolModule } from '../../module-registry';
import { LauncherEngine, type Provider } from './core/engine';
import { pushHistory, UsageRecord } from './core/ranking';
import { defaultLauncherSettings, mergeLauncherSettings, sanitizeLauncherSettings } from './core/settings';
import { BookmarkIndex, createBookmarksProvider } from './providers/bookmarks';
import type { LauncherEnv } from './providers/env';
import { createFilesProvider, FileSearcher } from './providers/files';
import { createProgramsProvider, ProgramIndex } from './providers/programs';
import {
  createCalculatorProvider,
  createHistoryProvider,
  createUrlProvider,
  createWebSearchProvider
} from './providers/simple';
import {
  createProcessProvider,
  createShellProvider,
  createSystemProvider,
  createToolsProvider,
  createWinSettingsProvider
} from './providers/system';
import { LauncherWindow } from './window';

const SETTINGS_KEY = 'launcher.settings';
const USAGE_KEY = 'launcher.usage';
const HISTORY_KEY = 'launcher.history';
const SHELL_KEY = 'launcher.shellHistory';
const SHORTCUT_ID = 'launcher';
const REINDEX_MS = 30 * 60_000;

export function createLauncherMainModule(): MainToolModule {
  let ctx: MainHostContext;
  let settings: LauncherSettings = defaultLauncherSettings();
  let usage = new UsageRecord();
  let history: string[] = [];
  let shellHistory: Array<{ cmd: string; count: number }> = [];
  let lastQuery = '';
  let shortcutOk = true;
  let reindexTimer: ReturnType<typeof setInterval> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const iconCache = new Map<string, string | null>();

  const kvGet = <T>(key: string, fallback: T): T => {
    try {
      const row = ctx.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      return row ? (JSON.parse(row.value) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const kvSet = (key: string, value: unknown): void => {
    ctx.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value));
  };
  /** La mémoire d'usage change à chaque sélection : écriture groupée. */
  const scheduleSave = (): void => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      kvSet(USAGE_KEY, usage.toJSON());
      kvSet(HISTORY_KEY, history);
      kvSet(SHELL_KEY, shellHistory);
    }, 1500);
  };

  const launcher = new LauncherWindow(
    () => settings.hideOnBlur,
    () => settings.look
  );
  let programIndex: ProgramIndex;
  let bookmarkIndex: BookmarkIndex;
  let fileSearcher: FileSearcher;
  let engine: LauncherEngine;
  let providers: Record<string, Provider> = {};

  const env: LauncherEnv = {
    isWin: process.platform === 'win32',
    settings: () => settings,
    lang: () => (ctx.i18n.language === 'en' ? 'en' : 'fr'),
    t: (key, vars) => ctx.i18n.t(key, vars),
    notify: (title, body) => ctx.notify(title, body),
    showMainWindow: (nav) => {
      launcher.hide();
      ctx.showMainWindow(nav);
    },
    hasLocalCommand: (id) => ctx.hasLocalCommand?.(id) ?? false,
    runLocalCommand: async (id) => (ctx.runLocalCommand ? ctx.runLocalCommand(id) : false),
    hideLauncher: () => launcher.hide(),
    reindex: () => reindex(),
    quitApp: () => {
      launcher.hide();
      app.quit();
    },
    copyText: (text) => clipboard.writeText(text),
    openPath: (p) => shell.openPath(p),
    reveal: (p) => shell.showItemInFolder(p),
    openExternal: async (url) => {
      // uniquement des schémas sûrs (pas de file:// ni de javascript:)
      if (/^(https?|ftp|mailto|ms-settings):/i.test(url)) await shell.openExternal(url);
    },
    userDataDir: '',
    history: () => history,
    ownPid: process.pid
  };

  const reindex = (): void => {
    void programIndex.refresh().then(() => ctx.broadcast('launcher:stats', stats()));
    try {
      bookmarkIndex.load();
    } catch {
      // favoris illisibles : ignorés
    }
    fileSearcher.resetDetection();
  };

  const stats = (): LauncherStats => ({
    programs: programIndex.entries.length,
    bookmarks: bookmarkIndex.items.length,
    indexedAt: programIndex.indexedAt,
    everything: !!fileSearcher.everything()
  });

  const activeProviders = (): Array<{ provider: Provider; keyword: string }> => {
    const list: Array<{ provider: Provider; keyword: string }> = [];
    for (const [id, cfg] of Object.entries(settings.providers)) {
      const provider = providers[id];
      if (provider && cfg.enabled) list.push({ provider, keyword: cfg.keyword });
    }
    list.push({ provider: providers.history, keyword: '' });
    return list;
  };

  const state = (): LauncherState => ({
    settings,
    lang: env.lang(),
    lastQuery,
    shortcutOk
  });

  /** Raccourci gardé aussi dans AppSettings.shortcuts (section Réglages → Raccourcis). */
  const hostShortcut = (): string | undefined =>
    (ctx.settings.get().shortcuts as Record<string, string | undefined>)[SHORTCUT_ID];
  const syncHostShortcut = (): void => {
    if (hostShortcut() === settings.shortcut) return;
    const shortcuts = { ...ctx.settings.get().shortcuts, [SHORTCUT_ID]: settings.shortcut };
    ctx.settings.set({ shortcuts: shortcuts as ReturnType<typeof ctx.settings.get>['shortcuts'] });
  };

  const applyShortcut = (): boolean => {
    syncHostShortcut();
    ctx.shortcuts.setAccelerator(SHORTCUT_ID, settings.shortcut);
    const statuses = ctx.shortcuts.applyAll();
    shortcutOk = statuses.find((s) => s.id === SHORTCUT_ID)?.ok ?? false;
    return shortcutOk;
  };

  const updateSettings = (patch: Partial<LauncherSettings>): LauncherSettings => {
    const before = settings;
    settings = mergeLauncherSettings(settings, patch);
    kvSet(SETTINGS_KEY, settings);
    engine.setProviders(activeProviders());
    if (settings.shortcut !== before.shortcut) applyShortcut();
    if (JSON.stringify(settings.look) !== JSON.stringify(before.look)) launcher.applyLook();
    if (
      JSON.stringify(settings.indexedFolders) !== JSON.stringify(before.indexedFolders) ||
      JSON.stringify(settings.excludes) !== JSON.stringify(before.excludes) ||
      settings.fileBackend !== before.fileBackend
    ) {
      reindex();
    }
    ctx.broadcast('launcher:state', state());
    ctx.events.emit('tray-refresh');
    return settings;
  };

  const handleOutcome = (outcome: LauncherOutcome): LauncherOutcome => {
    if (outcome.kind === 'hide') launcher.hide();
    return outcome;
  };

  return {
    id: 'launcher',

    activate(hostCtx: MainHostContext): void {
      ctx = hostCtx;
      env.userDataDir = app.getPath('userData');
      settings = sanitizeLauncherSettings(kvGet<unknown>(SETTINGS_KEY, null));
      usage = new UsageRecord(kvGet<Record<string, number>>(USAGE_KEY, {}));
      history = kvGet<string[]>(HISTORY_KEY, []).filter((h) => typeof h === 'string');
      shellHistory = kvGet<Array<{ cmd: string; count: number }>>(SHELL_KEY, []).filter(
        (h) => h && typeof h.cmd === 'string'
      );

      programIndex = new ProgramIndex(env, path.join(env.userDataDir, 'launcher-programs.json'));
      bookmarkIndex = new BookmarkIndex(path.join(os.tmpdir(), 'multioutils-launcher'));
      fileSearcher = new FileSearcher(env);

      providers = {
        programs: createProgramsProvider(env, programIndex),
        files: createFilesProvider(env, fileSearcher),
        calculator: createCalculatorProvider(env),
        websearch: createWebSearchProvider(env),
        url: createUrlProvider(env),
        shell: createShellProvider(
          env,
          () => [...shellHistory].sort((a, b) => b.count - a.count).slice(0, 30),
          (cmd) => {
            const found = shellHistory.find((h) => h.cmd === cmd);
            if (found) found.count++;
            else shellHistory = [{ cmd, count: 1 }, ...shellHistory].slice(0, 200);
            scheduleSave();
          }
        ),
        system: createSystemProvider(env),
        winsettings: createWinSettingsProvider(env),
        processes: createProcessProvider(env),
        bookmarks: createBookmarksProvider(env, bookmarkIndex),
        tools: createToolsProvider(env),
        history: createHistoryProvider(env, (q) => {
          history = history.filter((h) => h !== q);
          scheduleSave();
        })
      };

      engine = new LauncherEngine({
        providers: [],
        usage,
        limit: () => settings.maxResults,
        emit: (queryId, results, done) => launcher.send('launcher:results', { queryId, results, done }),
        onError: (id, err) => {
          if (!app.isPackaged) console.warn(`[lanceur] ${id} :`, err);
        }
      });
      engine.setProviders(activeProviders());

      // Index : cache disque immédiat, puis rafraîchissement en arrière-plan.
      programIndex.loadCache();
      setTimeout(() => reindex(), 4000);
      reindexTimer = setInterval(() => reindex(), REINDEX_MS);

      // Raccourci global (appliqué par l'hôte après l'activation des modules).
      ctx.shortcuts.register({ id: SHORTCUT_ID, accelerator: settings.shortcut, run: () => launcher.toggle() });

      // Pré-création : la première ouverture est aussi rapide que les suivantes.
      app.whenReady().then(() => setTimeout(() => launcher.create(), 1500));

      syncHostShortcut();
      ctx.events.on('settings-changed', () => {
        // raccourci modifié depuis Réglages → Raccourcis : on l'adopte
        const fromHost = hostShortcut();
        if (fromHost !== undefined && fromHost !== settings.shortcut) updateSettings({ shortcut: fromHost });
        launcher.send('launcher:state', state());
      });

      ipcMain.handle('launcher:getState', () => state());
      ipcMain.handle('launcher:query', (_e, text: string, queryId: number) => {
        lastQuery = typeof text === 'string' ? text : '';
        engine.query(lastQuery, queryId);
      });
      ipcMain.handle(
        'launcher:execute',
        async (_e, resultId: string, mode: LauncherExecMode, query: string) => {
          if (typeof query === 'string' && query.trim()) {
            history = pushHistory(history, query);
            scheduleSave();
          }
          const outcome = await engine.execute(resultId, mode).catch(
            (err): LauncherOutcome => ({ kind: 'error', message: String(err?.message ?? err) })
          );
          scheduleSave();
          return handleOutcome(outcome);
        }
      );
      ipcMain.handle('launcher:actions', (_e, resultId: string) => engine.actions(resultId));
      ipcMain.handle('launcher:runAction', async (_e, resultId: string, actionId: string, query: string) => {
        if (typeof query === 'string' && query.trim()) history = pushHistory(history, query);
        const outcome = await engine.runAction(resultId, actionId).catch(
          (err): LauncherOutcome => ({ kind: 'error', message: String(err?.message ?? err) })
        );
        scheduleSave();
        return handleOutcome(outcome);
      });
      ipcMain.handle('launcher:icon', async (_e, filePath: string) => {
        if (typeof filePath !== 'string') return null;
        if (iconCache.has(filePath)) return iconCache.get(filePath) ?? null;
        try {
          const img = await app.getFileIcon(filePath, { size: 'normal' });
          const url = img.isEmpty() ? null : img.toDataURL();
          if (iconCache.size > 2000) iconCache.clear();
          iconCache.set(filePath, url);
          return url;
        } catch {
          iconCache.set(filePath, null);
          return null;
        }
      });
      ipcMain.on('launcher:hide', () => launcher.hide());
      ipcMain.on('launcher:resize', (_e, height: number) => {
        if (typeof height === 'number' && Number.isFinite(height)) launcher.resize(height);
      });
      ipcMain.handle('launcher:open', () => launcher.show());
      ipcMain.handle('launcher:getSettings', () => ({ settings, shortcutOk, stats: stats() }));
      ipcMain.handle('launcher:setSettings', (_e, patch: Partial<LauncherSettings>) => {
        const next = updateSettings(patch ?? {});
        return { settings: next, shortcutOk, stats: stats() };
      });
      ipcMain.handle('launcher:resetSettings', () => {
        const next = updateSettings(defaultLauncherSettings());
        return { settings: next, shortcutOk, stats: stats() };
      });
      ipcMain.handle('launcher:reindex', async () => {
        reindex();
        await programIndex.refresh();
        return stats();
      });
      ipcMain.handle('launcher:clearHistory', () => {
        history = [];
        shellHistory = [];
        scheduleSave();
      });
      ipcMain.handle('launcher:clearUsage', () => {
        usage.clear();
        scheduleSave();
      });

      ctx.registerLocalCommand('launcher.open', () => launcher.show());
    },

    trayMenuItems(hostCtx: MainHostContext) {
      return [
        {
          label: hostCtx.i18n.t('launcher.tray'),
          accelerator: settings.shortcut || undefined,
          registerAccelerator: false,
          click: () => launcher.show()
        }
      ];
    },

    deactivate(): void {
      if (reindexTimer) clearInterval(reindexTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        try {
          kvSet(USAGE_KEY, usage.toJSON());
          kvSet(HISTORY_KEY, history);
          kvSet(SHELL_KEY, shellHistory);
        } catch {
          // base déjà fermée
        }
      }
      engine?.cancel();
      launcher.destroy();
    }
  };
}
