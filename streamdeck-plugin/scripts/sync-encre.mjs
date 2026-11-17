// Une seule source pour le kit : le dossier design-encre du dépôt.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = resolve(root, 'streamdeck-plugin/com.supernon0.multioutils.sdPlugin/ui/encre');
mkdirSync(target, { recursive: true });
for (const file of ['encre.css', 'polices.css', 'polices', 'icones.svg']) cpSync(resolve(root, 'design-encre', file), resolve(target, file), { recursive: true });

writeFileSync(resolve(target, 'sprite.js'), 'window.encreSprite = ' + JSON.stringify(readFileSync(resolve(root, 'design-encre/icones.svg'), 'utf8')) + ';\n');
