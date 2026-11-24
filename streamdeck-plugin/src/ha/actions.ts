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
  type KeyUpEvent,
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
import { gaugeByDefault, planPress, showsValueByDefault, type HaKeySettings, type PressPlan } from './settings';
import {
  LONG_PRESS_MS,
  PANEL_ACTION,
  PANEL_PROFILE,
  PAGES,
  SLOTS_PER_PAGE,
  currentLevel,
  levelPlan,
  lightCaps,
  renderBack,
  renderLevel,
  renderPage,
  renderSlot,
  resolveLevels,
  resolveSlots,
  slotActive,
  slotPlan,
  type PanelKeySettings
} from './light-panel';

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
  device?: { id: string };
  setTitle(title?: string): Promise<void>;
  setImage(image?: string, options?: { state: 0 | 1 }): Promise<void>;
  setState(state: 0 | 1): Promise<void>;
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
  drawRevision?: number;
  editorToken?: string;
  editorPolling?: string;
  /** L'icône de l'atelier était indisponible au dernier dessin (alerte déjà montrée). */
  libraryFailed?: boolean;
  /** Appui long en cours (panneau lumière). */
  holdTimer?: ReturnType<typeof setTimeout>;
  held?: boolean;
}

/** Panneau lumière ouvert sur un Stream Deck. */
interface PanelState {
  entity: string;
  name: string;
  slots: unknown;
  levels: unknown;
  page: number;
}

