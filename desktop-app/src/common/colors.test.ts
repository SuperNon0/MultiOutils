import { describe, expect, it } from 'vitest';
import { cleanColorLibrary, cleanSavedColor, upsertById } from './colors';

describe('Mes couleurs', () => {
  it('nettoie la bibliothèque : couleurs invalides écartées, dossier inconnu retiré', () => {
    const lib = cleanColorLibrary({
      folders: [{ id: 'f_fond', name: ' Fonds ' }, { id: 'x', name: 'trop court' }, { id: 'f_vide', name: '  ' }],
      colors: [
        { id: 'col_1', hex: '#A99BFF', name: 'Lavande', folder: 'f_fond' },
        { id: 'col_2', hex: 'rouge', name: 'Rouge' },
        { id: 'col_3', hex: '#112233', name: '', folder: 'f_inconnu' },
        { id: 'col_1', hex: '#000000', name: 'doublon' }
      ]
    });
    expect(lib.folders).toEqual([{ id: 'f_fond', name: 'Fonds' }]);
    expect(lib.colors).toEqual([
      { id: 'col_1', hex: '#a99bff', name: 'Lavande', folder: 'f_fond' },
      { id: 'col_3', hex: '#112233', name: '#112233', folder: null }
    ]);
    expect(cleanColorLibrary('n’importe quoi')).toEqual({ colors: [], folders: [] });
  });
  it('limite la longueur du nom et remplace par id', () => {
    expect(cleanSavedColor({ id: 'col_9', hex: '#ffffff', name: 'x'.repeat(80) })?.name).toHaveLength(40);
    expect(upsertById([{ id: 'a', v: 1 }], { id: 'a', v: 2 })).toEqual([{ id: 'a', v: 2 }]);
    expect(upsertById([{ id: 'a', v: 1 }], { id: 'b', v: 2 })).toHaveLength(2);
  });
});
