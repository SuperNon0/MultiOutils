import { action, SingletonAction, type KeyAction, type WillAppearEvent, type WillDisappearEvent } from '@elgato/streamdeck';

export interface Progress { running: boolean; elapsedMs: number; done: number; target: number | null }
export function progressTitle(kind: 'time' | 'count', state: Progress): string {
  if (kind === 'count') return `${state.done} / ${state.target ?? '∞'}`;
  const seconds = Math.max(0, Math.floor(state.elapsedMs / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
abstract class ProgressAction extends SingletonAction {
  protected abstract readonly kind: 'time' | 'count';
  private keys = new Map<string, KeyAction>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  private async refresh(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      const res = await fetch('http://127.0.0.1:41320/autoclick/progress', { signal: AbortSignal.timeout(2500) });
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json() as Progress;
      await Promise.all([...this.keys.values()].map((key) => key.setTitle(progressTitle(this.kind, data))));
    } catch {
      await Promise.all([...this.keys.values()].map((key) => key.setTitle('—')));
    } finally { this.reading = false; }
  }
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (!ev.action.isKey()) return;
    this.keys.set(ev.action.id, ev.action);
    if (!this.timer) this.timer = setInterval(() => void this.refresh(), 1000);
    await this.refresh();
  }
  override onWillDisappear(ev: WillDisappearEvent): void {
    this.keys.delete(ev.action.id);
    if (!this.keys.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
@action({ UUID: 'com.supernon0.multioutils.autoclick-time' })
export class AutoclickTime extends ProgressAction { protected readonly kind = 'time' as const; }
@action({ UUID: 'com.supernon0.multioutils.autoclick-count' })
export class AutoclickCount extends ProgressAction { protected readonly kind = 'count' as const; }
