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

describe('couleurs éteint et fond', () => {
  const icon: KeyLook = { ...base, iconPath: 'M0 0h24v24H0z', title: '', value: '' };
  it('applique la couleur éteint choisie au symbole, pour chaque style', () => {
    expect(svg({ ...icon, on: false, offColor: '#3366ff' })).toContain('fill="#3366ff"');
    expect(svg({ ...icon, on: false, offColor: '#3366ff', style: 'symbole' })).toContain('fill="#3366ff"');
    expect(svg({ ...icon, on: false, offColor: '#3366ff', style: 'plein' })).toContain('<rect width="144" height="144" rx="22" fill="#3366ff"/>');
    // allumée, la couleur éteint n'intervient pas
    expect(svg({ ...icon, offColor: '#3366ff' })).not.toContain('#3366ff');
  });
  it('utilise la couleur de fond choisie et adapte le texte à sa clarté', () => {
    const light = svg({ ...base, bgColor: '#f5f5f5' });
    expect(light).toContain('<rect width="144" height="144" rx="22" fill="#f5f5f5"/>');
    expect(light).toContain('fill="#1b1d22"');
    expect(svg({ ...base, style: 'symbole', bgColor: '#223344' })).toContain('fill="#223344"');
  });
});
