import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAllWindows } = vi.hoisted(() => ({ getAllWindows: vi.fn() }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows },
  desktopCapturer: {},
  screen: {}
}));

import { hideAppWindows } from './screen-utils';

const window = (visible = true) => ({
  isDestroyed: vi.fn(() => false),
  isVisible: vi.fn(() => visible),
  hide: vi.fn(),
  showInactive: vi.fn()
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('capture window visibility', () => {
  it('keeps all windows untouched when hiding is disabled', async () => {
    const main = window();
    getAllWindows.mockReturnValue([main]);
    const restore = await hideAppWindows(false);
    restore();
    expect(main.hide).not.toHaveBeenCalled();
    expect(main.showInactive).not.toHaveBeenCalled();
  });

  it('hides visible windows by default and restores only surviving windows', async () => {
    vi.useFakeTimers();
    const main = window();
    const closed = window();
    const hidden = window(false);
    getAllWindows.mockReturnValue([main, closed, hidden]);
    const pending = hideAppWindows();
    expect(main.hide).toHaveBeenCalledOnce();
    expect(closed.hide).toHaveBeenCalledOnce();
    expect(hidden.hide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(140);
    const restore = await pending;
    closed.isDestroyed.mockReturnValue(true);
    restore();
    expect(main.showInactive).toHaveBeenCalledOnce();
    expect(closed.showInactive).not.toHaveBeenCalled();
    expect(hidden.showInactive).not.toHaveBeenCalled();
  });
});
