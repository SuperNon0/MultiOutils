/**
 * Raccourcis du lanceur : un mot-clé court (« yt », « nas ») + Entrée ouvre
 * directement un site, un dossier, un fichier ou un programme.
 * Avec {q} dans la cible, « mot-clé texte » remplace {q} par le texte.
 */
import type { LauncherAction, LauncherAlias, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import { buildSearchUrl, detectUrl } from '../core/web';
import type { LauncherEnv } from './env';

/** Cible à ouvrir dans le navigateur (schéma explicite ou adresse reconnue). */
export function aliasUrl(target: string): string | null {
  const t = target.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(mailto|tel):/i.test(t)) return t;
  // « C:\… » ou « \\nas\… » : chemin, jamais une adresse
  if (/^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\') || t.startsWith('/')) return null;
  return detectUrl(t);
}

export interface AliasMatch {
  alias: LauncherAlias;
  /** Ce qui sera ouvert (texte remplacé dans {q}). */
  open: string;
  exact: boolean;
}

/**
 * Raccourcis qui correspondent à la requête :
 * - mot-clé tapé en entier → en tête (Entrée l'ouvre) ;
 * - « mot-clé texte » si la cible contient {q} ;
 * - début du mot-clé (« y » pour « yt ») → simple suggestion, plus bas.
 */
export function matchAliases(aliases: LauncherAlias[], raw: string): AliasMatch[] {
  const search = raw.trim();
  if (!search) return [];
  const low = search.toLowerCase();
  const out: AliasMatch[] = [];
  for (const alias of aliases) {
    if (!alias.enabled) continue;
    const kw = alias.keyword.toLowerCase();
    const withQ = alias.target.includes('{q}');
    if (low === kw) {
      out.push({ alias, open: withQ ? alias.target.split('{q}').join('') : alias.target, exact: true });
    } else if (withQ && low.startsWith(`${kw} `)) {
      const text = search.slice(kw.length).trim();
      const url = aliasUrl(alias.target.replace(/\{q\}/g, ''));
      out.push({
        alias,
        open: url ? buildSearchUrl(alias.target, text) : alias.target.split('{q}').join(text),
        exact: true
      });
    } else if (kw.startsWith(low)) {
      out.push({ alias, open: withQ ? alias.target.split('{q}').join('') : alias.target, exact: false });
    }
  }
  return out;
}

export function createAliasesProvider(env: LauncherEnv): Provider {
  const open = async (target: string): Promise<LauncherOutcome> => {
    const url = aliasUrl(target);
    if (url) {
      await env.openExternal(url);
      return { kind: 'hide' };
    }
    const err = await env.openPath(target);
    return err ? { kind: 'error', message: err } : { kind: 'hide' };
  };
  return {
    id: 'aliases',
    global: true,
    query({ parsed }: ProviderQuery): ProviderItem[] {
      // parsed.raw : le mot-clé d'un autre fournisseur ne doit pas masquer un raccourci
      return matchAliases(env.settings().aliases, parsed.raw).map((m) => ({
        title: m.alias.name || m.alias.keyword,
        subtitle: `${m.alias.keyword} → ${m.open}`,
        icon: { kind: 'sprite', name: aliasUrl(m.open) ? 'external' : 'folderopen' },
        // mot-clé exact : toujours en tête, pour que Entrée l'ouvre aussitôt
        score: m.exact ? 1000 : 120,
        priority: m.exact ? 10_000 : 0,
        recordKey: m.alias.id,
        data: m.open
      }));
    },
    execute(item): Promise<LauncherOutcome> {
      return open(String(item.data));
    },
    actions(): LauncherAction[] {
      return [
        { id: 'open', title: env.t('launcher.action.open'), icon: 'external', hint: 'Entrée' },
        { id: 'copy', title: env.t('launcher.action.copy'), icon: 'copy' }
      ];
    },
    runAction(item, actionId): Promise<LauncherOutcome> | LauncherOutcome {
      if (actionId === 'copy') {
        env.copyText(String(item.data));
        return { kind: 'hide' };
      }
      return open(String(item.data));
    }
  };
}
