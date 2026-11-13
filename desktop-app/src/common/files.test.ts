import { describe, expect, it } from 'vitest';
import { applyFilters, batchConflicts, batchNames, cleanMatches, defaultBatch, sameSizeGroups, type CleanRule } from './files';

const DAY = 86_400_000;
const now = 1_700_000_000_000;

describe('batchNames', () => {
  const items = [
    { name: 'IMG_001.jpg', isDir: false, mtime: new Date(2024, 0, 5).getTime() },
    { name: 'IMG_002.JPG', isDir: false, mtime: new Date(2024, 0, 6).getTime() },
    { name: 'Dossier.v2', isDir: true, mtime: 0 }
  ];
  it('applique le modèle et garde l’extension', () => {
    expect(batchNames(items, { ...defaultBatch(), pattern: 'Vacances {n}', start: 1, pad: 2 })).toEqual(['Vacances 01.jpg', 'Vacances 02.JPG', 'Vacances 03']);
  });
  it('remplace {nom} et {date}', () => {
    expect(batchNames(items.slice(0, 1), { ...defaultBatch(), pattern: '{date} {nom}' })).toEqual(['2024-01-05 IMG_001.jpg']);
  });
  it('rechercher-remplacer seul, avec ou sans regex', () => {
    expect(batchNames(items.slice(0, 2), { ...defaultBatch(), find: 'IMG_', replace: 'photo-' })).toEqual(['photo-001.jpg', 'photo-002.JPG']);
    expect(batchNames(items.slice(0, 2), { ...defaultBatch(), find: '\\d+', replace: 'x', regex: true })).toEqual(['IMG_x.jpg', 'IMG_x.JPG']);
    expect(batchNames(items.slice(0, 1), { ...defaultBatch(), find: '(', replace: 'x', regex: true })).toEqual(['IMG_001.jpg']);
  });
  it('casse et caractères interdits', () => {
    expect(batchNames(items.slice(0, 1), { ...defaultBatch(), pattern: 'a:b?', case: 'upper' })).toEqual(['A_B_.jpg']);
  });
});

describe('batchConflicts', () => {
  it('repère les doublons entre eux et avec les autres fichiers', () => {
    expect([...batchConflicts(['a.txt', 'A.TXT', 'b.txt'], [])].sort()).toEqual([0, 1]);
    expect([...batchConflicts(['a.txt', 'c.txt'], ['C.txt'])]).toEqual([1]);
  });
});

describe('applyFilters', () => {
  const list = [
    { kind: 'image' as const, mtime: now - DAY / 2, size: 5 * 1024 * 1024, isDir: false },
    { kind: 'video' as const, mtime: now - 10 * DAY, size: 500 * 1024 * 1024, isDir: false },
    { kind: 'folder' as const, mtime: now, size: 0, isDir: true }
  ];
  it('filtre par type, date et taille', () => {
    expect(applyFilters(list, { kinds: ['image'], days: 0, minMb: 0 }, now)).toHaveLength(1);
    expect(applyFilters(list, { kinds: [], days: 1, minMb: 0 }, now)).toHaveLength(2);
    expect(applyFilters(list, { kinds: [], days: 0, minMb: 100 }, now)).toEqual([list[1]]);
  });
});

describe('cleanMatches', () => {
  const rule: CleanRule = { id: 'r', enabled: true, folder: 'x', days: 30, exts: '.zip, exe', folders: false };
  const list = [
    { ext: 'zip', mtime: now - 40 * DAY, isDir: false },
    { ext: 'zip', mtime: now - 10 * DAY, isDir: false },
    { ext: 'pdf', mtime: now - 40 * DAY, isDir: false },
    { ext: '', mtime: now - 40 * DAY, isDir: true }
  ];
  it('âge et extensions', () => {
    expect(cleanMatches(list, rule, now)).toEqual([list[0]]);
    expect(cleanMatches(list, { ...rule, exts: '' }, now)).toEqual([list[0], list[2]]);
    expect(cleanMatches(list, { ...rule, exts: '', folders: true }, now)).toHaveLength(3);
  });
});

describe('sameSizeGroups', () => {
  it('ne garde que les tailles partagées', () => {
    const g = sameSizeGroups([
      { path: 'a', size: 10 },
      { path: 'b', size: 10 },
      { path: 'c', size: 11 },
      { path: 'd', size: 0 },
      { path: 'e', size: 0 }
    ]);
    expect(g).toEqual([{ size: 10, paths: ['a', 'b'] }]);
  });
});
