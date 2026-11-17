/**
 * Accès à Home Assistant depuis le plugin.
 *
 *  1. Par MultiOutils (recommandé) : l'app garde la connexion et le jeton
 *     chiffré ; le plugin lui parle sur 127.0.0.1:41320 (attente longue des
 *     changements d'état).
 *  2. En secours, si l'app n'est pas lancée : connexion directe du plugin à
 *     HA, avec l'adresse et le jeton saisis dans le panneau « Connexion »
 *     (réglages globaux du plugin, gardés par le logiciel Stream Deck).
 */
import WebSocket from 'ws';
import { HaSocket, cleanHaUrl, type HaRawState, type WsCtor } from '../../../packages/shared/src/ha/socket';
import { buildCatalog, normalizeServices, type HaCatalog, type HaServiceInfo } from '../../../packages/shared/src/ha/model';

const APP = 'http://127.0.0.1:41320';

export type HubMode = 'app' | 'direct' | 'off';
export interface HubStatus {
  mode: HubMode;
  /** connected | connecting | error | auth_failed | off | not_configured */
  state: string;
  /** L'app MultiOutils répond-elle ? */
  app: boolean;
}

export interface DirectConfig {
  url?: string;
  remoteUrl?: string;
  token?: string;
}

async function appFetch<T>(path: string, init: RequestInit & { timeout?: number } = {}): Promise<T> {
  const res = await fetch(APP + path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    signal: AbortSignal.timeout(init.timeout ?? 5000)
  });
  const data = (await res.json().catch(() => null)) as T & { error?: string };
  if (!res.ok) throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${res.status}`);
  return data;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class HaHub {
  private states = new Map<string, HaRawState>();
  private watched = new Map<string, number>();
  private version = -1;
  private direct: HaSocket | null = null;
  private directCfg: DirectConfig = {};
  private listeners = new Set<(ids: string[] | null) => void>();
  private iconCache = new Map<string, string | null>();
  private iconWaiting = new Set<string>();
  private iconTimer: ReturnType<typeof setTimeout> | null = null;
  status: HubStatus = { mode: 'off', state: 'off', app: false };
  private running = false;

  constructor(private log: (...a: unknown[]) => void = () => undefined) {}

  /** Changement d'état (ids) ou de connexion (null). */
  onChange(fn: (ids: string[] | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(ids: string[] | null): void {
    for (const l of this.listeners) l(ids);
  }

  get(id: string): HaRawState | undefined {
    return this.states.get(id);
  }

  watch(id: string): void {
    if (!id) return;
    const n = this.watched.get(id) ?? 0;
    this.watched.set(id, n + 1);
    if (n === 0) void this.fetchNow([id]);
    this.start();
  }

  unwatch(id: string): void {
    const n = this.watched.get(id) ?? 0;
    if (n <= 1) this.watched.delete(id);
    else this.watched.set(id, n - 1);
  }

  setDirect(cfg: DirectConfig): void {
    const same = cfg.url === this.directCfg.url && cfg.remoteUrl === this.directCfg.remoteUrl && cfg.token === this.directCfg.token;
    this.directCfg = { url: cfg.url ?? '', remoteUrl: cfg.remoteUrl ?? '', token: cfg.token ?? '' };
    if (!same && this.direct) {
      this.direct.stop();
      this.direct = null;
    }
  }

  directConfigured(): boolean {
    return !!(cleanHaUrl(this.directCfg.url) || cleanHaUrl(this.directCfg.remoteUrl)) && !!this.directCfg.token;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  private setStatus(next: HubStatus): void {
    const changed = next.mode !== this.status.mode || next.state !== this.status.state || next.app !== this.status.app;
    this.status = next;
    if (changed) this.emit(null);
  }

  private async loop(): Promise<void> {
    for (;;) {
      let app: { configured: boolean; state: string } | null = null;
      try {
        app = await appFetch('/ha/status', { timeout: 2500 });
      } catch {
        app = null;
      }
      if (app && app.configured) {
        this.stopDirect();
        this.setStatus({ mode: 'app', state: app.state, app: true });
        try {
          const ids = [...this.watched.keys()].join(',');
          const r = await appFetch<{ version: number; state: string; states: Record<string, HaRawState> }>(
            `/ha/wait?since=${this.version}&ids=${encodeURIComponent(ids)}`,
            { timeout: 30_000 }
          );
          this.version = r.version;
          this.setStatus({ mode: 'app', state: r.state, app: true });
          this.applyStates(r.states);
          if (r.state !== 'connected') await sleep(1500);
        } catch (e) {
          this.log('[ha] attente', e);
          await sleep(1500);
        }
        continue;
      }
      if (this.directConfigured()) {
        const s = this.ensureDirect();
        this.setStatus({ mode: 'direct', state: s.state, app: !!app });
        await sleep(4000); // on revérifie régulièrement si l'app est revenue
        continue;
      }
      this.stopDirect();
      this.setStatus({ mode: 'off', state: app ? 'not_configured' : 'off', app: !!app });
      await sleep(3000);
    }
  }

  private applyStates(states: Record<string, HaRawState> | undefined): void {
    if (!states) return;
    const changed: string[] = [];
    for (const [id, s] of Object.entries(states)) {
      const prev = this.states.get(id);
      if (!prev || prev.last_updated !== s.last_updated || prev.state !== s.state) changed.push(id);
      this.states.set(id, s);
    }
    if (changed.length) this.emit(changed);
  }

  private async fetchNow(ids: string[]): Promise<void> {
    if (this.status.mode === 'direct' && this.direct) {
      const out: Record<string, HaRawState> = {};
      for (const id of ids) {
        const s = this.direct.getState(id);
        if (s) out[id] = s;
      }
      this.applyStates(out);
      return;
    }
    try {
      const r = await appFetch<{ states: Record<string, HaRawState> }>(`/ha/states?ids=${encodeURIComponent(ids.join(','))}`);
      this.applyStates(r.states);
    } catch {
      /* la boucle s'en chargera */
    }
  }

  private ensureDirect(): HaSocket {
    if (!this.direct) {
      const cfg = this.directCfg;
      this.direct = new HaSocket({
        urls: () => [cfg.url ?? '', cfg.remoteUrl ?? ''],
        token: () => cfg.token || null,
        WebSocket: WebSocket as unknown as WsCtor,
        log: this.log
      });
      this.direct.onChange((changed) => {
        const watchedChanged = changed.filter((s) => this.watched.has(s.entity_id));
        for (const s of watchedChanged) this.states.set(s.entity_id, s);
        if (changed.length > 50) {
          // premier chargement : tout ce qui est suivi
          for (const id of this.watched.keys()) {
            const s = this.direct?.getState(id);
            if (s) this.states.set(id, s);
          }
          this.emit([...this.watched.keys()]);
        } else if (watchedChanged.length) this.emit(watchedChanged.map((s) => s.entity_id));
      });
      this.direct.onStatus((st) => this.setStatus({ mode: 'direct', state: st, app: this.status.app }));
    }
    this.direct.start();
    return this.direct;
  }

  private stopDirect(): void {
    if (this.direct) {
      this.direct.stop();
      this.direct = null;
    }
  }

  /** Sortie de veille, réglages changés : on repart tout de suite. */
  nudge(): void {
    this.direct?.nudge();
  }

  /* ───────── appels ───────── */

  async call(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): Promise<void> {
    if (this.status.mode === 'direct' && this.direct) {
      await this.direct.callService(domain, service, data, target);
      return;
    }
    await appFetch('/ha/call', { method: 'POST', body: JSON.stringify({ domain, service, data, target }), timeout: 12_000 });
  }

  async event(type: string, data?: Record<string, unknown>): Promise<void> {
    if (this.status.mode === 'direct' && this.direct) {
      await this.direct.fireEvent(type, data);
      return;
    }
    await appFetch('/ha/event', { method: 'POST', body: JSON.stringify({ type, data }) });
  }

  async template(template: string): Promise<string> {
    if (this.status.mode === 'direct' && this.direct) return this.direct.renderTemplate(template);
    const r = await appFetch<{ result: string }>('/ha/template', { method: 'POST', body: JSON.stringify({ template }), timeout: 8000 });
    return r.result;
  }

  async catalog(): Promise<HaCatalog> {
    if (this.status.mode === 'direct' && this.direct) {
      await this.direct.ready();
      const soft = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined);
      const [entities, devices, areas, floors] = await Promise.all([
        soft(this.direct.command<never[]>({ type: 'config/entity_registry/list' })),
        soft(this.direct.command<never[]>({ type: 'config/device_registry/list' })),
        soft(this.direct.command<never[]>({ type: 'config/area_registry/list' })),
        soft(this.direct.command<never[]>({ type: 'config/floor_registry/list' }))
      ]);
      return buildCatalog(this.direct.allStates(), { entities, devices, areas, floors });
    }
    return appFetch<HaCatalog>('/ha/catalog', { timeout: 12_000 });
  }

  async services(): Promise<HaServiceInfo[]> {
    if (this.status.mode === 'direct' && this.direct) return normalizeServices(await this.direct.command({ type: 'get_services' }));
    return appFetch<HaServiceInfo[]>('/ha/services', { timeout: 12_000 });
  }

  /** Image de caméra ou pochette (data URL), via l'app uniquement. */
  async image(src: string, size = 144): Promise<string | null> {
    if (this.status.mode !== 'app') return null;
    try {
      const r = await appFetch<{ image?: string }>(`/ha/image?src=${encodeURIComponent(src)}&size=${size}`, { timeout: 10_000 });
      return r.image ?? null;
    } catch {
      return null;
    }
  }

  /** Grand sélecteur d'entités dans une fenêtre MultiOutils ; null = annulé. */
  async pick(current?: string, domains: string[] = [], title = ''): Promise<string | null> {
    const r = await appFetch<{ id?: string | null }>('/ha/pick', { method: 'POST', body: JSON.stringify({ current: current ?? '', domains, title }), timeout: 15 * 60_000 });
    return typeof r?.id === 'string' && r.id ? r.id : null;
  }

  async openCamera(id: string): Promise<void> {
    await appFetch('/ha/camera/open', { method: 'POST', body: JSON.stringify({ id }) });
  }

  /* ───────── icônes Material Design (fournies par l'app) ───────── */

  /** Tracé SVG d'une icône mdi:… ; undefined = en cours de chargement. */
  icon(name: string): string | null | undefined {
    if (this.iconCache.has(name)) return this.iconCache.get(name);
    this.iconWaiting.add(name);
    if (!this.iconTimer) this.iconTimer = setTimeout(() => void this.loadIcons(), 30);
    return undefined;
  }

  private async loadIcons(): Promise<void> {
    this.iconTimer = null;
    const names = [...this.iconWaiting].slice(0, 100);
    for (const n of names) this.iconWaiting.delete(n);
    try {
      const r = await appFetch<Record<string, string>>(`/ha/icons?names=${encodeURIComponent(names.join(','))}`);
      for (const n of names) this.iconCache.set(n, r[n] ?? null);
    } catch {
      // app absente : glyphe de secours ; on réessaiera plus tard
      setTimeout(() => {
        for (const n of names) if (this.iconCache.get(n) === null) this.iconCache.delete(n);
      }, 30_000);
      for (const n of names) this.iconCache.set(n, null);
    }
    this.emit(null);
    if (this.iconWaiting.size) this.iconTimer = setTimeout(() => void this.loadIcons(), 30);
  }
}
