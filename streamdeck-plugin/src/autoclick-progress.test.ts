import { describe, expect, it, vi } from 'vitest';
vi.mock('@elgato/streamdeck', () => ({ action: () => (target: unknown) => target, SingletonAction: class {} }));
import { progressTitle, AutoclickCount } from './autoclick-progress';

describe('informations autoclic', () => {
  it('affiche le temps écoulé et les clics pour les profils limités ou illimités', () => {
    const state = { running: true, elapsedMs: 3_661_000, done: 13, target: 50 };
    expect(progressTitle('time', state)).toBe('1:01:01');
    expect(progressTitle('count', state)).toBe('13 / 50');
    expect(progressTitle('count', { ...state, target: null })).toBe('13 / ∞');
  });
  it('met à jour le compteur sans modifier l’image personnalisée', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ running: true, elapsedMs: 1000, done: 3, target: 20 }) } as Response);
    const key = { id: 'key', isKey: () => true, setTitle: vi.fn(), setImage: vi.fn() };
    const action = new AutoclickCount();
    await action.onWillAppear({ action: key } as never);
    expect(key.setTitle).toHaveBeenCalledWith('3 / 20');
    expect(key.setImage).not.toHaveBeenCalled();
    action.onWillDisappear({ action: key } as never);
    fetchMock.mockRestore();
  });
});
