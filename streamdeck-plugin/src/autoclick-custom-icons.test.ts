import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { actions, fetchMock } = vi.hoisted(() => ({ actions: new Map<string, any>(), fetchMock: vi.fn() }));
vi.mock('@elgato/streamdeck', () => ({
  default: {
    actions: { registerAction: (a: any) => actions.set(a.constructor.uuid, a) },
    logger: { warn: vi.fn() }, connect: vi.fn(async () => {})
  },
  action: ({ UUID }: { UUID: string }) => (target: any) => { target.uuid = UUID; return target; },
  SingletonAction: class {}
}));
vi.mock('./ha/actions', () => ({ registerHaActions: vi.fn() }));
const key = () => ({ id: 'key', setTitle: vi.fn(async () => {}), setState: vi.fn(async () => {}), setImage: vi.fn(async () => {}), showAlert: vi.fn(async () => {}) });
const event = (action: ReturnType<typeof key>, settings: object) => ({ action, payload: { settings } });
let selected = 'profile-a';
let running: string | null = 'profile-a';
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules(); actions.clear(); fetchMock.mockReset();
  selected = 'profile-a'; running = 'profile-a';
  fetchMock.mockImplementation(async () => ({
    ok: true, json: async () => ({ profiles: [{ id: 'profile-a', name: 'Mon profil' }, { id: 'profile-b', name: 'Autre profil' }], selectedId: selected, runningProfileId: running })
  }));
  vi.stubGlobal('fetch', fetchMock);
  await import('./plugin');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(['autoclick-profile', 'autoclick-toggle'])('%s : icônes personnalisées', (uuid) => {
  it('garde le nom automatique sans redessiner l’image pendant le sondage ou l’animation', async () => {
    const action = actions.get(`com.supernon0.multioutils.${uuid}`);
    const k = key();
    await action.onWillAppear(event(k, { profileId: 'profile-a', customIcon: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(k.setTitle).toHaveBeenLastCalledWith('Mon profil');
    // La seule réinitialisation enlève l’ancien dessin du plugin ; Stream Deck conserve l’image utilisateur.
    expect(k.setImage).toHaveBeenCalledTimes(2);
    expect(k.setImage).toHaveBeenCalledWith(undefined, { state: 0 });
    expect(k.setImage).toHaveBeenCalledWith(undefined, { state: 1 });
    k.setImage.mockClear();
    await vi.advanceTimersByTimeAsync(3600);
    expect(k.setImage).not.toHaveBeenCalled();
    expect(k.setTitle).toHaveBeenLastCalledWith('Mon profil');
    if (uuid === 'autoclick-toggle') {
      selected = 'profile-b';
      await vi.advanceTimersByTimeAsync(1200);
      expect(k.setTitle).toHaveBeenLastCalledWith('Autre profil');
      expect(k.setImage).not.toHaveBeenCalled();
    }
  });

  it('suit le profil qui tourne sans allumer les autres profils simplement sélectionnés', async () => {
    const action = actions.get(`com.supernon0.multioutils.${uuid}`);
    const k = key();
    await action.onWillAppear(event(k, { profileId: 'profile-a', customIcon: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(k.setState).toHaveBeenLastCalledWith(1);
    running = 'profile-b';
    await vi.advanceTimersByTimeAsync(1200);
    expect(k.setState).toHaveBeenLastCalledWith(uuid === 'autoclick-profile' ? 0 : 1);
    running = null;
    await vi.advanceTimersByTimeAsync(1200);
    expect(k.setState).toHaveBeenLastCalledWith(0);
    expect(k.setTitle).toHaveBeenLastCalledWith('Mon profil');
  });

  it('permet de basculer entre l’image personnalisée et le mode animé existant', async () => {
    const action = actions.get(`com.supernon0.multioutils.${uuid}`);
    const k = key();
    await action.onWillAppear(event(k, { profileId: 'profile-a' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(k.setImage).toHaveBeenLastCalledWith(expect.stringContaining('data:image/svg+xml'));
    await action.onDidReceiveSettings(event(k, { profileId: 'profile-a', customIcon: true }));
    expect(k.setImage).toHaveBeenLastCalledWith(undefined, { state: 1 });
    k.setImage.mockClear();
    await vi.advanceTimersByTimeAsync(2400);
    expect(k.setImage).not.toHaveBeenCalled();
    await action.onDidReceiveSettings(event(k, { profileId: 'profile-a', customIcon: false }));
    expect(k.setImage).toHaveBeenLastCalledWith(expect.stringContaining('data:image/svg+xml'));
  });

  it('conserve les commandes et les mises à jour du titre après un appui', async () => {
    const action = actions.get(`com.supernon0.multioutils.${uuid}`);
    const k = key();
    const ev = event(k, { profileId: 'profile-a', customIcon: true });
    await action.onWillAppear(ev);
    await vi.advanceTimersByTimeAsync(0);
    k.setImage.mockClear();fetchMock.mockClear();
    await action.onKeyDown(ev);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(uuid === 'autoclick-toggle' ? '/autoclick/toggle' : '/autoclick/select?id=profile-a'), expect.objectContaining({ method: 'POST' }));
    expect(k.setImage).not.toHaveBeenCalled();
    expect(k.setTitle).toHaveBeenLastCalledWith('Mon profil');
  });
});
