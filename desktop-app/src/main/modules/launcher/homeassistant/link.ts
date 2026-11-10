/**
 * Liaison permanente PC ↔ Home Assistant (intégration « mobile_app ») :
 *  1. enregistrement (une fois) → appareil + service notify.mobile_app_<nom> ;
 *  2. connexion WebSocket gardée ouverte, reconnexion automatique (veille,
 *     redémarrage de HA, coupure réseau) avec un ping toutes les 30 s ;
 *  3. abonnement au canal « local push » : les notifications arrivent ici et
 *     sont confirmées à HA ;
 *  4. capteurs du PC envoyés par webhook (seulement ce qui change).
 *
 * Si l'appareil est supprimé dans HA (webhook → 410), on se réenregistre
 * tout seul au lieu de rester en panne silencieuse.
 */
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { HaLinkState, HaLinkStatus } from '../../../../common/launcher';
import {
  HA_SENSORS,
  haButtonScripts,
  haNotifyService,
  haWebhookUrl,
  haWebSocketUrl,
  reconnectDelay,
  registerSensorPayload,
  registrationPayload,
  sensorUpdates,
  updateRegistrationPayload,
  type HaDeviceInfo,
  type HaRegistration,
  type HaSensorValues
} from '../core/ha-link';
import { haBaseUrl } from '../core/homeassistant';

export type HaLinkCoreStatus = Omit<HaLinkStatus, 'buttons'>;

export interface HaLinkDeps {
  url(): string;
  token(): string | null;
  device(): HaDeviceInfo;
  loadRegistration(): HaRegistration | null;
  saveRegistration(reg: HaRegistration | null): void;
  /** Valeurs actuelles des capteurs (null = capteurs désactivés). */
  sensors(): Promise<HaSensorValues> | null;
  sensorInterval(): number;
  /** Scripts-boutons à créer dans HA (null = aucun). */
  buttons(): { powerCommands: boolean } | null;
  onPush(message: unknown): void;
  onStatus(status: HaLinkCoreStatus): void;
  log(...args: unknown[]): void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    text: string
  ) {
    super(text);
  }
}

export class HaLink {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private subId = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongAt = 0;
  private sensorTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSensors: HaSensorValues | null = null;
  private sensorsRegistered = false;
  private running = false;
  private state: HaLinkState = 'off';
  /** Scripts-boutons présents dans HA (ids d'entité). */
  private buttons: string[] = [];
  private error: string | undefined;

  constructor(private readonly deps: HaLinkDeps) {}

  buttonIds(): string[] {
    return this.buttons;
  }

  status(): HaLinkCoreStatus {
    const reg = this.deps.loadRegistration();
    const name = reg?.device_name ?? this.deps.device().deviceName;
    return {
      state: this.state,
      notifyService: reg ? haNotifyService(reg.device_name) : null,
      deviceName: name,
      registered: !!reg,
      sensors: this.sensorsRegistered ? HA_SENSORS.length : 0,
      ...(this.error ? { error: this.error } : {})
    };
  }

  private setState(state: HaLinkState, error?: string): void {
    this.state = state;
    this.error = error;
    this.deps.onStatus(this.status());
  }

  private base(): string | null {
    return haBaseUrl(this.deps.url());
  }

  /** Démarre (ou redémarre après un changement de réglages). */
  start(): void {
    this.stop(false);
    this.running = true;
    this.attempt = 0;
    void this.connect();
  }

