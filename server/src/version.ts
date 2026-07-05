import fs from 'node:fs';
import path from 'node:path';

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Version installée du serveur (affichée par /api/health et l'admin). */
export const VERSION = readVersion();
