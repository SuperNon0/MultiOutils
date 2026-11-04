/**
 * Moteur du lanceur : distribue une requête aux fournisseurs, annule la
 * précédente, fusionne et classe les résultats au fil de l'eau.
 * Aucune dépendance Electron : testable tel quel.
 */
import type {
  LauncherAction,
  LauncherExecMode,
  LauncherIcon,
  LauncherOutcome,
  LauncherProviderId,
  LauncherResult
} from '../../../../common/launcher';
import { parseQuery, type KeywordBinding, type ParsedQuery } from './query';
import { rank, UsageRecord } from './ranking';

/** Résultat brut produit par un fournisseur. */
export interface ProviderItem {
  title: string;
  subtitle?: string;
  icon: LauncherIcon;
  titleHl?: number[];
  subtitleHl?: number[];
  score: number;
  /** Clé stable pour la mémoire d'usage (sinon titre + sous-titre). */
  recordKey?: string;
  priority?: number;
  pinBottom?: boolean;
  autoComplete?: string;
  confirm?: string;
  secondary?: string;
  canAdmin?: boolean;
  /** Ne pas compter dans la mémoire d'usage (ex. résultat de calcul). */
  noRecord?: boolean;
  /** Données propres au fournisseur (chemin, URL, PID…). */
  data?: unknown;
}

export interface ProviderQuery {
  /** Requête analysée ; `targets` = ce que désigne le mot-clé. */
  parsed: ParsedQuery<KeywordTarget>;
  /** Le fournisseur a été appelé par son mot-clé (et non en global). */
  byKeyword: boolean;
  signal: AbortSignal;
}

export interface Provider {
  id: Exclude<LauncherProviderId, 'history'> | 'history';
  /** Mots-clés supplémentaires (ex. un par moteur web). */
  extraKeywords?(): KeywordBinding<KeywordTarget>[];
  /** Participe aux requêtes globales (sans mot-clé). */
  global: boolean;
  /** Répond aussi à la barre vide (historique). */
  onEmpty?: boolean;
  /** Reste interrogé en global même avec un mot-clé (ex. chemins tapés). */
  globalWithKeyword?: boolean;
  query(q: ProviderQuery): ProviderItem[] | Promise<ProviderItem[]>;
  execute(item: ProviderItem, mode: LauncherExecMode, search: string): LauncherOutcome | Promise<LauncherOutcome>;
  actions?(item: ProviderItem): LauncherAction[];
  runAction?(item: ProviderItem, actionId: string): LauncherOutcome | Promise<LauncherOutcome>;
}

export interface KeywordTarget {
  provider: string;
  /** Sous-cible (id du moteur web…). */
  sub?: string;
}

export interface EngineOptions {
  /** Fournisseurs actifs + mot-clé ('' = global). */
  providers: Array<{ provider: Provider; keyword: string }>;
  usage: UsageRecord;
  limit(): number;
  /** Envoi des résultats (plusieurs fois par requête, au fil des réponses). */
  emit(queryId: number, results: LauncherResult[], done: boolean): void;
  /** Délai max d'un fournisseur lent (ms). */
  timeoutMs?: number;
  onError?(providerId: string, err: unknown): void;
}

interface Stored {
  provider: Provider;
  item: ProviderItem;
  recordKey: string;
  search: string;
}

export class LauncherEngine {
  private controller: AbortController | null = null;
  private seq = 0;
  /** Résultats de la dernière requête, par id, pour exécuter / ouvrir le menu. */
  private current = new Map<string, Stored>();
  private lastSearch = '';

  constructor(private opts: EngineOptions) {}

  setProviders(providers: EngineOptions['providers']): void {
    this.opts.providers = providers;
  }

  bindings(): KeywordBinding<KeywordTarget>[] {
    const out: KeywordBinding<KeywordTarget>[] = [];
    for (const { provider, keyword } of this.opts.providers) {
      if (keyword) out.push({ keyword, target: { provider: provider.id } });
      for (const b of provider.extraKeywords?.() ?? []) out.push(b);
    }
    return out;
  }

