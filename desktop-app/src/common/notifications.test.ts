import { describe, expect, it } from 'vitest';
import {
  defaultNotifSettings,
  normalizeNotifSettings,
  notifAllowed,
  notifKindForModule,
  notifSettingsFromHa
} from './notifications';

describe('notifications', () => {
  it('keeps valid values and falls back on the defaults', () => {
    const n = normalizeNotifSettings({ position: 'top-left', size: 'huge', duration: 999, volume: -4, soundName: '../x', kinds: { capture: false, nope: true } });
    expect(n.position).toBe('top-left');
    expect(n.size).toBe('normal');
    expect(n.duration).toBe(120);
    expect(n.volume).toBe(0);
    expect(n.soundName).toBe('carillon');
    expect(n.kinds.capture).toBe(false);
    expect(n.kinds.clipboard).toBe(true);
    expect('nope' in n.kinds).toBe(false);
  });

  it('takes over the Home Assistant pop-up settings', () => {
    const n = notifSettingsFromHa({ enabled: false, position: 'top-right', duration: 30, sound: true, soundName: 'cloche', volume: 40, doNotDisturb: true });
    expect(n).toMatchObject({ position: 'top-right', soundName: 'cloche', volume: 40, doNotDisturb: true, duration: 6, sound: false });
    expect(n.kinds.homeassistant).toBe(false);
    expect(n.kinds.capture).toBe(true);
  });

  it('filters by kind, do not disturb and errors', () => {
    const s = defaultNotifSettings();
    expect(notifAllowed(s, { kind: 'capture' })).toBe(true);
    const noCapture = { ...s, kinds: { ...s.kinds, capture: false } };
    expect(notifAllowed(noCapture, { kind: 'capture' })).toBe(false);
    expect(notifAllowed(noCapture, { kind: 'capture', error: true })).toBe(true);
    expect(notifAllowed({ ...noCapture, errorsAlways: false }, { kind: 'capture', error: true })).toBe(false);
    const dnd = { ...s, doNotDisturb: true };
    expect(notifAllowed(dnd, { kind: 'clipboard' })).toBe(false);
    expect(notifAllowed(dnd, { kind: 'homeassistant', important: true })).toBe(true);
    expect(notifAllowed(dnd, { kind: 'desktop', error: true })).toBe(true);
    const off = { ...s, enabled: false };
    expect(notifAllowed(off, { kind: 'app', error: true })).toBe(false);
    expect(notifAllowed(off, { kind: 'homeassistant', force: true })).toBe(true);
  });

  it('maps each module to its family', () => {
    expect(notifKindForModule('screenshot')).toBe('capture');
    expect(notifKindForModule('color-picker')).toBe('colorpicker');
    expect(notifKindForModule('autoclicker')).toBe('autoclick');
    expect(notifKindForModule('icons')).toBe('app');
  });
});
