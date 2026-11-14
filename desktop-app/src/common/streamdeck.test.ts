import { describe, expect, it } from 'vitest';
import { streamDeckTheme } from './streamdeck';

describe('streamDeckTheme', () => {
  it("suit l'accent et le thème de l'app", () => {
    expect(streamDeckTheme({ accent: 'or', theme: 'sombre' }, false)).toMatchObject({ theme: 'dark', accent: '#e8c547' });
    expect(streamDeckTheme({ accent: 'menthe', theme: 'auto' }, false)).toMatchObject({ theme: 'light', accent: '#0b7562' });
    expect(streamDeckTheme({ accent: 'corail', theme: 'auto' }, true).palette).toHaveLength(5);
  });
});
