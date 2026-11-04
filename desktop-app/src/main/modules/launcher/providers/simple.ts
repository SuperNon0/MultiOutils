/**
 * Petits fournisseurs : calculatrice, recherche web, URL, historique.
 */
import type { LauncherAction, LauncherOutcome } from '../../../../common/launcher';
import { tryCalculate } from '../core/calculator';
import type { KeywordBinding } from '../core/query';
import type { KeywordTarget, Provider, ProviderItem, ProviderQuery } from '../core/engine';
import { fuzzyMatch } from '../core/matcher';
import { buildSearchUrl, detectUrl, engineHome } from '../core/web';
import { pick, type LauncherEnv } from './env';

// ── Calculatrice (plugin Calculator) ──────────────────────────────────────

export function createCalculatorProvider(env: LauncherEnv): Provider {
  return {
    id: 'calculator',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      const r = tryCalculate(parsed.search.replace(/^=\s*/, ''));
      if (!r) return [];
      return [
        {
          title: r.text,
          subtitle: env.t('launcher.calc.subtitle', { expr: parsed.search }),
          icon: { kind: 'sprite', name: 'hash' },
          score: 300,
          noRecord: true,
          recordKey: 'calc',
          data: r.text
        }
      ];
    },
    execute(item): LauncherOutcome {
      env.copyText(String(item.data));
      return { kind: 'hide' };
    },
    actions(): LauncherAction[] {
      return [
        { id: 'copy', title: env.t('launcher.action.copyResult'), icon: 'copy', hint: 'Entrée' },
        { id: 'replace', title: env.t('launcher.action.useResult'), icon: 'edit' }
      ];
    },
    runAction(item, actionId): LauncherOutcome {
      if (actionId === 'replace') return { kind: 'query', text: String(item.data) };
      env.copyText(String(item.data));
      return { kind: 'hide' };
    }
  };
}

// ── Recherche web (plugin WebSearch) ──────────────────────────────────────

export function createWebSearchProvider(env: LauncherEnv): Provider {
  const engines = (): ReturnType<LauncherEnv['settings']>['webEngines'] =>
    // une adresse en cours de saisie dans les réglages n'est pas encore utilisable
    env.settings().webEngines.filter((e) => e.enabled && /^https?:\/\//i.test(e.url));

  return {
    id: 'websearch',
    global: true,
    extraKeywords(): KeywordBinding<KeywordTarget>[] {
      return engines()
        .filter((e) => e.keyword)
        .map((e) => ({ keyword: e.keyword, target: { provider: 'websearch', sub: e.id } }));
    },
    query({ parsed }: ProviderQuery): ProviderItem[] {
      const subs = parsed.targets.filter((t) => t.provider === 'websearch' && t.sub).map((t) => t.sub);
      const list = engines();
      const search = parsed.search;
      if (subs.length > 0) {
        return list
          .filter((e) => subs.includes(e.id))
          .map((e) => ({
            title: search
              ? env.t('launcher.web.searchOn', { q: search, engine: e.name })
              : env.t('launcher.web.open', { engine: e.name }),
            subtitle: search ? buildSearchUrl(e.url, search) : engineHome(e.url),
            icon: { kind: 'sprite', name: 'compass' },
            score: 200,
            recordKey: `engine:${e.id}`,
            noRecord: true,
            data: search ? buildSearchUrl(e.url, search) : engineHome(e.url)
          }));
      }
      // global : moteur par défaut proposé en tout dernier
      const def = list.find((e) => e.id === env.settings().defaultEngine);
      if (!def || !search) return [];
      return [
        {
          title: env.t('launcher.web.searchOn', { q: search, engine: def.name }),
          subtitle: pick(env, 'Recherche web par défaut', 'Default web search'),
          icon: { kind: 'sprite', name: 'compass' },
          score: 0,
          pinBottom: true,
          noRecord: true,
          recordKey: 'engine:default',
          data: buildSearchUrl(def.url, search)
        }
      ];
    },
    execute(item): LauncherOutcome {
      void env.openExternal(String(item.data));
      return { kind: 'hide' };
    },
    actions(): LauncherAction[] {
      return [
        { id: 'open', title: env.t('launcher.action.openBrowser'), icon: 'external', hint: 'Entrée' },
        { id: 'copy', title: env.t('launcher.action.copyUrl'), icon: 'copy' }
      ];
    },
    runAction(item, actionId): LauncherOutcome {
      if (actionId === 'copy') env.copyText(String(item.data));
      else void env.openExternal(String(item.data));
      return { kind: 'hide' };
    }
  };
}

// ── URL (plugin Url) ──────────────────────────────────────────────────────

export function createUrlProvider(env: LauncherEnv): Provider {
  return {
    id: 'url',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      const url = detectUrl(parsed.search);
      if (!url) return [];
      return [
        {
          title: env.t('launcher.url.open', { url: parsed.search }),
          subtitle: url,
          icon: { kind: 'sprite', name: 'external' },
          score: 250,
          recordKey: url,
          data: url
        }
      ];
    },
    execute(item): LauncherOutcome {
      void env.openExternal(String(item.data));
      return { kind: 'hide' };
    },
    actions(): LauncherAction[] {
      return [
        { id: 'open', title: env.t('launcher.action.openBrowser'), icon: 'external', hint: 'Entrée' },
        { id: 'copy', title: env.t('launcher.action.copyUrl'), icon: 'copy' }
      ];
    },
    runAction(item, actionId): LauncherOutcome {
      if (actionId === 'copy') env.copyText(String(item.data));
      else void env.openExternal(String(item.data));
      return { kind: 'hide' };
    }
  };
}

// ── Historique (barre vide) ───────────────────────────────────────────────

export function createHistoryProvider(env: LauncherEnv, remove: (q: string) => void): Provider {
  return {
    id: 'history',
    global: false,
    onEmpty: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      if (!env.settings().showHistory) return [];
      const list = env.history();
      const items = parsed.search
        ? list.filter((h) => fuzzyMatch(parsed.search, h).success)
        : list;
      return items.slice(0, env.settings().maxResults).map((h, i) => ({
        title: h,
        subtitle: env.t('launcher.history.subtitle'),
        icon: { kind: 'sprite', name: 'clock' },
        score: 100 - i,
        noRecord: true,
        recordKey: `h:${h}`,
        autoComplete: h,
        data: h
      }));
    },
    execute(item): LauncherOutcome {
      return { kind: 'query', text: String(item.data) };
    },
    actions(): LauncherAction[] {
      return [
        { id: 'use', title: env.t('launcher.history.use'), icon: 'edit', hint: 'Entrée' },
        { id: 'remove', title: env.t('launcher.history.remove'), icon: 'trash', danger: true }
      ];
    },
    runAction(item, actionId): LauncherOutcome {
      if (actionId === 'remove') {
        remove(String(item.data));
        return { kind: 'query', text: '' };
      }
      return { kind: 'query', text: String(item.data) };
    }
  };
}
