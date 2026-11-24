import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../com.supernon0.multioutils.sdPlugin/manifest.json';
import {
  PANEL_ACTION,
  PANEL_PROFILE,
  SLOT_COUNT,
  currentLevel,
  defaultSlots,
  hexToKelvin,
  levelPlan,
  lightCaps,
  panelLayout,
  profileManifest,
  resolveLevels,
  resolveSlots,
  slotActive,
  slotPlan
} from './light-panel';
import { buildLightProfile } from './profile-zip';

const light = (attrs: Record<string, unknown>, state = 'on') => ({ entity_id: 'light.salon', state, attributes: attrs, last_changed: '', last_updated: '' });
const RGB = light({ supported_color_modes: ['hs', 'color_temp'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 });
const WHITE = light({ supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 });
const DIM = light({ supported_color_modes: ['brightness'] });

describe('panneau lumière', () => {
  it('reconnaît le type d’ampoule', () => {
    expect(lightCaps(RGB as never)).toMatchObject({ color: true, white: true });
    expect(lightCaps(WHITE as never)).toMatchObject({ color: false, white: true, minK: 2700, maxK: 6500 });
    expect(lightCaps(DIM as never)).toMatchObject({ color: false, white: false });
  });

  it('propose des couleurs puis des blancs pour une ampoule RVB, des nuances de blanc sinon', () => {
    const rgb = defaultSlots(lightCaps(RGB as never));
    expect(rgb).toHaveLength(SLOT_COUNT);
    expect(rgb.slice(0, 8).every((s) => s.c)).toBe(true);
    expect(rgb.slice(8).every((s) => s.k)).toBe(true);
    const white = defaultSlots(lightCaps(WHITE as never));
    expect(white).toHaveLength(SLOT_COUNT);
    expect(white.every((s) => s.k && s.k >= 2700 && s.k <= 6500)).toBe(true);
    expect(white[0].k).toBe(2700);
    expect(white[15].k).toBe(6500);
    expect(defaultSlots(lightCaps(DIM as never))).toEqual([]);
  });

  it('garde les teintes réglées sur la touche et ignore les valeurs invalides', () => {
    const caps = lightCaps(RGB as never);
    const slots = resolveSlots([{ c: '#FF0000' }, { k: 3000 }, { c: 'rouge' }, null], caps);
    expect(slots).toHaveLength(SLOT_COUNT);
    expect(slots.slice(0, 4)).toEqual([{ c: '#ff0000' }, { k: 3000 }, null, null]);
    expect(resolveLevels([5, 'x', 200])).toEqual([5, 25, 100, 75, 100]);
  });

  it('envoie une couleur ou un blanc selon l’ampoule', () => {
    const caps = lightCaps(WHITE as never);
    expect(slotPlan('light.a', { c: '#ff0000' }, lightCaps(RGB as never))).toMatchObject({ service: 'turn_on', data: { rgb_color: [255, 0, 0] } });
    // une couleur sur une ampoule blanche devient le blanc le plus proche
    const warm = slotPlan('light.a', { c: '#ff8800' }, caps);
    expect(warm.kind === 'service' && (warm.data?.color_temp_kelvin as number)).toBeLessThan(3500);
    expect(slotPlan('light.a', { k: 2000 }, caps)).toMatchObject({ data: { color_temp_kelvin: 2700 } });
    expect(slotPlan('light.a', null, caps).kind).toBe('none');
    expect(levelPlan('light.a', 25)).toMatchObject({ service: 'turn_on', data: { brightness_pct: 25 }, target: { entity_id: 'light.a' } });
    expect(hexToKelvin('#0000ff')).toBeGreaterThan(hexToKelvin('#ff0000'));
  });

  it('repère la teinte et la luminosité actuelles', () => {
    const on = light({ color_mode: 'hs', rgb_color: [255, 59, 48], brightness: 128 });
    expect(slotActive({ c: '#ff3b30' }, on as never)).toBe(true);
    expect(slotActive({ c: '#007aff' }, on as never)).toBe(false);
    expect(slotActive({ k: 3000 }, light({ color_mode: 'color_temp', color_temp_kelvin: 3003 }) as never)).toBe(true);
    expect(currentLevel(on as never)).toBe(50);
    expect(currentLevel(light({}, 'off') as never)).toBe(0);
  });

  it('remplit les 15 touches du Stream Deck', () => {
    const keys = panelLayout().map((k) => `${k.col},${k.row}`);
    expect(new Set(keys).size).toBe(15);
    for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) expect(keys).toContain(`${c},${r}`);
    const m = profileManifest() as { Actions: Record<string, { UUID: string }> };
    expect(Object.values(m.Actions).every((a) => a.UUID === PANEL_ACTION)).toBe(true);
  });
});

describe('profil fourni avec le plugin', () => {
  const file = resolve(__dirname, '../../com.supernon0.multioutils.sdPlugin', PANEL_PROFILE + '.streamDeckProfile');

  it('est déclaré dans le manifeste, sans bascule à l’installation', () => {
    const entry = (manifest as { Profiles?: Array<{ Name: string; DeviceType: number; DontAutoSwitchWhenInstalled?: boolean }> }).Profiles?.find((p) => p.Name === PANEL_PROFILE);
    expect(entry).toMatchObject({ DeviceType: 0, DontAutoSwitchWhenInstalled: true });
    const action = manifest.Actions.find((a) => a.UUID === PANEL_ACTION) as { VisibleInActionsList?: boolean } | undefined;
    expect(action?.VisibleInActionsList).toBe(false);
  });

  it('correspond au fichier généré (UPDATE_PROFILE=1 pour le refaire)', () => {
    const bytes = Buffer.from(buildLightProfile());
    if (process.env.UPDATE_PROFILE || !existsSync(file)) writeFileSync(file, bytes);
    expect(readFileSync(file).equals(bytes)).toBe(true);
  });
});
