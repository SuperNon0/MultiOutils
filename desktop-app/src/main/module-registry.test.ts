import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({}));
import { MainModuleRegistry, moduleContext, type MainHostContext, type MainToolModule } from './module-registry';

const ctx = {} as MainHostContext;

describe('MainModuleRegistry', () => {
  it('keeps the tray menu working when a tool failed to start or its menu throws', async () => {
    const reg = new MainModuleRegistry();
    const broken: MainToolModule = {
      id: 'broken',
      activate: () => { throw new Error('boom'); },
      trayMenuItems: () => { throw new Error('not ready'); }
    };
    const flaky: MainToolModule = { id: 'flaky', activate: () => {}, trayMenuItems: () => { throw new Error('oops'); } };
    const ok: MainToolModule = { id: 'ok', activate: () => {}, trayMenuItems: () => [{ label: 'OK' }] };
    for (const m of [broken, flaky, ok]) reg.register(m);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await reg.activateAll(ctx);
    expect(reg.trayItems(ctx)).toEqual([{ label: 'OK' }]);
    spy.mockRestore();
  });

  it('stops every tool even if one throws while stopping', () => {
    const reg = new MainModuleRegistry();
    const second = vi.fn();
    reg.register({ id: 'a', activate: () => {}, deactivate: () => { throw new Error('x'); } });
    reg.register({ id: 'b', activate: () => {}, deactivate: second });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reg.deactivateAll();
    expect(second).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('files each tool notification under its own family', () => {
    const notify = vi.fn();
    const base = { notify } as unknown as MainHostContext;
    moduleContext(base, 'screenshot').notify('Capture', 'ok');
    moduleContext(base, 'desktop').notify('Bureau', undefined, { kind: 'homeassistant', error: true });
    expect(notify).toHaveBeenNthCalledWith(1, 'Capture', 'ok', { kind: 'capture' });
    expect(notify).toHaveBeenNthCalledWith(2, 'Bureau', undefined, { kind: 'homeassistant', error: true });
  });
});
