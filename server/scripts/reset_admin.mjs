// Réinitialise le mot de passe de SECOURS LOCAL directement dans le store du
// site (table `settings`, clé `local_pw_hash`). Hash argon2id — jamais en clair.
//
// Usage : node scripts/reset_admin.mjs <DATA_DIR> <NOUVEAU_MDP>
// (appelé par deploy/reset_admin.sh, qui gère la génération et le restart).
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import path from 'node:path';

const [, , dataDir, password] = process.argv;
if (!dataDir || !password) {
  console.error('Usage : node scripts/reset_admin.mjs <DATA_DIR> <MOT_DE_PASSE>');
  process.exit(2);
}

const dbPath = path.join(dataDir, 'multioutils-server.db');
const db = new Database(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');

const hash = await argon2.hash(password, { type: argon2.argon2id });
db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
).run('local_pw_hash', hash);

console.log(`✓ Mot de passe de secours local mis à jour dans ${dbPath}`);
