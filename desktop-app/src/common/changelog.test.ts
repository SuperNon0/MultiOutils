import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import {
  CHANGELOG,
  changelogBetween,
  changelogToShow,
  releaseNotesMarkdown,
  releaseNotesToText
} from './changelog';

describe('historique des versions', () => {
  it('a une entrée pour la version de package.json (à ajouter à chaque release)', () => {
    expect(CHANGELOG[0]?.version).toBe(pkg.version);
  });

  it('chaque entrée est complète et unique', () => {
    const seen = new Set<string>();
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.titre.trim()).not.toBe('');
      expect((e.nouveautes?.length ?? 0) + (e.corrections?.length ?? 0)).toBeGreaterThan(0);
      expect(seen.has(e.version)).toBe(false);
      seen.add(e.version);
    }
  });

  it('donne les versions sautées entre deux mises à jour', () => {
    expect(changelogBetween('0.9.2', '0.9.4').map((e) => e.version)).toEqual(['0.9.4', '0.9.3']);
    expect(changelogBetween('0.9.9', '0.10.0').map((e) => e.version)).toEqual(['0.10.0']);
  });

  it('choisit quoi montrer au démarrage', () => {
    expect(changelogToShow('', '0.9.4', true)).toEqual([]);
    expect(changelogToShow('0.9.4', '0.9.4', false)).toEqual([]);
    expect(changelogToShow('', '0.9.4', false).map((e) => e.version)).toEqual(['0.9.4']);
    expect(changelogToShow('0.9.3', '0.10.0', false).map((e) => e.version)).toEqual([
      '0.10.0',
      '0.9.4'
    ]);
    expect(changelogToShow('0.10.0', '0.9.4', false)).toEqual([]);
  });

  it('produit des notes Markdown', () => {
    const md = releaseNotesMarkdown({
      version: '1.0.0',
      date: '2026-01-01',
      titre: 'Titre',
      nouveautes: ['A'],
      corrections: ['B']
    });
    expect(md).toContain('## Titre');
    expect(md).toContain('### Nouveautés\n\n- A');
    expect(md).toContain('### Corrections\n\n- B');
  });

  it('transforme les notes HTML de GitHub en texte simple', () => {
    expect(
      releaseNotesToText('<h2>Titre</h2><h3>Nouveautés</h3><ul><li>A &amp; B</li><li><b>C</b></li></ul>')
    ).toBe('Titre\nNouveautés\n• A & B\n• C');
    expect(releaseNotesToText('## T\n\n- a\n- b')).toBe('T\n• a\n• b');
    expect(releaseNotesToText([{ version: '1', note: '<p>x</p>' }])).toBe('x');
    expect(releaseNotesToText('')).toBeUndefined();
    expect(releaseNotesToText(null)).toBeUndefined();
  });
});
