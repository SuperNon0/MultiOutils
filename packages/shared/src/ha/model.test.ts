import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  defaultIcon,
  defaultPress,
  formatState,
  gaugePercent,
  isOnState,
  kelvinToHex,
  lightColor,
  matchRule,
  mdiExportName,
  normalizeServices,
  parseServiceData,
  searchEntities
} from './model';
import type { HaRawState } from './socket';

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HaRawState => ({ entity_id, state, attributes });

describe('catalogue', () => {
  const states = [
    st('light.salon', 'on', { friendly_name: 'Lampe salon' }),
    st('sensor.temp_chambre', '21.46', { friendly_name: 'Température chambre', unit_of_measurement: '°C', device_class: 'temperature' }),
    st('switch.prise', 'off', {}),
    st('light.cachee', 'off', { friendly_name: 'Désactivée' })
  ];
  const cat = buildCatalog(states, {
    entities: [
      { entity_id: 'light.salon', area_id: 'salon' },
      { entity_id: 'sensor.temp_chambre', device_id: 'd1' },
      { entity_id: 'light.cachee', disabled_by: 'user' }
    ],
    devices: [{ id: 'd1', area_id: 'chambre' }],
    areas: [
      { area_id: 'salon', name: 'Salon', floor_id: 'rdc' },
      { area_id: 'chambre', name: 'Chambre', floor_id: 'etage' }
    ],
    floors: [
      { floor_id: 'rdc', name: 'Rez-de-chaussée' },
      { floor_id: 'etage', name: 'Étage' }
    ]
  });

  it('reprend pièces et étages, et ignore les entités désactivées', () => {
    expect(cat.entities.map((e) => e.id)).toEqual(['light.salon', 'switch.prise', 'sensor.temp_chambre']);
    const t = cat.entities.find((e) => e.id === 'sensor.temp_chambre')!;
    expect(t.areaName).toBe('Chambre'); // via l'appareil
    expect(t.floorName).toBe('Étage');
    expect(cat.entities.find((e) => e.id === 'switch.prise')!.name).toBe('prise');
  });

  it('cherche sans accents, dans le nom et la pièce', () => {
    expect(searchEntities(cat.entities, 'temperature').map((e) => e.id)).toEqual(['sensor.temp_chambre']);
    expect(searchEntities(cat.entities, 'salon').map((e) => e.id)).toEqual(['light.salon']);
    expect(searchEntities(cat.entities, '', { domain: 'switch' }).map((e) => e.id)).toEqual(['switch.prise']);
    expect(searchEntities(cat.entities, '', { floor: 'Étage' }).map((e) => e.id)).toEqual(['sensor.temp_chambre']);
  });
});