  /** Lance une requête ; renvoie son id. Les résultats arrivent via `emit`. */
  query(text: string, forcedId?: number): number {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const queryId = forcedId ?? ++this.seq;
    const parsed = parseQuery(text, this.bindings());
    this.lastSearch = parsed.keyword ? `${parsed.keyword} ${parsed.search}` : parsed.search;

    const empty = !parsed.keyword && !parsed.search;
    const selected = parsed.keyword
      ? this.opts.providers.filter(({ provider }) => parsed.targets.some((t) => t.provider === provider.id))
      : empty
        ? this.opts.providers.filter(({ provider }) => provider.onEmpty)
        : this.opts.providers.filter(({ provider, keyword }) => provider.global && (keyword === '' || !!provider.globalWithKeyword));

    const collected: Stored[] = [];
    const store = new Map<string, Stored>();
    let pending = selected.length;
    let emitTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = (done: boolean): void => {
      if (controller.signal.aborted) return;
      if (emitTimer) {
        clearTimeout(emitTimer);
        emitTimer = null;
      }
      const ranked = rank(
        collected.map((s, i) => ({
          id: String(i),
          recordKey: s.recordKey,
          score: s.item.score,
          priority: s.item.priority,
          pinBottom: s.item.pinBottom,
          noRecord: s.item.noRecord,
          stored: s
        })),
        this.opts.usage,
        this.lastSearch,
        this.opts.limit()
      );
      store.clear();
      const results: LauncherResult[] = ranked.map((r, index) => {
        const id = `${queryId}:${index}`;
        const s = r.stored;
        store.set(id, s);
        const actions = s.provider.actions?.(s.item) ?? [];
        return {
          id,
          providerId: s.provider.id as LauncherProviderId,
          title: s.item.title,
          subtitle: s.item.subtitle,
          icon: s.item.icon,
          titleHl: s.item.titleHl,
          subtitleHl: s.item.subtitleHl,
          score: r.final,
          autoComplete: s.item.autoComplete,
          confirm: s.item.confirm,
          hasContext: actions.length > 0,
          secondary: s.item.secondary,
          canAdmin: s.item.canAdmin
        };
      });
      this.current = store;
      this.opts.emit(queryId, results, done);
    };

    if (selected.length === 0) {
      this.current = new Map();
      this.opts.emit(queryId, [], true);
      return queryId;
    }

    for (const { provider } of selected) {
      const q: ProviderQuery = { parsed, byKeyword: !!parsed.keyword, signal: controller.signal };
      let finished = false;
      const finish = (items: ProviderItem[]): void => {
        if (finished) return;
        finished = true;
        if (controller.signal.aborted) return;
        for (const item of items) {
          collected.push({
            provider,
            item,
            recordKey: `${provider.id}:${item.recordKey ?? `${item.title}\u0001${item.subtitle ?? ''}`}`,
            search: this.lastSearch
          });
        }
        pending--;
        if (pending === 0) flush(true);
        // regroupe les réponses rapprochées (évite le scintillement)
        else if (!emitTimer) emitTimer = setTimeout(() => flush(false), 25);
      };
      const timer = setTimeout(() => finish([]), this.opts.timeoutMs ?? 4000);
      Promise.resolve()
        .then(() => provider.query(q))
        .then(
          (items) => finish(items ?? []),
          (err) => {
            if (!controller.signal.aborted) this.opts.onError?.(provider.id, err);
            finish([]);
          }
        )
        .finally(() => clearTimeout(timer));
    }
    return queryId;
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }

  private stored(resultId: string): Stored | undefined {
    return this.current.get(resultId);
  }

  async execute(resultId: string, mode: LauncherExecMode): Promise<LauncherOutcome> {
    const s = this.stored(resultId);
    if (!s) return { kind: 'error', message: 'résultat expiré' };
    if (!s.item.noRecord) this.opts.usage.add(s.search, s.recordKey);
    return s.provider.execute(s.item, mode, s.search);
  }

  actions(resultId: string): LauncherAction[] {
    const s = this.stored(resultId);
    return s ? (s.provider.actions?.(s.item) ?? []) : [];
  }

  async runAction(resultId: string, actionId: string): Promise<LauncherOutcome> {
    const s = this.stored(resultId);
    if (!s || !s.provider.runAction) return { kind: 'error', message: 'action indisponible' };
    if (!s.item.noRecord) this.opts.usage.add(s.search, s.recordKey);
    return s.provider.runAction(s.item, actionId);
  }
}
