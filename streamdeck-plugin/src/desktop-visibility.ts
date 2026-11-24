import { action, SingletonAction, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from '@elgato/streamdeck';

const BASE_URL = 'http://127.0.0.1:41320';

/** Deux états du manifeste, pilotés par l'app et personnalisables dans Stream Deck. */
abstract class DesktopVisibilitySwitch extends SingletonAction {
  protected abstract readonly command: string;
  protected abstract readonly field: 'hidden' | 'peek';
  private keys = new Map<string, KeyAction>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading: Promise<void> | null = null;
  private pressing = false;
  /** Dernier problème signalé : le triangle d'alerte ne clignote qu'une fois par panne. */
  private lastProblem: string | null = null;

  private async alertOnce(problem: string): Promise<void> {
    if (this.lastProblem === problem) return;
    this.lastProblem = problem;
    await Promise.all([...this.keys.values()].map((key) => key.showAlert()));
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (!ev.action.isKey()) return;
    this.keys.set(ev.action.id, ev.action);
    this.lastProblem = null; // une touche qui (ré)apparaît signale à nouveau un souci
    if (!this.timer) this.timer = setInterval(() => void this.refresh(), 1000);
    await this.refresh();
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.keys.delete(ev.action.id);
    if (this.keys.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async draw(): Promise<void> {
    try {
      const res = await fetch(`${BASE_URL}/desktop/visibility`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const state = await res.json() as { hidden?: unknown; peek?: unknown; enabled?: unknown };
      if (typeof state[this.field] !== 'boolean' || typeof state.enabled !== 'boolean') throw new Error('état inconnu');
      if (!state.enabled) {
        await this.alertOnce('disabled');
        return;
      }
      this.lastProblem = null;
      await Promise.all([...this.keys.values()].map((key) => key.setState(state[this.field] ? 1 : 0)));
    } catch {
      // App fermée : un seul avertissement, pas un clignotement chaque seconde.
      await this.alertOnce('offline');
    }
  }

  private async refresh(): Promise<void> {
    if (this.pressing) return;
    if (!this.reading) this.reading = this.draw().finally(() => { this.reading = null; });
    await this.reading;
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    // Une seule opération à la fois : aucune réponse de lecture périmée après l'appui.
    if (this.pressing) return;
    this.pressing = true;
    try {
      await this.reading;
      const res = await fetch(`${BASE_URL}/command/${this.command}`, {
        method: 'POST', signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.draw();
    } catch {
      await ev.action.showAlert();
    } finally {
      this.pressing = false;
    }
  }
}


@action({ UUID: 'com.supernon0.multioutils.desktop-hide' })
export class DesktopToggleHide extends DesktopVisibilitySwitch {
  protected readonly command = 'desktop.toggleHide';
  protected readonly field = 'hidden' as const;
}

@action({ UUID: 'com.supernon0.multioutils.desktop-peek' })
export class DesktopPeek extends DesktopVisibilitySwitch {
  protected readonly command = 'desktop.peek';
  protected readonly field = 'peek' as const;
}
