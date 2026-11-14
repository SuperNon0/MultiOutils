import { describe, expect, it } from 'vitest';
import { widgetCommand, widgetEntity } from './widget-controls';
import type { HaState } from './homeassistant';

const light: HaState = { entity_id: 'light.salon', state: 'on', attributes: {
  friendly_name: 'Salon', brightness: 128, supported_color_modes: ['brightness']
} };
describe('real Home Assistant widget capabilities', () => {
  it('derives brightness and labels from entity attributes', () => {
    expect(widgetEntity(light)).toMatchObject({ name: 'Salon', brightness: 50, supportsBrightness: true });
    expect(widgetCommand(light, 'brightness', 60)).toEqual({
      domain: 'light', service: 'turn_on', data: { entity_id: 'light.salon', brightness_pct: 60 }
    });
  });
  it('rejects invalid brightness and unsupported entities without sending a command', () => {
    for (const value of [-1, 101, NaN, Infinity]) expect(() => widgetCommand(light, 'brightness', value)).toThrow();
    expect(() => widgetCommand({ entity_id: 'switch.prise', state: 'on' }, 'brightness', 50)).toThrow();
    expect(() => widgetCommand({ entity_id: 'light.onoff', state: 'on', attributes: { supported_color_modes: ['onoff'] } }, 'brightness', 50)).toThrow();
  });
  it('only enables media actions advertised by the player', () => {
    const player: HaState = { entity_id: 'media_player.salon', state: 'playing', attributes: { supported_features: 1 | 16 | 32, media_title: 'Track' } };
    expect(widgetEntity(player).mediaControls).toEqual({ previous: true, next: true, playPause: true });
    expect(widgetCommand(player, 'playPause').service).toBe('media_play_pause');
    expect(widgetCommand(player, 'next').service).toBe('media_next_track');
    expect(() => widgetCommand({ ...player, attributes: { supported_features: 0 } }, 'next')).toThrow();
    expect(widgetEntity({ ...player, state: 'paused' }).mediaControls?.playPause).toBe(false);
  });
  it('does not allow operations on unavailable entities', () => {
    expect(() => widgetCommand({ ...light, state: 'unavailable' }, 'brightness', 60)).toThrow();
  });
  it('preserves real sensor values and units without invented values', () => {
    const entity = widgetEntity({ entity_id: 'sensor.temperature', state: '22.4', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } });
    expect(entity).toMatchObject({ state: '22.4', unit: '°C', deviceClass: 'temperature' });
    expect(entity.brightness).toBeUndefined();
  });
});
