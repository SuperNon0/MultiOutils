import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { shellIcon } from './shell-icons';

describe.skipIf(process.platform !== 'win32')('Windows Shell icon extraction', () => {
  it('loads a real folder icon and an indexed DLL icon in the same batch', async () => {
    const [folder, indexed] = await Promise.all([
      shellIcon({ path: os.tmpdir(), index: null, size: 32 }),
      shellIcon({ path: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'shell32.dll'), index: 3, size: 32 })
    ]);
    expect(folder?.startsWith('data:image/png;base64,')).toBe(true);
    expect(indexed?.startsWith('data:image/png;base64,')).toBe(true);
  }, 30_000);
});
