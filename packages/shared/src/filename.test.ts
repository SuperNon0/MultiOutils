import { describe, expect, it } from 'vitest';
import {
  buildCaptureName,
  DEFAULT_FILENAME_TEMPLATE,
  sanitizeFilename
} from './filename';

const d = new Date(2026, 6, 3, 9, 5, 7); // 3 juillet 2026, 09:05:07 (local)

describe('buildCaptureName', () => {
  it('produit le format par défaut Capture_AAAA-MM-JJ_HH-MM-SS', () => {
    expect(buildCaptureName(DEFAULT_FILENAME_TEMPLATE, { date: d })).toBe(
      'Capture_2026-07-03_09-05-07'
    );
  });

  it('remplace le compteur et le nom d’app', () => {
    expect(
      buildCaptureName('{app}_{counter}', { date: d, counter: 12, appName: 'Firefox' })
    ).toBe('Firefox_12');
  });

  it('nettoie les variables vides sans laisser de séparateurs orphelins', () => {
    expect(buildCaptureName('Capture_{app}_{date}', { date: d })).toBe(
      'Capture_2026-07-03'
    );
  });

  it('retombe sur le nom par défaut si le modèle ne produit rien', () => {
    expect(buildCaptureName('{app}', { date: d })).toBe(
      'Capture_2026-07-03_09-05-07'
    );
  });
});

describe('sanitizeFilename', () => {
  it('retire les caractères interdits Windows', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('abcdefghij');
  });

  it('retire points et espaces terminaux', () => {
    expect(sanitizeFilename('rapport. ')).toBe('rapport');
  });
});
