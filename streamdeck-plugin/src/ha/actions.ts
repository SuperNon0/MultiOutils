/**
 * Touches Home Assistant du plugin : une seule action « Home Assistant » qui
 * s'adapte à l'entité choisie, plus les touches PC (veille, verrouiller,
 * éteindre, redémarrer). Les réglages se font dans le panneau de la touche
 * (ui/ha.html), qui parle au plugin par sendToPlugin.
 */
import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type JsonObject,
  type JsonValue,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent
} from '@elgato/streamdeck';
import {
  defaultIcon,
  formatState,
  gaugePercent,
  haDomainOf,
  isOnState,
  isUnavailable,
  lightColor,
  matchRule,
  searchEntities
} from '../../../packages/shared/src/ha/model';
import type { HaRawState } from '../../../packages/shared/src/ha/socket';
import { HaHub, type DirectConfig } from './hub';
import { HA_KINDS, type HaKind } from './kinds';
import { fallbackFor, FALLBACK, renderKey, type KeyStyle } from './render';
import { gaugeByDefault, planPress, showsValueByDefault, type HaKeySettings } from './settings';

export interface PluginTheme {
  theme: 'dark' | 'light';
  accent: string;
  background: string;
  live: string;
}

interface Env {
  theme(): PluginTheme;
}

interface SdKey {
  id: string;
  setTitle(title: string): Promise<void>;
  setImage(image: string): Promise<void>;
  showAlert(): Promise<void>;
  showOk(): Promise<void>;
  setSettings(s: JsonObject): Promise<void>;
}

interface Entry {
  key: SdKey;
  s: HaKeySettings;
  watching: string;
  image?: string | null;
  imageAt?: number;
  imageSrc?: string;
  templateValue?: string;
  templateAt?: number;
  confirmUntil?: number;
  lastSvg?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const CONFIRM_MS = 3000;

interface GlobalSettings extends JsonObject {
  direct?: { url?: string; remoteUrl?: string; token?: string };
  clip?: JsonObject;
}

export function registerHaActions(env: Env): { rerender(): void } {
  const hub = new HaHub((...a) => streamDeck.logger.debug(a.map(String).join(' ')));
  const entries = new Map<string, Entry>();
  let blink = false;
  let globals: GlobalSettings = {};

  const applyGlobals = (g: GlobalSettings): void => {
    globals = g ?? {};
    const d = (globals.direct ?? {}) as DirectConfig;
    hub.setDirect({ url: d.url ?? '', remoteUrl: d.remoteUrl ?? '', token: d.token ?? '' });
  };
  streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => applyGlobals(ev.settings));
  void streamDeck.settings.getGlobalSettings<GlobalSettings>().then(applyGlobals).catch(() => undefined);

  /* ───────── dessin ───────── */

  const draw = async (e: Entry): Promise<void> => {
    const t = env.theme();
    const s = e.s;
    const id = s.entity ?? '';
    const domain = haDomainOf(id);
    const st: HaRawState | undefined = id ? hub.get(id) : undefined;
    const offline = hub.status.state !== 'connected';
    const mode = s.mode ?? 'auto';
    const on = mode === 'template' || mode === 'event' || mode === 'service' ? true : isOnState(st) || ['scene', 'script', 'button', 'input_button'].includes(domain);
    const rule = matchRule(s.rules, st);

    // icône
    let iconName = rule?.icon || (on ? s.icon : s.iconOff || s.icon) || '';
    if (!iconName) {
      if (mode === 'template') iconName = 'mdi:code-braces';
      else if (mode === 'event') iconName = 'mdi:lightning-bolt';
      else if (id) iconName = defaultIcon(st, id, on);
      else iconName = 'mdi:home-assistant';
    }
    const iconPath = iconName.startsWith('mdi:') ? hub.icon(iconName) : null;

    // couleur
    let color = HEX.test(s.color ?? '') ? (s.color as string) : t.accent;
    if (!on && HEX.test(s.colorOff ?? '')) color = s.colorOff as string;
    if (s.lightColor !== false) color = lightColor(st) ?? color;
    if (rule?.color && HEX.test(rule.color)) color = rule.color;

    // textes
    const title =
      s.titleMode === 'none' ? '' : s.titleMode === 'custom' ? (s.titleText ?? '') : ((st?.attributes?.friendly_name as string) ?? (id ? id.split('.')[1] : 'Home Assistant'));
    let value = '';
    const wantValue = s.valueMode === 'show' || (s.valueMode !== 'hide' && showsValueByDefault(id, mode));
    if (mode === 'template') value = e.templateValue ?? '…';
    else if (wantValue && st) value = formatState(st, s.decimals ?? null);
    const gauge = (s.gauge ?? gaugeByDefault(id)) ? gaugePercent(st) : null;

    // image (caméra, pochette)
    let image: string | null = null;
    if (mode === 'camera' || (mode === 'auto' && domain === 'camera')) image = e.image ?? null;
    if (domain === 'media_player' && s.art !== false && st?.state === 'playing' && e.image) image = e.image;

    const svg = renderKey({
      style: (s.style ?? 'accent') as KeyStyle,
      background: t.background,
      dark: t.theme === 'dark',
      color,
      on,
      iconPath: iconPath ?? null,
      fallback: mode === 'template' ? FALLBACK.template : mode === 'event' ? FALLBACK.event : fallbackFor(domain),
      title: title ? String(title) : '',
      value,
      gauge: gauge ?? null,
      unavailable: !!id && mode !== 'event' && mode !== 'template' && isUnavailable(st) && !offline,
      offline,
      image,
      dimmed: !!rule?.blink && blink,
      confirm: e.confirmUntil && e.confirmUntil > Date.now() ? 'Confirmer ?' : undefined
    });
    if (svg !== e.lastSvg) {
      e.lastSvg = svg;
      await e.key.setImage(svg);
    }
  };

