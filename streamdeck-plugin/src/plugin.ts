import streamDeck, {
  action,
  SingletonAction,
  type JsonObject,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent
} from '@elgato/streamdeck';

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

@action({ UUID: 'com.supernon0.multioutils.capture-fullscreen' })
class CaptureFullscreen extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('capture.fullscreen', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.capture-region' })
class CaptureRegion extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('capture.region', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.capture-window' })
class CaptureWindow extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('capture.window', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.capture-delayed' })
class CaptureDelayed extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('capture.delayed', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.open-library' })
class OpenLibrary extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('library.open', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.copy-last' })
class CopyLast extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('clipboard.last', ev);
  }
}

// ── Module Presse-papiers (docs/00 §9.4) ─────────────────────────────────

@action({ UUID: 'com.supernon0.multioutils.clips-open' })
class ClipsOpen extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('clips.open', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.clips-copy-last' })
class ClipsCopyLast extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('clips.copyLast', ev);
  }
}

@action({ UUID: 'com.supernon0.multioutils.clips-pin-current' })
class ClipsPinCurrent extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('clips.pinCurrent', ev);
  }
}

// ── Module Pipette (docs/00 §9.2) ────────────────────────────────────────

@action({ UUID: 'com.supernon0.multioutils.colorpicker-start' })
class ColorPickerStart extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('colorpicker.start', ev);
  }
}

// ── Module Autoclic — bascule simple du profil sélectionné (docs/00 §9.5) ──

@action({ UUID: 'com.supernon0.multioutils.autoclick-toggle' })
class AutoclickToggle extends SingletonAction {
  override onKeyDown(ev: KeyDownEvent): Promise<void> {
    return sendCommand('autoclick.toggle', ev);
  }
}

// ── Module Autoclic — touche « profil » (liste live + marche/arrêt animé) ──

/** Réglages d'une touche profil : l'id du profil choisi dans le panneau. */
type ProfileSettings = JsonObject & { profileId?: string };

/** Surface minimale d'une touche utilisée par le plugin (évite les frictions
 *  de types entre versions du SDK). */
interface SdKey {
  id: string;
  setTitle(title: string): Promise<void>;
  setImage(image: string): Promise<void>;
  showAlert(): Promise<void>;
}

interface Entry {
  action: SdKey;
  profileId?: string;
  running: boolean;
}

/** Glyphe souris en SVG (data URL) — blanc (arrêt) ou doré avec halo (marche,
 *  `glow` = intensité du halo pour l'animation). */
function keyImage(on: boolean, glow = 0): string {
  const stroke = on ? '#e8c547' : '#f0ede6';
  const ring =
    glow > 0
      ? `<circle cx="72" cy="72" r="${34 + glow * 14}" fill="none" stroke="#4fc3a1" stroke-width="4" opacity="${(1 - glow) * 0.6}"/>`
      : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
    `<rect width="144" height="144" fill="#0e0f11"/>` +
    ring +
    `<g fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="48" y="30" width="48" height="84" rx="24"/>` +
    `<path d="M72 48v20"/>` +
    `</g></svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

const entries = new Map<string, Entry>();
let profileNames = new Map<string, string>();
let appReachable = true;

async function appGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    appReachable = true;
    return (await res.json()) as T;
  } catch {
    appReachable = false;
    return null;
  }
}

/** Petite animation marche/arrêt : fait grossir/estomper le halo puis se fige. */
async function animate(key: SdKey, toOn: boolean): Promise<void> {
  const steps = [0.15, 0.4, 0.7, 1];
  for (const g of steps) {
    await key.setImage(keyImage(toOn, 1 - g));
    await new Promise((r) => setTimeout(r, 55));
  }
  await key.setImage(keyImage(toOn, 0));
}

/** Rafraîchit le libellé + l'image d'une touche selon l'état connu. */
async function render(entry: Entry): Promise<void> {
  const name = entry.profileId ? (profileNames.get(entry.profileId) ?? '?') : '—';
  await entry.action.setTitle(name);
  await entry.action.setImage(keyImage(entry.running, 0));
}

/** Interroge l'app : met à jour la liste des profils et l'état de chaque touche
 *  (avec animation sur transition). Nouveau profil créé dans l'app → son nom
 *  apparaît ici automatiquement. */
async function poll(): Promise<void> {
  const data = await appGet<{
    profiles: Array<{ id: string; name: string }>;
    runningProfileId: string | null;
  }>('/autoclick/profiles');
  if (!data) return;
  profileNames = new Map(data.profiles.map((p) => [p.id, p.name]));
  for (const entry of entries.values()) {
    const running = entry.profileId != null && data.runningProfileId === entry.profileId;
    if (running !== entry.running) {
      entry.running = running;
      await animate(entry.action, running);
      await entry.action.setTitle(
        entry.profileId ? (profileNames.get(entry.profileId) ?? '?') : '—'
      );
    } else {
      await render(entry);
    }
  }
}

@action({ UUID: 'com.supernon0.multioutils.autoclick-profile' })
class AutoclickProfile extends SingletonAction<ProfileSettings> {
  override async onWillAppear(ev: WillAppearEvent<ProfileSettings>): Promise<void> {
    const key = ev.action as unknown as SdKey;
    entries.set(key.id, { action: key, profileId: ev.payload.settings?.profileId, running: false });
    await render(entries.get(key.id)!);
    void poll();
  }

  override onWillDisappear(ev: WillDisappearEvent<ProfileSettings>): Promise<void> {
    entries.delete((ev.action as unknown as SdKey).id);
    return Promise.resolve();
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ProfileSettings>
  ): Promise<void> {
    const key = ev.action as unknown as SdKey;
    const entry = entries.get(key.id);
    if (entry) {
      entry.profileId = ev.payload.settings?.profileId;
      await render(entry);
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
    try {
      const res = await fetch(
        `${BASE_URL}/autoclick/toggle?id=${encodeURIComponent(profileId)}`,
        { method: 'POST', signal: AbortSignal.timeout(3000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await poll(); // reflète immédiatement le nouvel état + anime
    } catch (error) {
      streamDeck.logger.warn('Autoclic injoignable', error);
      await key.showAlert();
    }
  }
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

void streamDeck.connect();

// Sondage régulier : garde les touches « profil » à jour (état + nouveaux
// profils) même quand le changement vient de l'app ou d'une autre touche.
setInterval(() => {
  if (entries.size > 0) void poll();
}, 1200);
void appReachable; // état interne (diagnostic), volontairement non exporté
