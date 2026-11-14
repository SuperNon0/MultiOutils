/**
 * Plugin « Home Assistant » : cherche une entité (lumière, prise, volet,
 * scène…) et l'allume / l'éteint par l'API REST. Adresse dans les réglages
 * du lanceur ; jeton d'accès chiffré (safeStorage), jamais renvoyé au renderer.
 */
import type { HaWidgetAction } from '../../../../common/desktop';
import { widgetCommand } from '../core/widget-controls';
import type { HaNotification, LauncherAction, LauncherOutcome } from '../../../../common/launcher';
import type { Provider, ProviderItem, ProviderQuery } from '../core/engine';
import {
  haBaseUrl,
  haService,
  isControllable,
  isOn,
  isOneShot,
  splitHaAction,
  type HaAction,
  type HaState
} from '../core/homeassistant';
import { bestMatch } from '../core/matcher';
import type { LauncherEnv } from './env';

const ICONS: Record<string, string> = {
  light: 'sun',
  switch: 'zap',
  fan: 'refresh',
  cover: 'window',
  media_player: 'play',
  climate: 'sun',
  scene: 'sparkle',
  script: 'play',
  automation: 'wrench',
  lock: 'lock',
  vacuum: 'home'
};

export class HomeAssistantClient {
  private cache: { at: number; states: HaState[] } | null = null;

  constructor(
    private url: () => string,
    private token: () => string | null
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const base = haBaseUrl(this.url());
    const token = this.token();
    if (!base || !token) throw new Error('not-configured');
    const res = await fetch(`${base}/api${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => null);
  }

  async states(): Promise<HaState[]> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.states;
    const body = await this.call('/states');
    const states = Array.isArray(body) ? (body as HaState[]).filter((s) => s && typeof s.entity_id === 'string') : [];
    this.cache = { at: Date.now(), states };
    return states;
  }

  /** Historique numérique issu de l'API HA, limité pour un widget léger. */
  async series(entityId: string, hours: 24 | 168): Promise<Array<{ at: number; value: number }>> {
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(entityId)) throw new Error('Entité invalide');
    const start = new Date(Date.now() - hours * 3_600_000).toISOString();
    const data = await this.call(`/history/period/${start}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response&no_attributes`);
    const states = Array.isArray(data) && Array.isArray(data[0]) ? data[0] as Array<Record<string, unknown>> : [];
    const points = states.flatMap((state) => {
      const value = Number(state.state);
      const at = Date.parse(String(state.last_changed ?? state.last_updated ?? ''));
      return state.state !== '' && state.state !== null && Number.isFinite(value) && Number.isFinite(at)
        ? [{ at, value }]
        : [];
    });
    // Réduire les points pour que l'affichage sur le bureau reste fluide.
    const step = Math.max(1, Math.ceil(points.length / 96));
    return points.filter((_p, i) => i % step === 0 || i === points.length - 1);
  }

  async run(entityId: string, action: HaAction, currentlyOn: boolean): Promise<void> {
    const [domain, service] = haService(entityId, action, currentlyOn);
    await this.call(`/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId })
    });
    this.invalidate();
  }

  async control(entityId: string, action: HaWidgetAction, value?: number): Promise<void> {
    const state = (await this.states()).find((st) => st.entity_id === entityId);
    if (!state) throw new Error('Entity not found');
    const command = widgetCommand(state, action, value);
    await this.call(`/services/${command.domain}/${command.service}`, { method: 'POST', body: JSON.stringify(command.data) });
    this.invalidate();
  }

  /** Vérifie l'adresse et le jeton ; renvoie le nombre d'entités pilotables. */
  async test(): Promise<number> {
    this.invalidate();
    await this.call('/');
    return (await this.states()).filter(isControllable).length;
  }
}

/** Liens avec la liaison PC ↔ HA (mini tableau de bord, notifications reçues). */
export interface HaProviderHooks {
  openDashboard(path?: string): void;
  history(): HaNotification[];
}

const ago = (ts: number, lang: 'fr' | 'en'): string => {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return lang === 'en' ? 'just now' : "à l'instant";
  if (min < 60) return lang === 'en' ? `${min} min ago` : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'en' ? `${h} h ago` : `il y a ${h} h`;
  return new Date(ts).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR');
};

