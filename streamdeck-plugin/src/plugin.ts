import streamDeck, {
  action,
  SingletonAction,
  type JsonObject,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent
} from '@elgato/streamdeck';
import { registerHaActions } from './ha/actions';

/**
 * Plugin Stream Deck MultiOutils (docs/00 §8) : chaque touche appelle le
 * service localhost de l'app (127.0.0.1:41320). Le plugin ne parle JAMAIS au
 * serveur distant — seulement à l'app locale.
 */
const BASE_URL = 'http://127.0.0.1:41320';

async function sendCommand(command: string, ev: KeyDownEvent): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/command/${command}`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await ev.action.showOk();
  } catch (error) {
    streamDeck.logger.warn(`MultiOutils injoignable (${command})`, error);
    await ev.action.showAlert(); // l'app n'est probablement pas lancée
  }
}

// ── Couleurs des touches ─────────────────────────────────────────────────
// Les touches simples gardent l'image du manifeste (ou l'icône que l'on a mise
// soi-même dans Stream Deck) : le plugin ne les redessine plus. Seules les
// touches à état (autoclic, Home Assistant) sont dessinées, avec une palette
// fixe ou la couleur choisie pour la touche : elles ne suivent plus l'accent
// de l'app.

interface Theme {
  theme: 'dark' | 'light';
  accent: string;
  background: string;
  live: string;
}
/** Palette fixe des touches dessinées (le doré historique). */
const theme: Theme = { theme: 'dark', accent: '#e8c547', background: '#16181c', live: '#4fc3a1' };

/** Réglages communs : couleur propre à la touche (#rrggbb) ou vide. */
type KeySettings = JsonObject & { color?: string };

const HEX = /^#[0-9a-f]{6}$/i;
const keyColor = (color: unknown): string => (typeof color === 'string' && HEX.test(color) ? color : theme.accent);

/** Touche simple : une commande de l'app ; l'image reste celle du manifeste
 *  ou celle choisie dans Stream Deck. */
abstract class IconKey extends SingletonAction<KeySettings> {
  protected abstract readonly command: string;
  override onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
    return sendCommand(this.command, ev as unknown as KeyDownEvent);
  }
}

@action({ UUID: 'com.supernon0.multioutils.capture-fullscreen' })
class CaptureFullscreen extends IconKey {
  protected readonly command = 'capture.fullscreen';
}

@action({ UUID: 'com.supernon0.multioutils.capture-region' })
class CaptureRegion extends IconKey {
  protected readonly command = 'capture.region';
}

@action({ UUID: 'com.supernon0.multioutils.capture-window' })
class CaptureWindow extends IconKey {
  protected readonly command = 'capture.window';
}

@action({ UUID: 'com.supernon0.multioutils.capture-delayed' })
class CaptureDelayed extends IconKey {
  protected readonly command = 'capture.delayed';
}

@action({ UUID: 'com.supernon0.multioutils.open-library' })
class OpenLibrary extends IconKey {
  protected readonly command = 'library.open';
}

@action({ UUID: 'com.supernon0.multioutils.copy-last' })
class CopyLast extends IconKey {
  protected readonly command = 'clipboard.last';
}

@action({ UUID: 'com.supernon0.multioutils.clips-open' })
class ClipsOpen extends IconKey {
  protected readonly command = 'clips.open';
}

@action({ UUID: 'com.supernon0.multioutils.clips-copy-last' })
class ClipsCopyLast extends IconKey {
  protected readonly command = 'clips.copyLast';
}

@action({ UUID: 'com.supernon0.multioutils.clips-pin-current' })
class ClipsPinCurrent extends IconKey {
  protected readonly command = 'clips.pinCurrent';
}

@action({ UUID: 'com.supernon0.multioutils.colorpicker-start' })
class ColorPickerStart extends IconKey {
  protected readonly command = 'colorpicker.start';
}

// ── Module Autoclic (docs/00 §9.5) ───────────────────────────────────────
// Deux touches complémentaires :
//  • « profil »       → SÉLECTIONNE un profil (ne lance pas). Couleur de la touche au
//                       repos, pleine quand sélectionné, teinte « en cours » animée quand il
//                       tourne. La liste vient de l'app (nouveau profil → auto).
//  • « marche/arrêt » → lance / stoppe le profil sélectionné. Triangle à la couleur de la touche à
//                       l'arrêt, carré animé en marche ; nom du profil
//                       sélectionné affiché dessous.

/** Réglages d'une touche profil : l'id du profil choisi dans le panneau. */
type ProfileSettings = KeySettings & { profileId?: string };

/** Surface minimale d'une touche (évite les frictions de types entre SDK). */
interface SdKey {
  id: string;
  setTitle(title: string): Promise<void>;
  setImage(image: string): Promise<void>;
  showAlert(): Promise<void>;
}

interface Entry {
  action: SdKey;
  kind: 'profile' | 'toggle';
  profileId?: string;
  color?: string;
}

const entries = new Map<string, Entry>();
let names = new Map<string, string>();
let selectedId: string | null = null;
let runningId: string | null = null;
let glow = false; // alternance pour l'animation des touches « en cours »

function svgUrl(inner: string): string {
  // Style maison des touches : fond gris arrondi #16181c plein + glyphe plus
  // petit (inséré à 72 % autour du centre), comme les icônes existantes.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
    `<rect width="144" height="144" rx="20" fill="${theme.background}"/>` +
    `<g transform="translate(72 72) scale(0.72) translate(-72 -72)">${inner}</g>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/** Image d'une touche « profil » selon son état. */