  const drawAll = (): void => {
    for (const e of entries.values()) void draw(e);
  };

  hub.onChange((ids) => {
    for (const e of entries.values()) {
      if (!ids || (e.watching && ids.includes(e.watching))) {
        void refreshImage(e);
        void draw(e);
      }
    }
  });

  /** Image de caméra / pochette, rafraîchie à intervalle. */
  const refreshImage = async (e: Entry, force = false): Promise<void> => {
    const id = e.s.entity ?? '';
    const d = haDomainOf(id);
    const mode = e.s.mode ?? 'auto';
    let src = '';
    if (d === 'camera' && (mode === 'camera' || mode === 'auto')) src = id;
    else if (d === 'media_player' && e.s.art !== false) {
      const st = hub.get(id);
      const pic = st?.attributes?.entity_picture;
      if (st?.state === 'playing' && typeof pic === 'string') src = pic;
    }
    if (!src) {
      if (e.image) {
        e.image = null;
        void draw(e);
      }
      return;
    }
    const every = d === 'camera' ? Math.max(2, Number(e.s.refresh) || 10) * 1000 : 0;
    if (!force && e.imageSrc === src && (!every || Date.now() - (e.imageAt ?? 0) < every)) return;
    e.imageSrc = src;
    e.imageAt = Date.now();
    const img = await hub.image(src, 144);
    if (img) {
      e.image = img;
      void draw(e);
    }
  };

  const refreshTemplate = async (e: Entry, force = false): Promise<void> => {
    if (e.s.mode !== 'template' || !e.s.template?.trim()) return;
    const every = Math.max(2, Number(e.s.refresh) || 10) * 1000;
    if (!force && Date.now() - (e.templateAt ?? 0) < every) return;
    e.templateAt = Date.now();
    try {
      e.templateValue = (await hub.template(e.s.template)).trim();
    } catch (err) {
      e.templateValue = '⚠';
      streamDeck.logger.warn('modèle', err);
    }
    void draw(e);
  };

  const setSettings = (e: Entry, s: HaKeySettings): void => {
    const nextId = s.entity ?? '';
    if (nextId !== e.watching) {
      if (e.watching) hub.unwatch(e.watching);
      if (nextId) hub.watch(nextId);
      e.watching = nextId;
      e.image = null;
      e.imageSrc = undefined;
    }
    e.s = s;
    e.templateAt = 0;
    void refreshImage(e, true);
    void refreshTemplate(e, true);
    void draw(e);
  };

  // Rafraîchissements périodiques : clignotement, caméras, modèles.
  setInterval(() => {
    blink = !blink;
    for (const e of entries.values()) {
      if (e.s.rules?.some((r) => r?.blink)) void draw(e);
      if (e.confirmUntil && e.confirmUntil < Date.now()) {
        e.confirmUntil = 0;
        void draw(e);
      }
    }
  }, 600);
  setInterval(() => {
    for (const e of entries.values()) {
      void refreshImage(e);
      void refreshTemplate(e);
    }
  }, 2000);

  /* ───────── appui ───────── */

