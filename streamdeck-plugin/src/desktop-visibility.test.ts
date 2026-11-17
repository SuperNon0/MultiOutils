import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@elgato/streamdeck', () => ({
  action: () => (target: unknown) => target,
  SingletonAction: class {}
}));
import { DesktopToggleHide } from './desktop-visibility';

const key = (id = 'key') => ({
  id, isKey: () => true,
  setState: vi.fn(async () => {}), setTitle: vi.fn(async () => {}),
  showAlert: vi.fn(async () => {})
});
const event = (action: ReturnType<typeof key>) => ({ action, payload: {} }) as never;
const response = (hidden: boolean, enabled = true) => ({ ok: true, json: async () => ({ hidden, enabled }) });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue(response(false));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('desktop visibility switch', () => {
  it('reads the app on appearance and follows external visibility changes', async () => {
    const action = new DesktopToggleHide();
    const k = key();
    await action.onWillAppear(event(k));
    expect(k.setState).toHaveBeenLastCalledWith(0);
    fetchMock.mockResolvedValue(response(true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(k.setState).toHaveBeenLastCalledWith(1);
    fetchMock.mockResolvedValue(response(false));
    await vi.advanceTimersByTimeAsync(1000);
    expect(k.setState).toHaveBeenLastCalledWith(0);
    action.onWillDisappear(event(k));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes all keys after toggling instead of guessing the next state', async () => {
    const action = new DesktopToggleHide();
    const a = key('a'), b = key('b');
    await action.onWillAppear(event(a));
    await action.onWillAppear(event(b));
    fetchMock.mockResolvedValue(response(true));
    await action.onKeyDown(event(a));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/command/desktop.toggleHide'), expect.objectContaining({ method: 'POST' }));
    expect(a.setState).toHaveBeenLastCalledWith(1);
    expect(b.setState).toHaveBeenLastCalledWith(1);
    action.onWillDisappear(event(a));
    expect(vi.getTimerCount()).toBe(1);
    action.onWillDisappear(event(b));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not falsely switch after a failed command', async () => {
    const action = new DesktopToggleHide();
    const k = key();
    await action.onWillAppear(event(k));
    k.setState.mockClear();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await action.onKeyDown(event(k));
    expect(k.showAlert).toHaveBeenCalled();
    expect(k.setState).not.toHaveBeenCalled();
  });

  it('marks unavailable or disabled apps and recovers when the app returns', async () => {
    const action = new DesktopToggleHide();
    const k = key();
    fetchMock.mockRejectedValue(new Error('offline'));
    await action.onWillAppear(event(k));
    expect(k.setTitle).toHaveBeenLastCalledWith('Indisponible');
    expect(k.setState).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(response(false, false));
    await vi.advanceTimersByTimeAsync(1000);
    expect(k.setTitle).toHaveBeenLastCalledWith('Bureau\ndésactivé');
    expect(k.setState).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(response(true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(k.setState).toHaveBeenLastCalledWith(1);
    expect(k.setTitle).toHaveBeenLastCalledWith();
  });

  it('waits for an active poll before sending a key press', async () => {
    const action = new DesktopToggleHide();
    const k = key();
    let finish!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const appearance = action.onWillAppear(event(k));
    const press = action.onKeyDown(event(k));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(response(false));
    await appearance;
    await press;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/command/desktop.toggleHide');
  });
});