  stop(report = true): void {
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.sensorTimer) clearTimeout(this.sensorTimer);
    this.retryTimer = this.pingTimer = this.sensorTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners();
      ws.on('error', () => undefined);
      ws.close();
    }
    if (report) this.setState('off');
  }

  /** Après une sortie de veille / un déverrouillage : on reconnecte tout de suite. */
  nudge(): void {
    if (!this.running) return;
    if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.ping();
      void this.pushSensors(true);
      return;
    }
    this.attempt = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.connect();
  }

  private scheduleRetry(error: string): void {
    if (!this.running) return;
    this.setState('error', error);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = reconnectDelay(this.attempt++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private async http(path: string, body: unknown, auth = true): Promise<unknown> {
    const base = this.base();
    if (!base) throw new Error('not-configured');
    const token = this.deps.token();
    if (auth && !token) throw new Error('not-configured');
    const res = await fetch(path.startsWith('http') ? path : `${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) throw new HttpError(res.status, res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  /** Enregistre le PC si besoin (ou le réenregistre si HA l'a oublié). */
  private async ensureRegistered(): Promise<HaRegistration> {
    const device = this.deps.device();
    const existing = this.deps.loadRegistration();
    if (existing) {
      if (existing.device_name !== device.deviceName || existing.device_id !== device.deviceId) {
        // nom changé : on met à jour l'enregistrement (le service notify suit)
        try {
          await this.webhook(existing, { type: 'update_registration', data: updateRegistrationPayload(device) });
          const next = { ...existing, device_name: device.deviceName };
          this.deps.saveRegistration(next);
          return next;
        } catch (err) {
          if (!(err instanceof HttpError && err.status === 410)) throw err;
        }
      } else {
        return existing;
      }
    }
    this.setState('registering');
    const body = (await this.http('/api/mobile_app/registrations', registrationPayload(device))) as Partial<HaRegistration> | null;
    if (!body?.webhook_id) throw new Error('registration-failed');
    const reg: HaRegistration = {
      webhook_id: body.webhook_id,
      cloudhook_url: body.cloudhook_url ?? null,
      remote_ui_url: body.remote_ui_url ?? null,
      secret: body.secret ?? null,
      device_id: device.deviceId,
      device_name: device.deviceName
    };
    this.deps.saveRegistration(reg);
    this.sensorsRegistered = false;
    return reg;
  }

  /** Appel du webhook de l'appareil ; 410 = appareil supprimé dans HA. */
  async webhook(reg: HaRegistration, body: unknown): Promise<unknown> {
    const base = this.base();
    if (!base) throw new Error('not-configured');
    try {
      return await this.http(haWebhookUrl(base, reg), body, false);
    } catch (err) {
      // adresse locale injoignable : on tente le webhook cloud (Nabu Casa)
      if (!(err instanceof HttpError) && reg.cloudhook_url) return this.http(reg.cloudhook_url, body, false);
      throw err;
    }
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    const base = this.base();
    const token = this.deps.token();
    if (!base || !token) {
      this.setState('not-configured');
      return;
    }
    let reg: HaRegistration;
    try {
      reg = await this.ensureRegistered();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // jeton refusé : inutile de réessayer en boucle, on attend un nouveau jeton
      if (msg === 'unauthorized') {
        this.running = false;
        this.setState('error', msg);
        return;
      }
      this.scheduleRetry(msg);
      return;
    }
    if (!this.running) return;
    this.setState('connecting');

    const ws = new WebSocket(haWebSocketUrl(base), { handshakeTimeout: 10_000 });
    this.ws = ws;
    this.msgId = 0;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      this.onMessage(ws, reg, token, msg);
    });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.scheduleRetry('disconnected');
    });
    ws.on('error', (err) => {
      this.deps.log('[ha] websocket :', err.message);
      // 'close' suit toujours 'error' : la reconnexion part de là
    });
  }

  private send(msg: Record<string, unknown>): number {
    const id = ++this.msgId;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ id, ...msg }));
    return id;
  }

  private ping(): void {
    this.send({ type: 'ping' });
  }

  private onMessage(ws: WebSocket, reg: HaRegistration, token: string, msg: Record<string, unknown>): void {
    if (this.ws !== ws) return;
    switch (msg.type) {
      case 'auth_required':
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        return;
      case 'auth_invalid':
        this.running = false;
        ws.close();
        this.setState('error', 'unauthorized');
        return;
      case 'auth_ok':
        this.subId = this.send({
          type: 'mobile_app/push_notification_channel',
          webhook_id: reg.webhook_id,
          support_confirm: true
        });
        this.pongAt = Date.now();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          // pas de pong depuis 75 s : connexion morte (veille, Wi-Fi…) → on coupe
          if (Date.now() - this.pongAt > 75_000) {
            ws.terminate();
            return;
          }
          this.ping();
        }, 30_000);
        return;
      case 'pong':
        this.pongAt = Date.now();
        return;
      case 'result':
        if (msg.id === this.subId) {
          if (msg.success) {
            this.attempt = 0;
            this.setState('connected');
            void this.startSensors(reg);
            void this.ensureButtons(reg);
          } else {
            const e = msg.error as { code?: string; message?: string } | undefined;
            // webhook inconnu : HA a oublié l'appareil → nouvel enregistrement
            if (e?.code === 'not_found' || /webhook/i.test(e?.message ?? '')) this.deps.saveRegistration(null);
            ws.close();
          }
        }
        return;
      case 'event': {
        if (msg.id !== this.subId) return;
        this.pongAt = Date.now();
        const event = msg.event as Record<string, unknown> | undefined;
        if (!event) return;
        const confirmId = event.hass_confirm_id;
        if (typeof confirmId === 'string') {
          this.send({ type: 'mobile_app/push_notification_confirm', webhook_id: reg.webhook_id, confirm_id: confirmId });
        }
        this.deps.onPush(event);
        return;
      }
      default:
        return;
    }
  }

  /**
   * Crée les scripts-boutons qui manquent dans HA (sans écraser ceux que
   * l'utilisateur aurait modifiés). Il faut un jeton d'administrateur.
   */
  async ensureButtons(reg?: HaRegistration): Promise<void> {
    const r = reg ?? this.deps.loadRegistration();
    const want = this.deps.buttons();
    const base = this.base();
    const token = this.deps.token();
    if (!r || !want || !base || !token) {
      this.buttons = [];
      return;
    }
    const ids: string[] = [];
    for (const b of haButtonScripts(r.device_name, want.powerCommands)) {
      const url = `${base}/api/config/script/config/${encodeURIComponent(b.objectId)}`;
      try {
        const head = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000)
        });
        if (head.status === 404) {
          await this.http(url, b.config);
        } else if (!head.ok) {
          throw new Error(`HTTP ${head.status}`);
        }
        ids.push(`script.${b.objectId}`);
      } catch (err) {
        this.deps.log('[ha] bouton', b.objectId, ':', err);
      }
    }
    this.buttons = ids;
    this.deps.onStatus(this.status());
  }

  /** Renvoie à HA le bouton cliqué (comme l'appli mobile). */
  async fireAction(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    const reg = this.deps.loadRegistration();
    if (!reg) throw new Error('not-registered');
    await this.webhook(reg, {
      type: 'fire_event',
      data: { event_type: 'mobile_app_notification_action', event_data: { action, ...extra } }
    });
  }

  /* ─────────────── capteurs ─────────────── */

  private async startSensors(reg: HaRegistration): Promise<void> {
    if (this.sensorTimer) clearTimeout(this.sensorTimer);
    this.sensorTimer = null;
    const values = await this.deps.sensors();
    if (!values) return;
    try {
      if (!this.sensorsRegistered) {
        for (const def of HA_SENSORS) {
          await this.webhook(reg, registerSensorPayload(def, values[def.unique_id] ?? null));
        }
        this.sensorsRegistered = true;
        this.deps.onStatus(this.status());
      }
      this.lastSensors = null;
      await this.pushSensors(true);
    } catch (err) {
      this.deps.log('[ha] capteurs :', err);
    }
    this.loopSensors();
  }

  private loopSensors(): void {
    if (!this.running) return;
    if (this.sensorTimer) clearTimeout(this.sensorTimer);
    this.sensorTimer = setTimeout(() => {
      void this.pushSensors(false).finally(() => this.loopSensors());
    }, this.deps.sensorInterval() * 1000);
  }

  /** Envoie les capteurs qui ont changé (tous si `force`). */
  async pushSensors(force: boolean): Promise<void> {
    const reg = this.deps.loadRegistration();
    if (!reg || this.state !== 'connected') return;
    const p = this.deps.sensors();
    if (!p) return;
    const values = await p;
    const updates = sensorUpdates(values, this.lastSensors, force);
    if (updates.length === 0) return;
    try {
      await this.webhook(reg, { type: 'update_sensor_states', data: updates });
      this.lastSensors = values;
    } catch (err) {
      if (err instanceof HttpError && err.status === 410) {
        this.deps.saveRegistration(null);
        this.sensorsRegistered = false;
        this.nudgeReconnect();
      }
    }
  }

  private nudgeReconnect(): void {
    this.ws?.close();
  }

  /** Oublie l'enregistrement (le PC sera réenregistré au prochain démarrage). */
  forget(): void {
    this.stop();
    this.deps.saveRegistration(null);
    this.sensorsRegistered = false;
    this.lastSensors = null;
  }

  static newDeviceId(): string {
    return randomUUID();
  }
}
