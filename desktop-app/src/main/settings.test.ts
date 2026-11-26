import { describe, expect, it } from 'vitest';
import { normalizeAppearance } from './settings';

describe('normalizeAppearance', () => {
  it('garde le style « verre » choisi', () => {
    expect(normalizeAppearance({ accent: 'menthe', theme: 'sombre', style: 'verre' })).toEqual({
      accent: 'menthe',
      theme: 'sombre',
      style: 'verre'
    });
  });

  it('remet le style « encre » quand il manque ou est inconnu (anciens réglages)', () => {
    expect(normalizeAppearance({ accent: 'or', theme: 'clair' }).style).toBe('encre');
    expect(normalizeAppearance({ style: 'plastique' }).style).toBe('encre');
    expect(normalizeAppearance(null)).toEqual({ accent: 'lavande', theme: 'auto', style: 'encre' });
  });
});
