import { describe, expect, it } from 'vitest';
import { expandEnv, parseUrlShortcut } from './shortcut-files';

describe('raccourcis Windows', () => {
  it('lit IconFile et URL d\'un .url Steam', () => {
    const txt = '[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n[InternetShortcut]\r\nIDList=\r\nIconIndex=0\r\nURL=steam://rungameid/730\r\nIconFile=C:\\Program Files (x86)\\Steam\\steam\\games\\abc.ico\r\n';
    expect(parseUrlShortcut(txt)).toEqual({ iconFile: 'C:\\Program Files (x86)\\Steam\\steam\\games\\abc.ico', url: 'steam://rungameid/730' });
    expect(parseUrlShortcut('[InternetShortcut]\nURL=https://x.fr')).toEqual({ iconFile: null, url: 'https://x.fr' });
  });
  it('développe les variables %VAR% sans tenir compte de la casse', () => {
    expect(expandEnv('%SystemRoot%\\a.dll', { SYSTEMROOT: 'C:\\Windows' })).toBe('C:\\Windows\\a.dll');
    expect(expandEnv('%NOPE%\\x', {})).toBe('%NOPE%\\x');
  });
});
