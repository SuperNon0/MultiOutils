import { describe, expect, it } from 'vitest';
import { renderKey, type KeyLook } from './render';

const base: KeyLook = { style: 'accent', background: '#16181c', dark: true, color: '#ffaa00', on: true, title: 'Salon', value: '42' };
const svg = (look: KeyLook): string => decodeURIComponent(renderKey(look).split(',')[1]);

describe('couleur des textes automatiques', () => {
  it('applique la couleur choisie au nom, à la valeur et à la confirmation', () => {
    const result = svg({ ...base, image: 'data:image/png;base64,AA', textColor: '#12ab34', confirm: 'Confirmer ?' });
    const texts = result.match(/<text\b[^>]*>/g) ?? [];
    expect(texts).toHaveLength(4);
    for (const text of texts) expect(text).toContain('fill="#12ab34"');
  });
  it('conserve le contraste automatique sans couleur ou avec une couleur invalide', () => {
    expect(svg({ ...base, textColor: 'invalid' })).toBe(svg(base));
    expect(svg(base)).toContain('fill="#f0ede6"');
  });
});
