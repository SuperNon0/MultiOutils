/**
 * Règles de rangement du module Bureau.
 *
 * - Règle « zone » : range les éléments du Bureau dans une zone (rien ne bouge
 *   sur le disque). En continu, elle ne prend que les éléments que personne
 *   n'a encore rangés ; à la demande, elle prend tout ce qui correspond.
 * - Règle « déplacer » : déplace vraiment les fichiers d'un dossier vers un
 *   autre (en continu : à chaque arrivée dans le dossier source).
 * Chaque action est notée dans un journal et peut être annulée.
 */
import { shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  matchRule,
  normalizeRule,
  type DesktopEntry,
  type Rule,
  type RuleLogEntry,
  type Zone
} from '../../../common/desktop';
import { listDir, transfer, watchDirs } from './files';

const RULES_KEY = 'desktop.rules';
const LOG_KEY = 'desktop.rulesLog';
const IGNORE_KEY = 'desktop.rulesIgnore';
const LOG_MAX = 200;

export interface RulesDeps {
  kvGet<T>(key: string, fallback: T): T;
  kvSet(key: string, value: unknown): void;
  zones(): Zone[];
  setZones(next: Zone[]): void;
  desktop(): DesktopEntry[];
  onChange(): void;
  notify(title: string, body: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
}

export type Matchable = DesktopEntry & { target?: string | null };

export interface RulePreview {
  count: number;
  names: string[];
}

/** Cible d'un raccourci (.lnk via Windows, .url via sa ligne URL=). */
const targetCache = new Map<string, { mtime: number; target: string | null }>();
export function shortcutTarget(e: DesktopEntry): string | null {
  if (e.ext !== 'lnk' && e.ext !== 'url') return null;
  const hit = targetCache.get(e.path);
  if (hit && hit.mtime === e.mtime) return hit.target;
  let target: string | null = null;
  try {
    if (e.ext === 'lnk') target = shell.readShortcutLink(e.path).target || null;
    else target = /^URL=(.*)$/im.exec(fs.readFileSync(e.path, 'utf8'))?.[1]?.trim() ?? null;
  } catch {
    target = null;
  }
  if (targetCache.size > 2000) targetCache.clear();
  targetCache.set(e.path, { mtime: e.mtime, target });
  return target;
}

const usesTarget = (r: Rule): boolean => r.conditions.some((c) => c.field === 'target');
const withTarget = (r: Rule, e: DesktopEntry): Matchable => (usesTarget(r) ? { ...e, target: shortcutTarget(e) } : e);
const same = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export function createRulesEngine(deps: RulesDeps) {
  let rules: Rule[] = deps
    .kvGet<Array<Partial<Rule> & { id: string }>>(RULES_KEY, [])
    .filter((r) => r && typeof r.id === 'string')
    .map(normalizeRule);
  let log: RuleLogEntry[] = deps.kvGet<RuleLogEntry[]>(LOG_KEY, []).filter((l) => l && typeof l.id === 'string');
  /** Éléments sortis d'une zone à la main : les règles continues ne les reprennent plus. */
  let ignore = new Set(deps.kvGet<string[]>(IGNORE_KEY, []));
  let stopWatch: (() => void) | null = null;
  let busy = false;

  const saveLog = (): void => {
    log = log.slice(-LOG_MAX);
    deps.kvSet(LOG_KEY, log);
  };
  const addLog = (entry: Omit<RuleLogEntry, 'id' | 'at'>): void => {
    log.push({ id: randomUUID(), at: Date.now(), ...entry });
  };
  const saveIgnore = (): void => deps.kvSet(IGNORE_KEY, [...ignore].slice(-1000));

  const zoneOk = (r: Rule): Zone | undefined => {
    if (r.action.type !== 'zone') return undefined;
    const id = r.action.zoneId;
    return deps.zones().find((z) => z.id === id && z.kind === 'shortcuts');
  };

  /** Noms du Bureau déjà rangés à la main dans une zone (hors « À trier »). */
  const claimed = (): Set<string> => new Set(deps.zones().filter((z) => z.kind === 'shortcuts' && !z.inbox).flatMap((z) => z.items));

  /**
   * Règles continues « zone » : appelé à chaque rafraîchissement du Bureau.
   * Renvoie les zones modifiées (ou null si rien ne change).
   */
  const sweepZones = (zones: Zone[], desktop: DesktopEntry[]): Zone[] | null => {
    const active = rules.filter((r) => r.enabled && r.mode === 'continuous' && r.action.type === 'zone' && zoneOk(r));
    if (active.length === 0) return null;
    const taken = new Set(zones.filter((z) => z.kind === 'shortcuts' && !z.inbox).flatMap((z) => z.items));
    const now = Date.now();
    const adds = new Map<string, string[]>();
    for (const e of desktop) {
      if (taken.has(e.name) || ignore.has(e.name)) continue;
      const rule = active.find((r) => matchRule(r, withTarget(r, e), now));
      if (!rule || rule.action.type !== 'zone') continue;
      const zid = rule.action.zoneId;
      adds.set(zid, [...(adds.get(zid) ?? []), e.name]);
      addLog({ ruleId: rule.id, ruleName: rule.name, name: e.name, action: 'zone', zoneId: zid });
    }
    if (adds.size === 0) return null;
    saveLog();
    const all = new Set([...adds.values()].flat());
    return zones.map((z) => {
      if (z.kind !== 'shortcuts') return z;
      const rest = z.items.filter((n) => !all.has(n));
      const names = adds.get(z.id);
      if (names) return { ...z, items: [...rest, ...names] };
      return rest.length === z.items.length ? z : { ...z, items: rest };
    });
  };

  const sourceEntries = async (r: Rule): Promise<DesktopEntry[]> => {
    if (r.action.type !== 'move' || !r.action.source) return [];
    try {
      return await listDir(r.action.source);
    } catch {
      return [];
    }
  };

  const preview = async (raw: Rule): Promise<RulePreview> => {
    const r = normalizeRule(raw);
    const now = Date.now();
    let list: DesktopEntry[];
    if (r.action.type === 'zone') {
      const zid = r.action.zoneId;
      const zone = deps.zones().find((z) => z.id === zid);
      list = deps.desktop().filter((e) => !zone?.items.includes(e.name));
    } else {
      list = await sourceEntries(r);
    }
    const hits = list.filter((e) => matchRule(r, withTarget(r, e), now));
    return { count: hits.length, names: hits.slice(0, 8).map((e) => e.name) };
  };

  /** Applique une règle maintenant ; renvoie le nombre d'éléments traités. */
  const apply = async (id: string, opts: { onlyUnclaimed?: boolean } = {}): Promise<number> => {
    const r = rules.find((o) => o.id === id);
    if (!r) return 0;
    const now = Date.now();
    if (r.action.type === 'zone') {
      const zone = zoneOk(r);
      if (!zone) return 0;
      const taken = opts.onlyUnclaimed ? claimed() : new Set<string>();
      const names = deps
        .desktop()
        .filter((e) => !zone.items.includes(e.name) && !taken.has(e.name) && matchRule(r, withTarget(r, e), now))
        .map((e) => e.name);
      if (names.length === 0) return 0;
      for (const n of names) {
        ignore.delete(n);
        addLog({ ruleId: r.id, ruleName: r.name, name: n, action: 'zone', zoneId: zone.id });
      }
      saveIgnore();
      saveLog();
      deps.setZones(
        deps.zones().map((z) => {
          if (z.kind !== 'shortcuts') return z;
          const rest = z.items.filter((n) => !names.includes(n));
          return z.id === zone.id ? { ...z, items: [...rest, ...names] } : rest.length === z.items.length ? z : { ...z, items: rest };
        })
      );
      return names.length;
    }
    const { source, dest } = r.action;
    if (!source || !dest || same(source, dest) || !fs.existsSync(dest)) return 0;
    const hits = (await sourceEntries(r)).filter((e) => matchRule(r, withTarget(r, e), now));
    let n = 0;
    for (const e of hits) {
      try {
        const [name] = await transfer([e.path], dest, false);
        if (!name) continue;
        addLog({ ruleId: r.id, ruleName: r.name, name: e.name, action: 'move', from: e.path, to: path.join(dest, name) });
        n++;
      } catch (err) {
        deps.notify(deps.t('desktop.rules.moveFailed', { name: e.name }), err instanceof Error ? err.message : String(err));
      }
    }
    if (n > 0) {
      saveLog();
      deps.onChange();
    }
    return n;
  };

  /** Surveille les dossiers sources des règles « déplacer » continues. */
  const rewatch = (): void => {
    stopWatch?.();
    stopWatch = null;
    const movers = rules.filter((r) => r.enabled && r.mode === 'continuous' && r.action.type === 'move' && r.action.source && r.action.dest);
    if (movers.length === 0) return;
    const sources = [...new Set(movers.map((r) => (r.action.type === 'move' ? r.action.source : '')))];
    const run = async (dir: string): Promise<void> => {
      if (busy) return;
      busy = true;
      try {
        for (const r of movers) if (r.action.type === 'move' && same(r.action.source, dir)) await apply(r.id);
      } finally {
        busy = false;
      }
    };
    stopWatch = watchDirs(sources, (dir) => void run(dir), 1500);
    // rattrapage au démarrage
    for (const s of sources) void run(s);
  };

  const setRules = (next: Rule[]): Rule[] => {
    rules = (Array.isArray(next) ? next : []).filter((r) => r && typeof r.id === 'string').map(normalizeRule);
    deps.kvSet(RULES_KEY, rules);
    rewatch();
    deps.onChange();
    return rules;
  };

  const undo = async (logId: string): Promise<boolean> => {
    const entry = log.find((l) => l.id === logId);
    if (!entry || entry.undone) return false;
    if (entry.action === 'zone') {
      const zones = deps.zones();
      if (!zones.some((z) => z.id === entry.zoneId && z.items.includes(entry.name))) return false;
      ignore.add(entry.name);
      saveIgnore();
      deps.setZones(zones.map((z) => (z.id === entry.zoneId ? { ...z, items: z.items.filter((n) => n !== entry.name) } : z)));
    } else {
      if (!entry.from || !entry.to || !fs.existsSync(entry.to) || fs.existsSync(entry.from)) return false;
      try {
        await fs.promises.rename(entry.to, entry.from);
      } catch {
        return false;
      }
      deps.onChange();
    }
    entry.undone = true;
    saveLog();
    return true;
  };

  /** Un élément retiré d'une zone à la main ne doit pas y être remis. */
  const forget = (name: string): void => {
    ignore.add(name);
    saveIgnore();
  };

  return {
    rules: (): Rule[] => rules,
    log: (): RuleLogEntry[] => [...log].reverse(),
    clearLog: (): void => {
      log = [];
      saveLog();
    },
    setRules,
    preview,
    apply,
    undo,
    forget,
    sweepZones,
    start: rewatch,
    stop: (): void => {
      stopWatch?.();
      stopWatch = null;
    }
  };
}

export type RulesEngine = ReturnType<typeof createRulesEngine>;
