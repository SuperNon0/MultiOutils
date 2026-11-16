/**
 * Client WebSocket Home Assistant, sans dépendance : le constructeur WebSocket
 * est fourni par l'appelant (`ws` dans l'app Electron et dans le plugin
 * Stream Deck). Utilisé par le pont Stream Deck de l'app et par la connexion
 * directe de secours du plugin.
 *
 *  - authentification par jeton longue durée ;
 *  - états en direct (abonnement state_changed) ;
 *  - reconnexion automatique avec attente croissante (veille du PC,
 *    redémarrage de HA, coupure Wi-Fi) ;
 *  - adresse locale puis adresse distante si la première ne répond pas.
 */

export interface HaRawState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

/** Surface minimale d'un WebSocket (compatible `ws` et navigateur). */
export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}
export type WsCtor = new (url: string) => WsLike;

export type HaSocketState = 'off' | 'connecting' | 'connected' | 'auth_failed' | 'error';

export interface HaSocketOptions {
  /** Adresses à essayer dans l'ordre (locale, puis distante). */
  urls: () => string[];
  token: () => string | null;
  WebSocket: WsCtor;
  /** Délai maximum d'une requête, en ms. */
  timeout?: number;
  log?: (...args: unknown[]) => void;
}

export class HaError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

/** ws://hôte/api/websocket depuis http(s)://hôte. */
export function haSocketUrl(base: string): string {
  return base.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/api/websocket';
}