describe('états et actions', () => {
  it('reconnaît allumé selon le domaine', () => {
    expect(isOnState(st('cover.v', 'open'))).toBe(true);
    expect(isOnState(st('cover.v', 'closed'))).toBe(false);
    expect(isOnState(st('climate.c', 'heat'))).toBe(true);
    expect(isOnState(st('lock.l', 'locked'))).toBe(false);
  });

  it('choisit le bon service pour un appui', () => {
    expect(defaultPress(undefined, 'scene.film')).toMatchObject({ domain: 'scene', service: 'turn_on' });
    expect(defaultPress(st('light.a', 'on'), 'light.a')).toMatchObject({ domain: 'homeassistant', service: 'toggle' });
    expect(defaultPress(st('lock.p', 'locked'), 'lock.p')).toMatchObject({ service: 'unlock' });
    expect(defaultPress(undefined, 'input_select.mode')).toMatchObject({ service: 'select_next', data: { cycle: true } });
    expect(defaultPress(undefined, 'sensor.x')).toEqual({ kind: 'none' });
  });

  it('formate valeurs et unités', () => {
    expect(formatState(st('sensor.t', '21.46', { unit_of_measurement: '°C' }), 1)).toBe('21,5 °C');
    expect(formatState(st('sensor.b', '80', { unit_of_measurement: '%' }))).toBe('80 %');
    expect(formatState(st('light.a', 'on'))).toBe('Allumé');
    expect(formatState(st('light.a', 'unavailable'))).toBe('Indisponible');
  });

  it('calcule la jauge', () => {
    expect(gaugePercent(st('light.a', 'on', { brightness: 128 }))).toBe(50);
    expect(gaugePercent(st('cover.a', 'open', { current_position: 30 }))).toBe(30);
    expect(gaugePercent(st('sensor.b', '45', { unit_of_measurement: '%' }))).toBe(45);
    expect(gaugePercent(st('sensor.t', '20', { unit_of_measurement: '°C' }))).toBeNull();
  });

  it('donne la couleur réelle de la lampe', () => {
    expect(lightColor(st('light.a', 'on', { rgb_color: [255, 0, 16] }))).toBe('#ff0010');
    expect(lightColor(st('light.a', 'off', { rgb_color: [255, 0, 16] }))).toBeNull();
    expect(kelvinToHex(6500)).toMatch(/^#f/);
  });

  it('applique les règles dans l’ordre', () => {
    const rules = [
      { when: 'above' as const, value: '25', color: '#ff0000' },
      { when: 'is' as const, value: 'open', blink: true }
    ];
    expect(matchRule(rules, st('sensor.t', '26'))?.color).toBe('#ff0000');
    expect(matchRule(rules, st('sensor.t', '24'))).toBeNull();
    expect(matchRule(rules, st('binary_sensor.p', 'open'))?.blink).toBe(true);
  });
});

describe('icônes', () => {
  it('prend l’icône de l’entité, sinon celle du type', () => {
    expect(defaultIcon(st('light.a', 'on', { icon: 'mdi:ceiling-light' }), 'light.a')).toBe('mdi:ceiling-light');
    expect(defaultIcon(st('light.a', 'off'), 'light.a')).toBe('mdi:lightbulb-outline');
    expect(defaultIcon(st('sensor.t', '20', { device_class: 'temperature' }), 'sensor.t')).toBe('mdi:thermometer');
    expect(defaultIcon(st('binary_sensor.p', 'on', { device_class: 'door' }), 'binary_sensor.p')).toBe('mdi:door-open');
  });
  it('convertit le nom pour @mdi/js', () => {
    expect(mdiExportName('mdi:lightbulb-outline')).toBe('mdiLightbulbOutline');
    expect(mdiExportName('hass:x')).toBeNull();
  });
});

describe('services', () => {
  it('normalise les champs et les sections repliées', () => {
    const list = normalizeServices({
      light: {
        turn_on: {
          name: 'Allumer',
          target: { entity: [{ domain: ['light'] }] },
          fields: {
            brightness_pct: { name: 'Luminosité', selector: { number: { min: 0, max: 100, unit_of_measurement: '%' } } },
            advanced_fields: { collapsed: true, fields: { flash: { selector: { select: { options: ['short', { value: 'long', label: 'Long' }] } } } } },
            rgb_color: { selector: { color_rgb: {} } }
          }
        }
      }
    });
    expect(list).toHaveLength(1);
    const s = list[0];
    expect(s.targetDomains).toEqual(['light']);
    expect(s.fields.map((f) => [f.key, f.kind])).toEqual([
      ['brightness_pct', 'number'],
      ['flash', 'select'],
      ['rgb_color', 'color']
    ]);
    expect(s.fields[1].advanced).toBe(true);
    expect(s.fields[1].options?.[1]).toEqual({ value: 'long', label: 'Long' });
  });

  it('lit les données en JSON ou en YAML simple', () => {
    expect(parseServiceData('{"a": 1}')).toEqual({ a: 1 });
    expect(parseServiceData('brightness_pct: 40\nrgb_color: [255, 0, 0]\nflash: short\ntransition: 2.5\non: true')).toEqual({
      brightness_pct: 40,
      rgb_color: [255, 0, 0],
      flash: 'short',
      transition: 2.5,
      on: true
    });
    expect(() => parseServiceData('n importe quoi')).toThrow();
  });
});
