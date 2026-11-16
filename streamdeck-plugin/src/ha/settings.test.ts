import { describe, expect, it } from 'vitest';
import { cycleItems, nextCycle, planPress } from './settings';

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

describe('appui d’une touche Home Assistant', () => {
  it('mode automatique selon le domaine', () => {
    expect(planPress({ entity: 'light.salon' }, st('light.salon', 'off'))).toMatchObject({ domain: 'homeassistant', service: 'toggle' });
    expect(planPress({ entity: 'scene.film' }, undefined)).toMatchObject({ domain: 'scene', service: 'turn_on' });
    expect(planPress({ entity: 'camera.porte' }, undefined)).toEqual({ kind: 'camera', id: 'camera.porte' });
    expect(planPress({ entity: 'sensor.t' }, st('sensor.t', '20')).kind).toBe('none');
    expect(planPress({}, undefined).kind).toBe('none');
  });

  it('allumer / éteindre adapté aux volets et serrures', () => {
    expect(planPress({ entity: 'cover.v', mode: 'on' }, undefined)).toMatchObject({ service: 'open_cover' });
    expect(planPress({ entity: 'lock.p', mode: 'off' }, undefined)).toMatchObject({ service: 'lock' });
    expect(planPress({ entity: 'switch.p', mode: 'off' }, undefined)).toMatchObject({ domain: 'homeassistant', service: 'turn_off' });
  });

  it('préréglage de lumière : luminosité et couleur', () => {
    expect(planPress({ entity: 'light.a', mode: 'preset', preset: { brightness: 40, color: '#ff8000' } }, undefined)).toMatchObject({
      service: 'turn_on',
      data: { brightness_pct: 40, rgb_color: [255, 128, 0] }
    });
    expect(planPress({ entity: 'light.a', mode: 'preset', preset: { kelvin: 2700 } }, undefined)).toMatchObject({ data: { color_temp_kelvin: 2700 } });
    expect(planPress({ entity: 'cover.a', mode: 'preset', preset: { position: 30 } }, undefined)).toMatchObject({ service: 'set_cover_position', data: { position: 30 } });
  });

  it('parcourt un cycle', () => {
    expect(cycleItems('100, 50 ,10')).toEqual(['100', '50', '10']);
    expect(nextCycle(['100', '50', '10'], 50)).toBe('10');
    expect(nextCycle(['100', '50', '10'], 10)).toBe('100');
    expect(nextCycle(['100', '50', '10'], 73)).toBe('100');
    expect(planPress({ entity: 'light.a', mode: 'cycle', cycle: '100,50,0' }, st('light.a', 'on', { brightness: 128 }))).toMatchObject({ service: 'turn_off' });
    expect(planPress({ entity: 'input_select.m', mode: 'cycle', cycle: 'Film, Jeu' }, st('input_select.m', 'Film'))).toMatchObject({ service: 'select_option', data: { option: 'Jeu' } });
  });

  it('ajuste par pas', () => {
    expect(planPress({ entity: 'climate.c', mode: 'adjust', step: 0.5 }, st('climate.c', 'heat', { temperature: 20 }))).toMatchObject({ data: { temperature: 20.5 } });
    expect(planPress({ entity: 'media_player.m', mode: 'adjust', step: -10 }, st('media_player.m', 'playing', { volume_level: 0.05 }))).toMatchObject({ data: { volume_level: 0 } });
    expect(planPress({ entity: 'light.a', mode: 'adjust', step: -20 }, undefined)).toMatchObject({ data: { brightness_step_pct: -20 } });
  });

  it('service libre avec données YAML et cible écrite à la main', () => {
    expect(planPress({ entity: 'light.a', mode: 'service', service: 'light.turn_on', data: 'brightness_pct: 30' }, undefined)).toEqual({
      kind: 'service',
      domain: 'light',
      service: 'turn_on',
      data: { brightness_pct: 30 },
      target: { entity_id: 'light.a' }
    });
    expect(planPress({ entity: 'light.a', mode: 'service', service: 'light.turn_off', data: 'area_id: salon' }, undefined)).toMatchObject({ target: { area_id: 'salon' }, data: {} });
    expect(planPress({ mode: 'service', service: 'notify.mobile_app_iphone', data: '{"message": "Coucou"}', targetSelf: false }, undefined)).toMatchObject({ target: undefined });
    expect(planPress({ mode: 'service', service: 'pas un service' }, undefined).kind).toBe('none');
  });

  it('événement et lecteur', () => {
    expect(planPress({ mode: 'event', eventType: 'streamdeck_appui', eventData: 'touche: 3' }, undefined)).toEqual({ kind: 'event', type: 'streamdeck_appui', data: { touche: 3 } });
    expect(planPress({ entity: 'media_player.s', mode: 'media', media: 'mute' }, st('media_player.s', 'playing', { is_volume_muted: false }))).toMatchObject({ service: 'volume_mute', data: { is_volume_muted: true } });
  });
});