function mouseImage(state: 'classic' | 'selected' | 'running', on: boolean, accent: string): string {
  const live = theme.live;
  const color = state === 'running' ? live : accent;
  const body = state === 'classic' ? 'none' : state === 'running' ? `${live}33` : `${accent}22`;
  const wheel = state === 'classic' ? 'none' : color;
  const halo =
    state === 'running' && on
      ? `<rect x="34" y="16" width="76" height="112" rx="38" fill="none" stroke="${live}" stroke-width="5" opacity="0.55"/>`
      : '';
  return svgUrl(
    halo +
      `<rect x="46" y="26" width="52" height="92" rx="26" fill="${body}" stroke="${color}" stroke-width="7" stroke-linejoin="round"/>` +
      `<rect x="68" y="44" width="8" height="20" rx="4" fill="${wheel}" stroke="${color}" stroke-width="6"/>`
  );
}

/** Image de la touche « marche/arrêt » : lecture à la couleur de la touche (arrêt) / carré « en cours »
 *  animé (en marche). */
function toggleImage(running: boolean, on: boolean, accent: string): string {
  const live = theme.live;
  if (!running) {
    return svgUrl(
      `<path d="M58 42 L58 102 L104 72 Z" fill="none" stroke="${accent}" stroke-width="7" stroke-linejoin="round"/>`
    );
  }
  const halo = on
    ? `<circle cx="72" cy="72" r="52" fill="none" stroke="${live}" stroke-width="5" opacity="0.55"/>`
    : '';
  return svgUrl(
    halo +
      `<rect x="50" y="50" width="44" height="44" rx="8" fill="${live}33" stroke="${live}" stroke-width="7"/>`
  );
}

async function appGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function appPost(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Rafraîchit le libellé + l'image d'une touche selon l'état connu. */
async function renderEntry(e: Entry): Promise<void> {
  if (e.kind === 'toggle') {
    await e.action.setTitle(selectedId ? (names.get(selectedId) ?? '') : '');
    await e.action.setImage(toggleImage(runningId != null, glow, keyColor(e.color)));
    return;
  }
  await e.action.setTitle(e.profileId ? (names.get(e.profileId) ?? '?') : '—');
  const state =
    e.profileId != null && runningId === e.profileId
      ? 'running'
      : e.profileId != null && selectedId === e.profileId
        ? 'selected'
        : 'classic';
  await e.action.setImage(mouseImage(state, glow, keyColor(e.color)));
}

/** Interroge l'app : profils (liste live), profil sélectionné et profil en
 *  cours, puis rafraîchit toutes les touches. */
async function poll(): Promise<void> {
  const data = await appGet<{
    profiles: Array<{ id: string; name: string }>;
    runningProfileId: string | null;
    selectedId: string | null;
  }>('/autoclick/profiles');
  if (!data) return;
  names = new Map(data.profiles.map((p) => [p.id, p.name]));
  selectedId = data.selectedId;
  runningId = data.runningProfileId;
  for (const e of entries.values()) await renderEntry(e);
}

function isLive(e: Entry): boolean {
  return e.kind === 'toggle'
    ? runningId != null
    : e.profileId != null && runningId === e.profileId;
}

// ── Touche « marche/arrêt » : lance / stoppe le profil sélectionné ────────
@action({ UUID: 'com.supernon0.multioutils.autoclick-toggle' })
class AutoclickToggle extends SingletonAction<KeySettings> {
  override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
    const key = ev.action as unknown as SdKey;
    entries.set(key.id, { action: key, kind: 'toggle', color: ev.payload.settings?.color });
    await renderEntry(entries.get(key.id)!);
    void poll();
  }
  override onWillDisappear(ev: WillDisappearEvent<KeySettings>): Promise<void> {
    entries.delete((ev.action as unknown as SdKey).id);
    return Promise.resolve();
  }
  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
    const entry = entries.get((ev.action as unknown as SdKey).id);
    if (entry) {
      entry.color = ev.payload.settings?.color;
      await renderEntry(entry);
    }
  }
  override async onKeyDown(ev: KeyDownEvent<KeySettings>): Promise<void> {
    const key = ev.action as unknown as SdKey;
    if (!(await appPost('/autoclick/toggle'))) await key.showAlert();
    await poll();
  }
}

