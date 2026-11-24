import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { actions, hub, listeners } = vi.hoisted(() => ({
  actions: new Map<string, any>(), listeners: [] as Array<(ids: string[] | null) => void>,
  hub: { status: { state: 'connected', mode: 'app' }, get: vi.fn(), icon: vi.fn(() => 'M0 0h24v24Z'), call: vi.fn(async () => {}),
    setDirect: vi.fn(), start: vi.fn(), watch: vi.fn(), unwatch: vi.fn(), image: vi.fn(async () => null), template: vi.fn(async () => ''), catalog: vi.fn(async () => ({})) }
}));
vi.mock('@elgato/streamdeck', () => ({
  default: { actions: { registerAction: (a: any) => actions.set(a.manifestId, a) }, logger: { debug: vi.fn(), warn: vi.fn() },
    settings: { onDidReceiveGlobalSettings: vi.fn(), getGlobalSettings: vi.fn(async () => ({})) }, ui: { current: { sendToPropertyInspector: vi.fn(async () => {}) } } },
  SingletonAction: class {}
}));
vi.mock('./hub', () => ({ HaHub: class { constructor() { return Object.assign(hub, { onChange: (fn: (ids: string[] | null) => void) => listeners.push(fn) }); } } }));
import streamDeck from '@elgato/streamdeck';
import { registerHaActions } from './actions';
const sentToPI = (): unknown[] => vi.mocked(streamDeck.ui.current!.sendToPropertyInspector).mock.calls.map((c) => c[0]);
const key = (id = 'key') => ({ id, setState: vi.fn(async () => {}), setImage: vi.fn(async () => {}), setTitle: vi.fn(async () => {}), showAlert: vi.fn(async () => {}), showOk: vi.fn(async () => {}), setSettings: vi.fn(async () => {}) });
const event = (action: ReturnType<typeof key>, settings: Record<string, unknown> = {}) => ({ action, payload: { settings } }) as never;
let state: { entity_id: string; state: string; attributes: Record<string, unknown> };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); actions.clear(); listeners.length = 0;
  state = { entity_id: 'light.test', state: 'on', attributes: { friendly_name: 'Salon', brightness: 128, rgb_color: [255, 0, 0] } };
  hub.get.mockImplementation(() => state);
  registerHaActions({ theme: () => ({ theme: 'dark', accent: '#e8c547', background: '#16181c', live: '#4fc3a1' }) });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('touches Home Assistant personnalisées', () => {
  it('synchronise les deux états et le titre sans redessiner les images de Stream Deck', async () => {
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test', customIcon: true })); await vi.advanceTimersByTimeAsync(0);
    expect(k.setState).toHaveBeenLastCalledWith(1); expect(k.setTitle).toHaveBeenLastCalledWith('Salon');
    expect(k.setImage).toHaveBeenCalledTimes(2); k.setImage.mockClear();
    state.state = 'off'; listeners.forEach((fn) => fn(['light.test'])); await vi.advanceTimersByTimeAsync(0);
    expect(k.setState).toHaveBeenLastCalledWith(0); expect(k.setImage).not.toHaveBeenCalled();
  });
  it('suit aussi l’état réellement actif d’un script Home Assistant', async () => {
    const a = actions.get('com.supernon0.multioutils.ha.scene'), k = key();
    state.state = 'off';
    await a.onWillAppear(event(k, { entity: 'script.test', customIcon: true })); await vi.advanceTimersByTimeAsync(0);
    expect(k.setState).toHaveBeenLastCalledWith(0);
    state.state = 'on'; listeners.forEach((fn) => fn(['script.test'])); await vi.advanceTimersByTimeAsync(0);
    expect(k.setState).toHaveBeenLastCalledWith(1);
  });

  it('affiche et expire la confirmation même avec une image personnalisée', async () => {
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test', customIcon: true, confirm: true })); await vi.advanceTimersByTimeAsync(0);
    await a.onKeyDown(event(k));
    expect(k.setTitle).toHaveBeenLastCalledWith('Confirmer ?'); expect(k.showAlert).toHaveBeenCalled(); expect(hub.call).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3700); expect(k.setTitle).toHaveBeenLastCalledWith('Salon');
    await a.onKeyDown(event(k)); expect(hub.call).not.toHaveBeenCalled();
    await a.onKeyDown(event(k)); expect(hub.call).toHaveBeenCalledTimes(1);
  });
  it('garde une confirmation native quand une image externe cache le dessin SVG', async () => {
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test', icon: 'mdi:lamp', confirm: true })); await vi.advanceTimersByTimeAsync(0);
    await a.onKeyDown(event(k));
    expect(k.setTitle).toHaveBeenLastCalledWith('Confirmer ?'); expect(k.showAlert).toHaveBeenCalled(); expect(hub.call).not.toHaveBeenCalled();
  });
  it('dessine l’icône de l’atelier avec ses propres couleurs, version selon l’état', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ image: 'data:image/svg+xml,custom' }) })); vi.stubGlobal('fetch', fetchMock);
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test', libraryIcon: 'ic_test', gauge: false })); await vi.advanceTimersByTimeAsync(0);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('on')).toBe('1'); expect(url.searchParams.has('color')).toBe(false); expect(url.searchParams.has('value')).toBe(false);
    expect(k.setImage).toHaveBeenLastCalledWith('data:image/svg+xml,custom');
    expect(k.setTitle).toHaveBeenLastCalledWith('Salon');
  });
  it('peut forcer la version éteinte ou prendre la couleur de la lampe', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ image: 'data:image/svg+xml,custom' }) })); vi.stubGlobal('fetch', fetchMock);
    const a = actions.get('com.supernon0.multioutils.ha.light');
    const k1 = key('k1');
    await a.onWillAppear(event(k1, { entity: 'light.test', libraryIcon: 'ic_test', libraryState: 'off' })); await vi.advanceTimersByTimeAsync(0);
    expect(new URL(fetchMock.mock.calls.at(-1)![0] as string).searchParams.get('on')).toBe('0');
    const k2 = key('k2');
    await a.onWillAppear(event(k2, { entity: 'light.test', libraryIcon: 'ic_test', libraryLampColor: true })); await vi.advanceTimersByTimeAsync(0);
    expect(new URL(fetchMock.mock.calls.at(-1)![0] as string).searchParams.get('color')).toBe('#ff0000');
  });
  it('renvoie au panneau les deux versions d’une icône de l’atelier', async () => {
    const fetchMock = vi.fn(async (u: string) => ({ ok: true, json: async () => ({ image: `data:image/svg+xml,${new URL(u).searchParams.get('on')}` }) })); vi.stubGlobal('fetch', fetchMock);
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test' })); await vi.advanceTimersByTimeAsync(0);
    await a.onSendToPlugin({ action: k, payload: { cmd: 'iconPair', id: 'ic_test' } }); await vi.advanceTimersByTimeAsync(0);
    expect(sentToPI()).toContainEqual(expect.objectContaining({ cmd: 'iconPair', id: 'ic_test', on: 'data:image/svg+xml,1', off: 'data:image/svg+xml,0' }));
  });
  it('remplace le texte de l’état par celui choisi (porte : Ouvert / Fermé)', async () => {
    const a = actions.get('com.supernon0.multioutils.ha.sensor'), k = key();
    state = { entity_id: 'binary_sensor.porte', state: 'on', attributes: { friendly_name: 'Porte' } };
    await a.onWillAppear(event(k, { entity: 'binary_sensor.porte', customIcon: true, stateOnText: 'Ouverte', stateOffText: 'Fermée' })); await vi.advanceTimersByTimeAsync(0);
    expect(k.setTitle).toHaveBeenLastCalledWith('Porte\nOuverte');
    state.state = 'off'; listeners.forEach((fn) => fn(['binary_sensor.porte'])); await vi.advanceTimersByTimeAsync(0);
    expect(k.setTitle).toHaveBeenLastCalledWith('Porte\nFermée');
    state.state = 'unavailable'; listeners.forEach((fn) => fn(['binary_sensor.porte'])); await vi.advanceTimersByTimeAsync(0);
    expect(k.setTitle).toHaveBeenLastCalledWith('Porte\nIndisponible');
  });
  it('annule une confirmation précédente lorsque les réglages changent', async () => {
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test', customIcon: true, confirm: true })); await vi.advanceTimersByTimeAsync(0);
    await a.onKeyDown(event(k));
    a.onDidReceiveSettings(event(k, { entity: 'light.test', customIcon: true, confirm: true, titleMode: 'custom', titleText: 'Lecture' })); await vi.advanceTimersByTimeAsync(0);
    expect(k.setTitle).toHaveBeenLastCalledWith('Lecture');
    await a.onKeyDown(event(k)); expect(hub.call).not.toHaveBeenCalled();
  });
  it('applique les réglages du grand éditeur à la même touche Stream Deck', async () => {
    const next = { entity: 'light.test', customIcon: true, titleMode: 'custom', titleText: 'Grande fenêtre', confirm: true };
    const fetchMock = vi.fn(async (url: string, _init?: unknown) => ({ ok: true, json: async () => url.endsWith('/open') ? { token: 'session' } : url.includes('/messages?') ? { closed: true, messages: [{ event: 'setSettings', payload: next }] } : { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key('original');
    await a.onWillAppear(event(k, { entity: 'light.test' })); await vi.advanceTimersByTimeAsync(0);
    await a.onSendToPlugin({ action: k, payload: { cmd: 'editor' } }); await vi.advanceTimersByTimeAsync(0);
    expect(k.setSettings).toHaveBeenCalledWith(next);
    expect(k.setTitle).toHaveBeenLastCalledWith('Grande fenêtre');
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith('/open'))!;
    expect(JSON.parse((request[1] as { body: string }).body)).toMatchObject({ context: 'original', action: 'com.supernon0.multioutils.ha.light' });
  });

  it('ferme l’éditeur si la touche disparaît pendant son ouverture', async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn((url: string) => url.endsWith('/open') ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    const a = actions.get('com.supernon0.multioutils.ha.light'), k = key();
    await a.onWillAppear(event(k, { entity: 'light.test' })); await vi.advanceTimersByTimeAsync(0);
    const opening = a.onSendToPlugin({ action: k, payload: { cmd: 'editor' } });
    a.onWillDisappear(event(k));
    finish({ ok: true, json: async () => ({ token: 'session' }) });
    await opening; await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/close'), expect.anything());
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/messages?'))).toBe(false);
  });

});