export function createHomeAssistantProvider(
  env: LauncherEnv,
  client: HomeAssistantClient,
  hooks?: HaProviderHooks
): Provider {
  const exec = async (s: HaState, action: HaAction): Promise<LauncherOutcome> => {
    try {
      await client.run(s.entity_id, action, isOn(s));
      return { kind: 'hide' };
    } catch (err) {
      return { kind: 'error', message: `Home Assistant : ${err instanceof Error ? err.message : String(err)}` };
    }
  };
  const label = (s: HaState): string => s.attributes?.friendly_name || s.entity_id;
  return {
    id: 'homeassistant',
    global: true,
    async query({ parsed, byKeyword }: ProviderQuery): Promise<ProviderItem[]> {
      const extra: ProviderItem[] = [];
      if (hooks && env.settings().homeAssistant.url) {
        const search = parsed.search.trim();
        // « ha » seul, ou une recherche qui ressemble à « tableau de bord / home assistant »
        const dash = search.length >= (byKeyword ? 1 : 3)
          ? bestMatch(search, [
              { text: env.t('launcher.ha.dashboard'), weight: 1 },
              { text: 'Home Assistant', weight: 0.9 },
              { text: 'dashboard', weight: 0.7 }
            ])
          : null;
        if ((byKeyword && !search) || dash) {
          extra.push({
            title: env.t('launcher.ha.dashboard'),
            subtitle: env.t('launcher.ha.dashboardSub'),
            icon: { kind: 'sprite', name: 'home' },
            titleHl: dash?.field === 0 ? dash.indices : undefined,
            score: byKeyword ? 1000 : (dash?.score ?? 0),
            priority: byKeyword ? 10 : 0,
            recordKey: 'ha:dashboard',
            data: { dashboard: true }
          });
        }
        // notifications reçues : « ha » seul (les 3 dernières) ou « ha notif… »
        const wantNotifs = byKeyword && (!search || /^notif/i.test(search));
        if (wantNotifs) {
          hooks
            .history()
            .slice(0, search ? 15 : 3)
            .forEach((n, i) => {
              extra.push({
                title: n.title,
                subtitle: `${ago(n.receivedAt, env.lang())}${n.message ? ` · ${n.message.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`,
                icon: { kind: 'sprite', name: 'bell' },
                score: 900 - i,
                priority: 5,
                noRecord: true,
                data: { notification: n }
              });
            });
          if (search) return extra;
        }
      }
      let states: HaState[];
      try {
        states = (await client.states()).filter(isControllable);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // erreur montrée seulement quand on interroge HA exprès (mot-clé)
        return byKeyword
          ? [
              ...extra,
              {
                title: env.t(msg === 'not-configured' ? 'launcher.ha.notConfigured' : 'launcher.ha.unreachable'),
                subtitle: msg === 'not-configured' ? env.t('launcher.ha.notConfiguredSub') : msg,
                icon: { kind: 'sprite', name: 'alert' },
                score: 100,
                noRecord: true,
                data: { error: true }
              }
            ]
          : extra;
      }
      const { text, action } = splitHaAction(parsed.search);
      const out: ProviderItem[] = [...extra];
      for (const s of states) {
        let score = 80;
        let titleHl: number[] | undefined;
        if (text) {
          const m = bestMatch(text, [
            { text: label(s), weight: 1 },
            { text: s.entity_id, weight: 0.6 }
          ]);
          if (!m) continue;
          score = m.score;
          if (m.field === 0) titleHl = m.indices;
        } else if (!byKeyword) {
          continue;
        }
        const on = isOn(s);
        const verb = isOneShot(s.entity_id)
          ? env.t('launcher.ha.run')
          : env.t(action === 'on' || (action === 'toggle' && !on) ? 'launcher.ha.turnOn' : 'launcher.ha.turnOff');
        out.push({
          title: label(s),
          subtitle: `${isOneShot(s.entity_id) ? '' : `${env.t(on ? 'launcher.ha.isOn' : 'launcher.ha.isOff')} · `}${s.entity_id} — ${verb}`,
          icon: { kind: 'sprite', name: ICONS[s.entity_id.split('.')[0]] ?? 'home' },
          titleHl,
          score,
          priority: byKeyword ? 0 : -5,
          recordKey: s.entity_id,
          data: { state: s, action }
        });
      }
      return out;
    },
    execute(item): Promise<LauncherOutcome> | LauncherOutcome {
      const d = item.data as { state?: HaState; action?: HaAction; error?: boolean; dashboard?: boolean; notification?: HaNotification };
      if (d.dashboard) {
        hooks?.openDashboard();
        return { kind: 'hide' };
      }
      if (d.notification) {
        const url = d.notification.url;
        if (url && /^https?:/i.test(url) && !url.startsWith(env.settings().homeAssistant.url)) void env.openExternal(url);
        else hooks?.openDashboard(url?.startsWith('/') ? url : undefined);
        return { kind: 'hide' };
      }
      if (!d.state) {
        env.showMainWindow({ view: 'settings', section: 'homeassistant' });
        return { kind: 'hide' };
      }
      return exec(d.state, d.action ?? 'toggle');
    },
    actions(item): LauncherAction[] {
      const d = item.data as { state?: HaState; notification?: HaNotification };
      if (d.notification) return [{ id: 'copy', title: env.t('launcher.ha.copyText'), icon: 'copy' }];
      if (!d.state) return [];
      if (isOneShot(d.state.entity_id)) {
        return [{ id: 'on', title: env.t('launcher.ha.run'), icon: 'play', hint: 'Entrée' }];
      }
      return [
        { id: 'toggle', title: env.t('launcher.ha.toggle'), icon: 'refresh', hint: 'Entrée' },
        { id: 'on', title: env.t('launcher.ha.turnOn'), icon: 'sun' },
        { id: 'off', title: env.t('launcher.ha.turnOff'), icon: 'moon' },
        { id: 'copy', title: env.t('launcher.ha.copyId'), icon: 'copy' }
      ];
    },
    runAction(item, actionId): Promise<LauncherOutcome> | LauncherOutcome {
      const d = item.data as { state?: HaState; notification?: HaNotification };
      if (d.notification && actionId === 'copy') {
        env.copyText(`${d.notification.title}\n${d.notification.message}`.trim());
        return { kind: 'hide' };
      }
      if (!d.state) return { kind: 'hide' };
      if (actionId === 'copy') {
        env.copyText(d.state.entity_id);
        return { kind: 'hide' };
      }
      return exec(d.state, actionId === 'on' ? 'on' : actionId === 'off' ? 'off' : 'toggle');
    }
  };
}
