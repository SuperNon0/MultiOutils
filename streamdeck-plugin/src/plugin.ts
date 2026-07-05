import streamDeck, {
  action,
  SingletonAction,
  type KeyDownEvent
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

streamDeck.actions.registerAction(new CaptureFullscreen());
streamDeck.actions.registerAction(new CaptureRegion());
streamDeck.actions.registerAction(new CaptureWindow());
streamDeck.actions.registerAction(new CaptureDelayed());
streamDeck.actions.registerAction(new OpenLibrary());
streamDeck.actions.registerAction(new CopyLast());

void streamDeck.connect();