  const press = async (e: Entry): Promise<void> => {
    const s = e.s;
    if (s.confirm) {
      if (!e.confirmUntil || e.confirmUntil < Date.now()) {
        e.confirmUntil = Date.now() + CONFIRM_MS;
        await draw(e);
        return;
      }
      e.confirmUntil = 0;
      await draw(e);
    }
    const st = s.entity ? hub.get(s.entity) : undefined;
    try {
      const plan = planPress(s, st);
      if (plan.kind === 'service') await hub.call(plan.domain, plan.service, plan.data, plan.target);
      else if (plan.kind === 'event') await hub.event(plan.type, plan.data);
      else if (plan.kind === 'camera') {
        if (s.cameraOpen === false) await refreshImage(e, true);
        else await hub.openCamera(plan.id);
      } else if (s.mode === 'template') {
        await refreshTemplate(e, true);
        return;
      } else {
        await e.key.showAlert();
        return;
      }
      await e.key.showOk();
    } catch (err) {
      streamDeck.logger.warn('[ha] appui', err);
      await e.key.showAlert();
    }
  };

  /* ───────── panneau de réglages ───────── */

  const reply = (payload: JsonValue): void => {
    void streamDeck.ui.current?.sendToPropertyInspector(payload);
  };

  const onMessage = async (e: Entry | undefined, msg: Record<string, unknown>, kind: HaKind): Promise<void> => {
    const cmd = msg.cmd;
    try {
      if (cmd === 'status') {
        reply({ cmd, status: hub.status as unknown as JsonObject, direct: { url: globals.direct?.url ?? '', remoteUrl: globals.direct?.remoteUrl ?? '', hasToken: !!globals.direct?.token }, hasClip: !!globals.clip });
      } else if (cmd === 'catalog') {
        const cat = await hub.catalog();
        reply({ cmd, catalog: cat as unknown as JsonObject });
      } else if (cmd === 'search') {
        const cat = await hub.catalog();
        const list = searchEntities(cat.entities, String(msg.q ?? ''), { area: (msg.area as string) || undefined, floor: (msg.floor as string) || undefined, domain: (msg.domain as string) || undefined });
        reply({ cmd, results: list as unknown as JsonValue });
      } else if (cmd === 'services') {
        reply({ cmd, services: (await hub.services()) as unknown as JsonValue });
      } else if (cmd === 'state') {
        const id = String(msg.id ?? '');
        reply({ cmd, id, state: (hub.get(id) ?? null) as unknown as JsonValue });
      } else if (cmd === 'test' && e) {
        await press({ ...e, s: { ...e.s, confirm: false } });
        reply({ cmd, ok: true });
      } else if (cmd === 'preview' && e) {
        reply({ cmd, image: e.lastSvg ?? '' });
      } else if (cmd === 'direct') {
        const d = (msg.direct ?? {}) as { url?: string; remoteUrl?: string; token?: string };
        const cur = globals.direct ?? {};
        const next: GlobalSettings = { ...globals, direct: { url: d.url ?? cur.url ?? '', remoteUrl: d.remoteUrl ?? cur.remoteUrl ?? '', token: d.token === undefined ? (cur.token ?? '') : d.token } };
        await streamDeck.settings.setGlobalSettings(next);
        applyGlobals(next);
        reply({ cmd, ok: true });
      } else if (cmd === 'pick' && e) {
        if (hub.status.mode !== 'app') return reply({ cmd, error: 'Le grand sélecteur a besoin de MultiOutils ouvert.' });
        const id = await hub.pick(e.s.entity, kind.domains, String(msg.title ?? ''));
        if (!id) return reply({ cmd, ok: false });
        const same = (e.s.entity ?? '').split('.')[0] === id.split('.')[0];
        const { mode: _m, preset: _p, ...rest } = e.s;
        const s: HaKeySettings = same ? { ...e.s, entity: id } : { ...rest, entity: id };
        await e.key.setSettings(s as unknown as JsonObject);
        setSettings(e, s);
        reply({ cmd, ok: true, settings: s as unknown as JsonObject });
      } else if (cmd === 'copy' && e) {
        const { entity: _ent, ...rest } = e.s;
        const next: GlobalSettings = { ...globals, clip: rest as unknown as JsonObject };
        await streamDeck.settings.setGlobalSettings(next);
        applyGlobals(next);
        reply({ cmd, ok: true });
      } else if (cmd === 'paste' && e) {
        if (!globals.clip) return reply({ cmd, ok: false });
        const s = { ...(globals.clip as HaKeySettings), entity: e.s.entity };
        await e.key.setSettings(s as unknown as JsonObject);
        setSettings(e, s);
        reply({ cmd, ok: true, settings: s as unknown as JsonObject });
      }
    } catch (err) {
      reply({ cmd: String(cmd), error: err instanceof Error ? err.message : String(err) });
    }
  };

