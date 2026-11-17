// Écrit resources/release-notes.md (notes de la version de package.json, tirées
// de src/common/changelog.json). electron-builder le lit tout seul depuis le
// dossier buildResources et en fait le texte de la release GitHub ; l'app le
// relit ensuite quand une mise à jour est disponible.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const log = JSON.parse(readFileSync(join(root, 'src/common/changelog.json'), 'utf8'));
const entry = log.find((e) => e.version === version);
if (!entry) {
  console.error(`Aucune entrée ${version} dans src/common/changelog.json : ajoute-la avant de publier.`);
  process.exit(1);
}
// Même format que releaseNotesMarkdown (src/common/changelog.ts).
const lines = [`## ${entry.titre}`, ''];
if (entry.nouveautes?.length) lines.push('### Nouveautés', '', ...entry.nouveautes.map((p) => `- ${p}`), '');
if (entry.corrections?.length) lines.push('### Corrections', '', ...entry.corrections.map((p) => `- ${p}`), '');
writeFileSync(join(root, 'resources/release-notes.md'), lines.join('\n'));
console.log(`resources/release-notes.md écrit pour la version ${version}.`);
