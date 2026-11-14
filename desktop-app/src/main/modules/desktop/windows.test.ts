import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class NativeWindow extends EventEmitter {
    private dead = false;
    private rect: { x: number; y: number; width: number; height: number };
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), send: vi.fn(), id: 1 };
    constructor(options: { x: number; y: number; width: number; height: number }) {
      super();
      this.rect = { x: options.x, y: options.y, width: options.width, height: options.height };
    }
    isDestroyed = (): boolean => this.dead;
    getBounds = vi.fn(() => {
      if (this.dead) throw new TypeError('Object has been destroyed');
      return { ...this.rect };
    });
    setBounds = vi.fn((rect: { x: number; y: number; width: number; height: number }) => {
      if (this.dead) throw new TypeError('Object has been destroyed');
      this.rect = { ...rect };
    });
    showInactive = vi.fn();
    destroy(): void { this.dead = true; this.emit('closed'); }
  }
  return { BrowserWindow: NativeWindow, screen: {} };
});
vi.mock('../../windows', () => ({ loadRenderer: vi.fn(), preloadPath: () => 'preload' }));
vi.mock('./win32', () => ({
  desktopAbove: vi.fn(), hwndOf: vi.fn(), pinToDesktop: vi.fn(),
  sendToBottom: vi.fn(), unpinFromDesktop: vi.fn()
}));

import { ZoneWindow } from './windows';
const bounds = { x: 0, y: 0, width: 320, height: 240 };
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('zone window lifetime', () => {
  it('changes native height once per reveal instead of once per frame', () => {
    vi.useFakeTimers();
    const zone = new ZoneWindow('a', bounds, () => false);
    zone.setBounds({ ...bounds, height: 36 }, true);
    vi.advanceTimersByTime(200);
    expect(zone.win.setBounds).not.toHaveBeenCalled();
    expect(zone.bounds()?.height).toBe(240);
    vi.advanceTimersByTime(60);
    expect(zone.win.setBounds).toHaveBeenCalledTimes(1);
    expect(zone.bounds()?.height).toBe(36);
    zone.setBounds(bounds, true);
    expect(zone.win.setBounds).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(zone.win.setBounds).toHaveBeenCalledTimes(2);
  });
  it('does not read native bounds after an external window destruction', () => {
    const closed = vi.fn();
    const zone = new ZoneWindow('a', bounds, () => false, closed);
    expect(zone.bounds()).toEqual(bounds);
    zone.win.destroy();
    const reads = vi.mocked(zone.win.getBounds).mock.calls.length;
    expect(() => zone.bounds()).not.toThrow();
    expect(zone.bounds()).toBeNull();
    expect(vi.mocked(zone.win.getBounds).mock.calls.length).toBe(reads);
    expect(closed).toHaveBeenCalledTimes(1);
  });
  it('cancels a running roll animation when the native window closes', () => {
    vi.useFakeTimers();
    const zone = new ZoneWindow('a', bounds, () => false);
    zone.setBounds({ ...bounds, height: 36 }, true);
    vi.advanceTimersByTime(32);
    zone.win.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(zone.bounds()).toBeNull();
  });
  it('ignores delayed ready-to-show events and repeated destruction', () => {
    const closed = vi.fn();
    const zone = new ZoneWindow('a', bounds, () => false, closed);
    zone.destroy();
    zone.win.emit('ready-to-show');
    expect(zone.win.showInactive).not.toHaveBeenCalled();
    expect(() => zone.destroy()).not.toThrow();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
