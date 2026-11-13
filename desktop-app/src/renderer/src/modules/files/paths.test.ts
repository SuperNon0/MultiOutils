import { describe, expect, it } from 'vitest';
import { crumbs, freeName, joinPath, parentPath } from './paths';

describe('chemins', () => {
  it('parent et racines', () => {
    expect(parentPath('C:\\Users\\noe')).toBe('C:\\Users');
    expect(parentPath('C:\\Users')).toBe('C:\\');
    expect(parentPath('C:\\')).toBeNull();
    expect(parentPath('/home/x')).toBe('/home');
    expect(parentPath('/home')).toBe('/');
    expect(parentPath('/')).toBeNull();
    expect(parentPath('\\\\nas\\partage')).toBeNull();
  });
  it('join et fil d’Ariane', () => {
    expect(joinPath('C:\\', 'a')).toBe('C:\\a');
    expect(joinPath('C:\\Users', 'a')).toBe('C:\\Users\\a');
    expect(crumbs('C:\\Users\\noe').map((c) => c.label)).toEqual(['C:', 'Users', 'noe']);
    expect(crumbs('/home/x').map((c) => c.path)).toEqual(['/', '/home', '/home/x']);
  });
  it('nom libre', () => {
    expect(freeName('Nouveau dossier', ['nouveau dossier', 'Nouveau dossier (2)'])).toBe('Nouveau dossier (3)');
  });
});
