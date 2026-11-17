import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSources: vi.fn(),
  hideAppWindows: vi.fn(async (_hide?: boolean) => () => {}),
  loadRenderer: vi.fn()
}));
vi.mock('electron', () => ({
  BrowserWindow: class {
    static getAllWindows() { return [{ getTitle: () => 'MultiOutils' }]; }
    on() {}
    once() {}
  },
  desktopCapturer: { getSources: mocks.getSources },
  screen: {
    getPrimaryDisplay: () => ({}),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  }
}));
vi.mock('../../windows', () => ({ loadRenderer: mocks.loadRenderer, preloadPath: () => '' }));
vi.mock('./utils', () => ({ hideAppWindows: mocks.hideAppWindows, physicalSize: () => ({ width: 1920, height: 1080 }) }));

import { WindowPickerFlow } from './window-picker';

beforeEach(() => {
  vi.clearAllMocks();
  const thumbnail = { isEmpty: () => false, getSize: () => ({ width: 100 }), toDataURL: () => 'data:image/png;base64,' };
  mocks.getSources.mockResolvedValue([
    { id: 'own', name: 'MultiOutils', thumbnail },
    { id: 'other', name: 'Another app', thumbnail }
  ]);
});

describe('window picker', () => {
  it('excludes MultiOutils by default', async () => {
    const flow = new WindowPickerFlow(vi.fn());
    await flow.start();
    expect(mocks.hideAppWindows).toHaveBeenCalledWith(true);
    expect(flow.list().map((item) => item.id)).toEqual(['other']);
  });

  it('includes MultiOutils when hiding is disabled', async () => {
    const flow = new WindowPickerFlow(vi.fn());
    await flow.start(false);
    expect(mocks.hideAppWindows).toHaveBeenCalledWith(false);
    expect(flow.list().map((item) => item.id)).toEqual(['own', 'other']);
  });
});