interface PanelKey {
  key: SdKey;
  s: PanelKeySettings;
  device: string;
  lastSvg?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const CONFIRM_MS = 3000;

interface GlobalSettings extends JsonObject {
  direct?: { url?: string; remoteUrl?: string; token?: string };
  clip?: JsonObject;
}

export function registerHaActions(env: Env): void {
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

  /** Dessin d'une icône de l'atelier MultiOutils, version allumée ou éteinte. */
  const libraryImage = async (id: string, on: boolean, color: string | null): Promise<string> => {
    const q = new URLSearchParams({ id, on: on ? '1' : '0' });
    if (color) q.set('color', color);
    const res = await fetch(`http://127.0.0.1:41320/icons/render?${q}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('Icône indisponible');
    const data = await res.json() as { image?: string };
    if (!data.image?.startsWith('data:image/svg+xml')) throw new Error('Icône invalide');
    return data.image;
  };

  /* ───────── dessin ───────── */

  const draw = async (e: Entry): Promise<void> => {
    const revision = e.drawRevision = (e.drawRevision ?? 0) + 1;
    const t = env.theme();
    const s = e.s;
    const id = s.entity ?? '';
    const domain = haDomainOf(id);
    const st: HaRawState | undefined = id ? hub.get(id) : undefined;
    const offline = hub.status.state !== 'connected';
    const mode = s.mode ?? 'auto';
    const on = mode === 'template' || mode === 'event' || mode === 'service' ? true : isOnState(st) || ['scene', 'button', 'input_button'].includes(domain);
    const rule = matchRule(s.rules, st);

    await e.key.setState(on ? 1 : 0);

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
    const customState = (st && !isUnavailable(st) && !Number.isFinite(Number(st.state))
      ? (isOnState(st) ? s.stateOnText : s.stateOffText) : undefined)?.trim();
    const hasStateText = !!(s.stateOnText?.trim() || s.stateOffText?.trim());
    const wantValue = s.valueMode === 'show' || (s.valueMode !== 'hide' && (hasStateText || showsValueByDefault(id, mode)));
    if (mode === 'template') value = e.templateValue ?? '…';
    else if (wantValue && st) value = customState || formatState(st, s.decimals ?? null);
    const gauge = (s.gauge ?? gaugeByDefault(id)) ? gaugePercent(st) : null;

    // image (caméra, pochette)
    let image: string | null = null;
    if (mode === 'camera' || (mode === 'auto' && domain === 'camera')) image = e.image ?? null;
    if (domain === 'media_player' && s.art !== false && st?.state === 'playing' && e.image) image = e.image;

    const confirming = !!e.confirmUntil && e.confirmUntil > Date.now();
    await e.key.setTitle(confirming ? 'Confirmer ?' : s.customIcon ? [title, value].filter(Boolean).join('\n') : undefined);
    if (s.customIcon) {
      if (confirming) await e.key.showAlert();
      return;
    }

    if (s.libraryIcon && !confirming) {
      try {
        // Les deux états dessinés dans l'atelier (onglet « Éteint ») : on suit l'entité,
        // sauf si la touche est réglée sur une version fixe.
        const libOn = s.libraryState === 'on' ? true : s.libraryState === 'off' ? false : on;
        const lamp = s.libraryLampColor ? lightColor(st) : null;
        const img = await libraryImage(s.libraryIcon, libOn, lamp);
        if (revision !== e.drawRevision) return;
        e.libraryFailed = false;
        await e.key.setTitle([title, value].filter(Boolean).join('\n'));
        e.lastSvg = img;
        await e.key.setImage(img);
        return;
      } catch {
        if (revision !== e.drawRevision) return;
        // Une seule alerte par panne (app fermée…), pas à chaque changement d'état HA ;
        // la touche retombe sur le dessin normal ci-dessous.
        if (!e.libraryFailed) await e.key.showAlert();
        e.libraryFailed = true;
      }
    }

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
      textColor: HEX.test(s.textColor ?? '') ? s.textColor : undefined,
      gauge: gauge ?? null,
      unavailable: !!id && mode !== 'event' && mode !== 'template' && isUnavailable(st) && !offline,
      offline,
      image,
      dimmed: !!rule?.blink && blink,
      confirm: e.confirmUntil && e.confirmUntil > Date.now() ? 'Confirmer ?' : undefined
    });
    if (revision !== e.drawRevision) return;
    if (svg !== e.lastSvg) {
      e.lastSvg = svg;
      await e.key.setImage(svg);
    }
  };

  hub.onChange((ids) => {
    for (const e of entries.values()) {
      if (!ids || (e.watching && ids.includes(e.watching))) {
        void refreshImage(e);
        void draw(e);
      }
    }
    for (const [device, p] of panels) if (!ids || ids.includes(p.entity)) drawPanel(device);
  });

  /* ───────── panneau lumière (appui long) ───────── */

  const panels = new Map<string, PanelState>();
  const panelKeys = new Map<string, PanelKey>();

  const drawPanelKey = async (k: PanelKey): Promise<void> => {
    const t = env.theme();
    const look = { dark: t.theme === 'dark', background: t.background, accent: t.accent };
    const p = panels.get(k.device);
    const st = p ? hub.get(p.entity) : undefined;
    const caps = lightCaps(st);
    const lamp = lightColor(st);
    const role = k.s.role;
    const i = Number(k.s.index) || 0;
    let svg: string;
    if (role === 'back') svg = renderBack(look, p ? p.name : 'Retour');
    else if (role === 'page') svg = renderPage(look, p?.page ?? 0, caps, lamp, hub.status.state !== 'connected');
    else if (role === 'slot') {
      const slot = p ? resolveSlots(p.slots, caps)[(p.page * SLOTS_PER_PAGE) + i] ?? null : null;
      svg = renderSlot(look, slot, slotActive(slot, st));
    } else if (role === 'level') {
      const levels = resolveLevels(p?.levels);
      const cur = currentLevel(st);
      svg = renderLevel(look, levels[i], i, !!p && cur > 0 && Math.abs(cur - levels[i]) <= 2, lamp);
    } else return;
    if (svg === k.lastSvg) return;
    k.lastSvg = svg;
    await k.key.setTitle('');
    await k.key.setImage(svg);
  };
  const drawPanel = (device: string): void => {
    for (const k of panelKeys.values()) if (k.device === device) void drawPanelKey(k);
  };

  const openPanel = async (e: Entry): Promise<void> => {
    const device = e.key.device?.id;
    const entity = e.s.entity ?? '';
    if (!device || !entity) return void e.key.showAlert();
    const prev = panels.get(device);
    if (prev) hub.unwatch(prev.entity);
    hub.watch(entity);
    const st = hub.get(entity);
    const name = e.s.titleMode === 'custom' && e.s.titleText ? e.s.titleText : ((st?.attributes?.friendly_name as string) ?? entity.split('.')[1]);
    panels.set(device, { entity, name, slots: e.s.panelSlots, levels: e.s.panelLevels, page: 0 });
    for (const k of panelKeys.values()) if (k.device === device) k.lastSvg = undefined;
    try {
      await streamDeck.profiles.switchToProfile(device, PANEL_PROFILE);
    } catch (err) {
      streamDeck.logger.warn('[ha] panneau lumière', err);
      await e.key.showAlert();
    }
    drawPanel(device);
  };

  const closePanel = async (device: string): Promise<void> => {
    const p = panels.get(device);
    if (p) hub.unwatch(p.entity);
    panels.delete(device);
    await streamDeck.profiles.switchToProfile(device);
  };

  const pressPanelKey = async (k: PanelKey): Promise<void> => {
    const p = panels.get(k.device);
    if (k.s.role === 'back') return closePanel(k.device);
    if (!p) return k.key.showAlert();
    if (k.s.role === 'page') {
      p.page = (p.page + 1) % PAGES;
      drawPanel(k.device);
      return;
    }
    const st = hub.get(p.entity);
    const caps = lightCaps(st);
    const i = Number(k.s.index) || 0;
    let plan: PressPlan;
    if (k.s.role === 'slot') plan = slotPlan(p.entity, resolveSlots(p.slots, caps)[p.page * SLOTS_PER_PAGE + i] ?? null, caps);
    else if (k.s.role === 'level') plan = levelPlan(p.entity, resolveLevels(p.levels)[i]);
    else return;
    if (plan.kind !== 'service') return k.key.showAlert();
    try {
      await hub.call(plan.domain, plan.service, plan.data, plan.target);
    } catch (err) {
      streamDeck.logger.warn('[ha] panneau lumière', err);
      await k.key.showAlert();
    }
  };

  class LightPanelKey extends SingletonAction<JsonObject> {
    override readonly manifestId = PANEL_ACTION;
    override onWillAppear(ev: WillAppearEvent<JsonObject>): void {
      const key = ev.action as unknown as SdKey;
      const k: PanelKey = { key, s: (ev.payload.settings ?? {}) as PanelKeySettings, device: key.device?.id ?? '' };
      panelKeys.set(key.id, k);
      hub.start();
      void drawPanelKey(k);
    }
    override onWillDisappear(ev: WillDisappearEvent<JsonObject>): void {
      panelKeys.delete((ev.action as unknown as SdKey).id);
    }
    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): void {
      const k = panelKeys.get((ev.action as unknown as SdKey).id);
      if (!k) return;
      k.s = (ev.payload.settings ?? {}) as PanelKeySettings;
      k.lastSvg = undefined;
      void drawPanelKey(k);
    }
    override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
      const k = panelKeys.get((ev.action as unknown as SdKey).id);
      if (k) await pressPanelKey(k);
    }
  }
  streamDeck.actions.registerAction(new LightPanelKey());

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
    if (e.editorToken) void editorRequest('reply', { token: e.editorToken, settings: s }).catch(() => undefined);

    if (s.customIcon && !e.s.customIcon) {
      void e.key.setImage(undefined, { state: 0 });
      void e.key.setImage(undefined, { state: 1 });
    }

    const nextId = s.entity ?? '';
    if (nextId !== e.watching) {
      if (e.watching) hub.unwatch(e.watching);
      if (nextId) hub.watch(nextId);
      e.watching = nextId;
      e.image = null;
      e.imageSrc = undefined;
    }
    e.s = s;
    e.lastSvg = undefined;
    e.libraryFailed = false;
    e.confirmUntil = 0;
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

  const usesPanel = (e: Entry): boolean => e.s.panel === true && haDomainOf(e.s.entity ?? '') === 'light';

  const press = async (e: Entry): Promise<void> => {
    const s = e.s;
    if (s.confirm) {
      if (!e.confirmUntil || e.confirmUntil < Date.now()) {
        e.confirmUntil = Date.now() + CONFIRM_MS;
        await draw(e);
        await e.key.showAlert();
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

  const editorRequest = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`http://127.0.0.1:41320/ha/editor/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(path === 'open' ? 15000 : 5000)
    });
    if (!res.ok) throw new Error('Ouvre MultiOutils pour utiliser la grande fenêtre.');
    return await res.json() as Record<string, unknown>;
  };
  const pollEditor = (e: Entry, kind: HaKind, token: string): void => {
    if (e.editorPolling === token) return;
    e.editorPolling = token;
    const run = async (): Promise<void> => {
      if (e.editorToken !== token) return;
      try {
        const data = await editorRequest(`messages?token=${encodeURIComponent(token)}`);
        for (const raw of (Array.isArray(data.messages) ? data.messages : [])) {
          const message = raw as { event?: string; payload?: Record<string, unknown> };
          if (message.event === 'setSettings' && message.payload) {
            await e.key.setSettings(message.payload as JsonObject);
            setSettings(e, message.payload as HaKeySettings);
          } else if (message.event === 'sendToPlugin' && message.payload) {
            // Le grand sélecteur peut rester ouvert sans bloquer les autres réglages.
            void onMessage(e, message.payload, kind, (payload) => {
              void editorRequest('reply', { token, payload }).catch(() => undefined);
            });
          }
        }
        if (data.closed) { e.editorToken = undefined; e.editorPolling = undefined; return; }
      } catch {
        e.editorToken = undefined; e.editorPolling = undefined; return;
      }
      setTimeout(() => void run(), 350);
    };
    void run();
  };
  const onMessage = async (e: Entry | undefined, msg: Record<string, unknown>, kind: HaKind, respond: (payload: JsonValue) => void = reply): Promise<void> => {
    const reply = respond;
    const cmd = msg.cmd;
    try {
      if (cmd === 'editor' && e) {
        const data = await editorRequest('open', { context: e.key.id, action: kind.uuid, settings: e.s });
        if (typeof data.token !== 'string') throw new Error('Éditeur indisponible');
        if (entries.get(e.key.id) !== e) {
          void editorRequest('close', { token: data.token }).catch(() => undefined);
          return;
        }
        e.editorToken = data.token;
        pollEditor(e, kind, data.token);
        reply({ cmd, ok: true });
      } else if (cmd === 'iconPair') {
        // Aperçu des deux versions (allumée / éteinte) d'une icône de l'atelier.
        const id = String(msg.id ?? '');
        const [onImg, offImg] = await Promise.all([libraryImage(id, true, null), libraryImage(id, false, null)]);
        reply({ cmd, id, on: onImg, off: offImg });
      } else if (cmd === 'iconLibrary') {
        const res = await fetch('http://127.0.0.1:41320/icons/library', { signal: AbortSignal.timeout(2500) });
        if (!res.ok) throw new Error('Ouvre MultiOutils pour accéder à l’atelier.');
        const data = await res.json() as { designs?: JsonValue };
        reply({ cmd, designs: data.designs ?? [] });
      } else if (cmd === 'status') {
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
      } else if (cmd === 'openPanel' && e) {
        await openPanel(e);
        reply({ cmd, ok: true });
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
        if (e) e.drawRevision = (e.drawRevision ?? 0) + 1;
        if (e?.editorToken) { void editorRequest('close', { token: e.editorToken }).catch(() => undefined); e.editorToken = undefined; }
        entries.delete(id);
      }
      override onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): void {
        const e = entries.get((ev.action as unknown as SdKey).id);
        if (e) setSettings(e, (ev.payload.settings ?? {}) as unknown as HaKeySettings);
      }
      override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
        const e = entries.get((ev.action as unknown as SdKey).id);
        if (!e) return;
        // Panneau lumière : l'appui court agit au relâchement, l'appui long ouvre le panneau.
        if (usesPanel(e)) {
          clearTimeout(e.holdTimer);
          e.held = false;
          e.holdTimer = setTimeout(() => {
            e.holdTimer = undefined;
            e.held = true;
            void openPanel(e);
          }, LONG_PRESS_MS);
          return;
        }
        await press(e);
      }
      override async onKeyUp(ev: KeyUpEvent<JsonObject>): Promise<void> {
        const e = entries.get((ev.action as unknown as SdKey).id);
        if (!e || !e.holdTimer) return;
        clearTimeout(e.holdTimer);
        e.holdTimer = undefined;
        if (!e.held) await press(e);
      }
      override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
        const e = entries.get((ev.action as unknown as SdKey).id);
        await onMessage(e, (ev.payload ?? {}) as Record<string, unknown>, kind);
      }
    }
    streamDeck.actions.registerAction(new HaKey());
  }
  registerPcActions();
}

