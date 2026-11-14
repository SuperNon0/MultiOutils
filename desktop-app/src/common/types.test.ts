import { describe, expect, it } from 'vitest';
import { compareVersions } from './types';

describe('compareVersions', () => {
  it('compare les versions du plugin Stream Deck', () => {
    expect(compareVersions('0.5.0.0', '0.6.0.0')).toBeLessThan(0);
    expect(compareVersions('0.6.0.0', '0.6.0')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0.1')).toBeLessThan(0);
  });
});