/** Adresse de base nettoyée (« homeassistant.local:8123 » → http://…). */
export function cleanHaUrl(raw: string | undefined | null): string | null {
  let v = (raw ?? '').trim().replace(/\/+$/, '');
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

const OPEN = 1;

export class HaSocket {
  private ws: WsLike | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private subs = new Map<number, (event: unknown) => void>();
  private states = new Map<string, HaRawState>();
  private readyWaiters: Array<{ resolve(): void; reject(e: Error): void }> = [];
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private urlIndex = 0;
  private wanted = false;
  private listeners = new Set<(changed: HaRawState[]) => void>();
  private statusListeners = new Set<(s: HaSocketState) => void>();
  private _state: HaSocketState = 'off';
  /** Adresse effectivement connectée. */
  base: string | null = null;
  /** Incrémenté à chaque changement d'état reçu (pour l'attente longue). */
  version = 0;

  constructor(private opts: HaSocketOptions) {}

  get state(): HaSocketState {
    return this._state;
  }

  private setState(s: HaSocketState): void {
    if (this._state === s) return;
    this._state = s;
    for (const l of this.statusListeners) l(s);
  }

  onStatus(fn: (s: HaSocketState) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** Changements d'états (déjà appliqués au cache). */
  onChange(fn: (changed: HaRawState[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Démarre (ou garde) la connexion. */
  start(): void {
    this.wanted = true;
    if (this.ws || this.retryTimer) return;
    this.open();
  }

  /** Coupe et oublie tout (réglages changés). */
  stop(): void {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* déjà fermé */
      }
    }
    this.failAll(new HaError('Connexion fermée', 'closed'));
    this.states.clear();
    this.subs.clear();
    this.base = null;
    this.setState('off');
  }

  /** Reconnexion immédiate (sortie de veille). */
  nudge(): void {
    if (!this.wanted) return;
    if (this._state === 'connected' && this.ws?.readyState === OPEN) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retry = 0;
    if (!this.ws) this.open();
  }

  /** Attend la connexion (et le chargement des états). */
  ready(timeoutMs = 8000): Promise<void> {
    if (this._state === 'connected') return Promise.resolve();
    this.start();
    return new Promise((resolve, reject) => {
      const w = { resolve: () => (clearTimeout(t), resolve()), reject: (e: Error) => (clearTimeout(t), reject(e)) };
      const t = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((x) => x !== w);
        reject(new HaError(this._state === 'auth_failed' ? 'Jeton refusé par Home Assistant' : 'Home Assistant ne répond pas', this._state === 'auth_failed' ? 'auth' : 'timeout'));
      }, timeoutMs);
      this.readyWaiters.push(w);
    });
  }

  allStates(): HaRawState[] {
    return [...this.states.values()];
  }

  getState(id: string): HaRawState | undefined {
    return this.states.get(id);
  }

  /** Commande WebSocket brute (type + champs). */
  async command<T = unknown>(msg: Record<string, unknown>): Promise<T> {
    await this.ready();
    return this.send<T>(msg);
  }

  callService(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): Promise<unknown> {
    const msg: Record<string, unknown> = { type: 'call_service', domain, service };
    if (data && Object.keys(data).length) msg.service_data = data;
    if (target && Object.keys(target).length) msg.target = target;
    return this.command(msg);
  }

  fireEvent(eventType: string, data?: Record<string, unknown>): Promise<unknown> {
    return this.command({ type: 'fire_event', event_type: eventType, ...(data ? { event_data: data } : {}) });
  }

  /** Rend un modèle une fois (abonnement puis désabonnement). */
  async renderTemplate(template: string, timeoutMs = 6000): Promise<string> {
    await this.ready();
    return new Promise<string>((resolve, reject) => {
      const id = ++this.seq;
      const done = (fn: () => void): void => {
        clearTimeout(timer);
        this.subs.delete(id);
        this.pending.delete(id);
        if (this.ws?.readyState === OPEN) this.raw({ id: ++this.seq, type: 'unsubscribe_events', subscription: id });
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new HaError('Modèle sans réponse', 'timeout'))), timeoutMs);
      this.pending.set(id, {
        resolve: () => undefined,
        reject: (e) => done(() => reject(e)),
        timer
      });
      this.subs.set(id, (ev) => {
        const e = ev as { result?: unknown; error?: string };
        if (e && typeof e.error === 'string') done(() => reject(new HaError(e.error as string, 'template')));
        else done(() => resolve(e?.result == null ? '' : typeof e.result === 'string' ? e.result : JSON.stringify(e.result)));
      });
      this.raw({ id, type: 'render_template', template, report_errors: true });
    });
  }

  /* ───────── interne ───────── */

  private raw(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  private send<T>(msg: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== OPEN) return reject(new HaError('Home Assistant non connecté', 'offline'));
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HaError('Home Assistant ne répond pas', 'timeout'));
      }, this.opts.timeout ?? 10_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.ws.send(JSON.stringify({ id, ...msg }));
    });
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private open(): void {
    const urls = this.opts.urls().map(cleanHaUrl).filter((u): u is string => !!u);
    const token = this.opts.token();
    if (!urls.length || !token) {
      this.setState('off');
      for (const w of this.readyWaiters.splice(0)) w.reject(new HaError('Home Assistant n’est pas configuré', 'not_configured'));
      return;
    }
    const base = urls[this.urlIndex % urls.length];
    this.setState('connecting');
    let ws: WsLike;
    try {
      ws = new this.opts.WebSocket(haSocketUrl(base));
    } catch (e) {
      this.opts.log?.('[ha] ouverture impossible', e);
      this.scheduleRetry(urls.length);
      return;
    }
    this.ws = ws;
    let authed = false;
    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type;
      if (type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (type === 'auth_invalid') {
        this.setState('auth_failed');
        this.wanted = false;
        for (const w of this.readyWaiters.splice(0)) w.reject(new HaError('Jeton refusé par Home Assistant', 'auth'));
        try {
          ws.close();
        } catch {
          /* rien */
        }
      } else if (type === 'auth_ok') {
        authed = true;
        this.retry = 0;
        this.base = base;
        void this.afterAuth();
      } else if (type === 'result') {
        const p = this.pending.get(msg.id as number);
        if (!p) return;
        if (this.subs.has(msg.id as number)) {
          // abonnement : on attend l'événement, l'échec seul compte ici
          if (!msg.success) {
            const err = msg.error as { message?: string; code?: string } | undefined;
            p.reject(new HaError(err?.message ?? 'Erreur Home Assistant', err?.code ?? 'error'));
          }
          return;
        }
        clearTimeout(p.timer);
        this.pending.delete(msg.id as number);
        if (msg.success) p.resolve(msg.result);
        else {
          const err = msg.error as { message?: string; code?: string } | undefined;
          p.reject(new HaError(err?.message ?? 'Erreur Home Assistant', err?.code ?? 'error'));
        }
      } else if (type === 'event') {
        const sub = this.subs.get(msg.id as number);
        if (sub) sub(msg.event);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failAll(new HaError('Connexion perdue', 'closed'));
      this.subs.clear();
      if (!this.wanted) return;
      if (this._state !== 'auth_failed') this.setState('error');
      // la locale n'a jamais répondu : on essaie l'adresse suivante
      if (!authed) this.urlIndex++;
      this.scheduleRetry(urls.length);
    };
    ws.onerror = () => {
      /* onclose suit */
    };
  }

  private scheduleRetry(urlCount: number): void {
    if (!this.wanted || this.retryTimer) return;
    // essai rapide de l'autre adresse, puis attente croissante (max 60 s)
    const quick = urlCount > 1 && this.urlIndex % urlCount !== 0;
    const delay = quick ? 300 : Math.min(60_000, 1000 * 2 ** Math.min(this.retry++, 6));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted && !this.ws) this.open();
    }, delay);
  }

  private async afterAuth(): Promise<void> {
    try {
      const subId = ++this.seq;
      this.subs.set(subId, (ev) => this.onStateChanged(ev));
      this.pending.set(subId, {
        resolve: () => undefined,
        reject: (e) => this.opts.log?.('[ha] abonnement refusé', e),
        timer: setTimeout(() => undefined, 0)
      });
      this.raw({ id: subId, type: 'subscribe_events', event_type: 'state_changed' });
      const list = await this.send<HaRawState[]>({ type: 'get_states' });
      this.states = new Map((Array.isArray(list) ? list : []).filter((s) => s && typeof s.entity_id === 'string').map((s) => [s.entity_id, s]));
      this.version++;
      this.setState('connected');
      for (const w of this.readyWaiters.splice(0)) w.resolve();
      const all = [...this.states.values()];
      for (const l of this.listeners) l(all);
    } catch (e) {
      this.opts.log?.('[ha] chargement des états', e);
    }
  }

  private onStateChanged(ev: unknown): void {
    const data = (ev as { data?: { entity_id?: string; new_state?: HaRawState | null } })?.data;
    if (!data?.entity_id) return;
    if (data.new_state) this.states.set(data.entity_id, data.new_state);
    else this.states.delete(data.entity_id);
    this.version++;
    const changed = data.new_state ? [data.new_state] : [];
    for (const l of this.listeners) l(changed);
  }
}