// ── Touche « profil » : SÉLECTIONNE un profil (liste live depuis l'app) ────
@action({ UUID: 'com.supernon0.multioutils.autoclick-profile' })
class AutoclickProfile extends SingletonAction<ProfileSettings> {
  override async onWillAppear(ev: WillAppearEvent<ProfileSettings>): Promise<void> {
    const key = ev.action as unknown as SdKey;
    entries.set(key.id, {
      action: key,
      kind: 'profile',
      profileId: ev.payload.settings?.profileId,
      color: ev.payload.settings?.color
    });
    await renderEntry(entries.get(key.id)!);
    void poll();
  }
  override onWillDisappear(ev: WillDisappearEvent<ProfileSettings>): Promise<void> {
    entries.delete((ev.action as unknown as SdKey).id);
    return Promise.resolve();
  }
  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ProfileSettings>
  ): Promise<void> {
    const entry = entries.get((ev.action as unknown as SdKey).id);
    if (entry) {
      entry.profileId = ev.payload.settings?.profileId;
      entry.color = ev.payload.settings?.color;
      await renderEntry(entry);
    }
    void poll();
  }
  override async onKeyDown(ev: KeyDownEvent<ProfileSettings>): Promise<void> {
    const key = ev.action as unknown as SdKey;
    const profileId = ev.payload.settings?.profileId;
    if (!profileId) {
      await key.showAlert(); // aucun profil choisi dans le panneau
      return;
    }
    if (!(await appPost(`/autoclick/select?id=${encodeURIComponent(profileId)}`))) {
      await key.showAlert();
    }
    await poll();
  }
}

// ── Module Bureau (zones du bureau) ────────────────────────────────────

@action({ UUID: 'com.supernon0.multioutils.desktop-peek' })
class DesktopPeek extends IconKey {
  protected readonly command = 'desktop.peek';
}

@action({ UUID: 'com.supernon0.multioutils.desktop-hide' })
class DesktopToggleHide extends IconKey {
  protected readonly command = 'desktop.toggleHide';
}

@action({ UUID: 'com.supernon0.multioutils.desktop-sort' })
class DesktopSortNow extends IconKey {
  protected readonly command = 'desktop.sortNow';
}

@action({ UUID: 'com.supernon0.multioutils.desktop-page-next' })
class DesktopPageNext extends IconKey {
  protected readonly command = 'desktop.pageNext';
}

@action({ UUID: 'com.supernon0.multioutils.desktop-page-prev' })
class DesktopPagePrev extends IconKey {
  protected readonly command = 'desktop.pagePrev';
}

@action({ UUID: 'com.supernon0.multioutils.desktop-show' })
class DesktopShow extends IconKey {
  protected readonly command = 'desktop.showDesktop';
}

streamDeck.actions.registerAction(new CaptureFullscreen());
streamDeck.actions.registerAction(new CaptureRegion());
streamDeck.actions.registerAction(new CaptureWindow());
streamDeck.actions.registerAction(new CaptureDelayed());
streamDeck.actions.registerAction(new OpenLibrary());
streamDeck.actions.registerAction(new CopyLast());
streamDeck.actions.registerAction(new ClipsOpen());
streamDeck.actions.registerAction(new ClipsCopyLast());
streamDeck.actions.registerAction(new ClipsPinCurrent());
streamDeck.actions.registerAction(new ColorPickerStart());
streamDeck.actions.registerAction(new AutoclickToggle());
streamDeck.actions.registerAction(new AutoclickProfile());
streamDeck.actions.registerAction(new DesktopPeek());
streamDeck.actions.registerAction(new DesktopToggleHide());
streamDeck.actions.registerAction(new DesktopSortNow());
streamDeck.actions.registerAction(new DesktopPageNext());
streamDeck.actions.registerAction(new DesktopPagePrev());
streamDeck.actions.registerAction(new DesktopShow());

// Home Assistant (une touche par modèle) + touches PC.
registerHaActions({ theme: () => theme });

void streamDeck.connect();


// Animation des touches « en cours » : alterne le halo ~toutes les 500 ms.
setInterval(() => {
  glow = !glow;
  for (const e of entries.values()) if (isLive(e)) void renderEntry(e);
}, 500);
// Sondage régulier : état + nouveaux profils, même si le changement vient de
// l'app ou d'une autre touche.
setInterval(() => {
  if (entries.size > 0) void poll();
}, 1200);