  // une action par modèle de touche (lumière, volet, capteur…), même code
  for (const kind of HA_KINDS) {
    class HaKey extends SingletonAction<JsonObject> {
      override readonly manifestId = kind.uuid;
      override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
        const key = ev.action as unknown as SdKey;
        const e: Entry = { key, s: {}, watching: '' };
        entries.set(key.id, e);
        let s = (ev.payload.settings ?? {}) as unknown as HaKeySettings;
        // touche neuve : réglages de départ du modèle
        if (!Object.keys(s).length && Object.keys(kind.defaults).length) {
          s = { ...kind.defaults } as HaKeySettings;
          await key.setSettings(s as unknown as JsonObject);
        }
        setSettings(e, s);
        hub.start();
      }
      override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
        const id = (ev.action as unknown as SdKey).id;
        const e = entries.get(id);
        if (e?.watching) hub.unwatch(e.watching);
        entries.delete(id);
      }
      override onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): void {
        const e = entries.get((ev.action as unknown as SdKey).id);
        if (e) setSettings(e, (ev.payload.settings ?? {}) as unknown as HaKeySettings);
      }
      override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
        const e = entries.get((ev.action as unknown as SdKey).id);
        if (e) await press(e);
      }
      override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
        const e = entries.get((ev.action as unknown as SdKey).id);
        await onMessage(e, (ev.payload ?? {}) as Record<string, unknown>, kind);
      }
    }
    streamDeck.actions.registerAction(new HaKey());
  }
  registerPcActions(env);
  return { rerender: drawAll };
}

/* ───────── touches PC ───────── */

const PC: Array<{ uuid: string; command: string; glyph: string; label: string; confirm: boolean }> = [
  { uuid: 'com.supernon0.multioutils.pc-sleep', command: 'pc.sleep', glyph: 'sleep', label: 'Veille', confirm: false },
  { uuid: 'com.supernon0.multioutils.pc-lock', command: 'pc.lock', glyph: 'pclock', label: 'Verrouiller', confirm: false },
  { uuid: 'com.supernon0.multioutils.pc-shutdown', command: 'pc.shutdown', glyph: 'shutdown', label: 'Éteindre', confirm: true },
  { uuid: 'com.supernon0.multioutils.pc-restart', command: 'pc.restart', glyph: 'restart', label: 'Redémarrer', confirm: true }
];

interface PcSettings extends JsonObject {
  color?: string;
  confirm?: boolean;
}

function registerPcActions(env: Env): void {
  for (const def of PC) {
    const keys = new Map<string, { key: SdKey; s: PcSettings; until: number }>();
    const draw = (k: { key: SdKey; s: PcSettings; until: number }): Promise<void> => {
      const t = env.theme();
      return k.key.setImage(
        renderKey({
          style: 'accent',
          background: t.background,
          dark: t.theme === 'dark',
          color: HEX.test(k.s.color ?? '') ? (k.s.color as string) : t.accent,
          on: true,
          fallback: FALLBACK[def.glyph],
          title: def.label,
          confirm: k.until > Date.now() ? 'Confirmer ?' : undefined
        })
      );
    };
    class PcKey extends SingletonAction<PcSettings> {
      override readonly manifestId = def.uuid;
      override onWillAppear(ev: WillAppearEvent<PcSettings>): Promise<void> {
        const key = ev.action as unknown as SdKey;
        const k = { key, s: ev.payload.settings ?? {}, until: 0 };
        keys.set(key.id, k);
        return draw(k);
      }
      override onWillDisappear(ev: WillDisappearEvent<PcSettings>): void {
        keys.delete((ev.action as unknown as SdKey).id);
      }
      override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PcSettings>): Promise<void> | void {
        const k = keys.get((ev.action as unknown as SdKey).id);
        if (!k) return;
        k.s = ev.payload.settings ?? {};
        return draw(k);
      }
      override async onKeyDown(ev: KeyDownEvent<PcSettings>): Promise<void> {
        const k = keys.get((ev.action as unknown as SdKey).id);
        if (!k) return;
        const needConfirm = k.s.confirm ?? def.confirm;
        if (needConfirm && k.until < Date.now()) {
          k.until = Date.now() + CONFIRM_MS;
          await draw(k);
          setTimeout(() => void draw(k), CONFIRM_MS + 50);
          return;
        }
        k.until = 0;
        await draw(k);
        try {
          const res = await fetch(`http://127.0.0.1:41320/command/${def.command}`, { method: 'POST', signal: AbortSignal.timeout(3000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await k.key.showOk();
        } catch {
          await k.key.showAlert();
        }
      }
    }
    streamDeck.actions.registerAction(new PcKey());
  }
  // re-dessin quand l'accent de l'app change : géré par rerender des touches HA ;
  // les touches PC sont redessinées à chaque apparition.
}