/* ───────── touches PC ───────── */

const PC: Array<{ uuid: string; command: string; glyph: string; label: string; confirm: boolean }> = [
  { uuid: 'com.supernon0.multioutils.pc-sleep', command: 'pc.sleep', glyph: 'sleep', label: 'Veille', confirm: false },
  { uuid: 'com.supernon0.multioutils.pc-lock', command: 'pc.lock', glyph: 'pclock', label: 'Verrouiller', confirm: false },
  { uuid: 'com.supernon0.multioutils.pc-shutdown', command: 'pc.shutdown', glyph: 'shutdown', label: 'Éteindre', confirm: true },
  { uuid: 'com.supernon0.multioutils.pc-restart', command: 'pc.restart', glyph: 'restart', label: 'Redémarrer', confirm: true }
];

interface PcSettings extends JsonObject {
  confirm?: boolean;
}

/** Touches PC : l'image reste celle du manifeste (ou celle choisie dans
 *  Stream Deck) ; la confirmation s'affiche dans le titre. */
function registerPcActions(): void {
  for (const def of PC) {
    const keys = new Map<string, { key: SdKey; s: PcSettings; until: number }>();
    const draw = (k: { key: SdKey; s: PcSettings; until: number }): Promise<void> =>
      k.until > Date.now() ? k.key.setTitle('Confirmer ?') : k.key.setTitle();
    class PcKey extends SingletonAction<PcSettings> {
      override readonly manifestId = def.uuid;
      override onWillAppear(ev: WillAppearEvent<PcSettings>): Promise<void> {
        const key = ev.action as unknown as SdKey;
        const k = { key, s: ev.payload.settings ?? {}, until: 0 };
        keys.set(key.id, k);
        return Promise.resolve();
      }
      override onWillDisappear(ev: WillDisappearEvent<PcSettings>): void {
        keys.delete((ev.action as unknown as SdKey).id);
      }
      override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PcSettings>): Promise<void> | void {
        const k = keys.get((ev.action as unknown as SdKey).id);
        if (!k) return;
        k.s = ev.payload.settings ?? {};
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
        if (needConfirm) {
          k.until = 0;
          await draw(k);
        }
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
}
