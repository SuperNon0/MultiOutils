// Réinitialise le mot de passe de SECOURS LOCAL directement dans le store du
// site (table `settings`, clé `local_pw_hash`). Hash argon2id — jamais en clair.
//
// Usage : node scripts/reset_admin.mjs <DATA_DIR> <NOUVEAU_MDP>
// (appelé par deploy/reset_admin.sh, qui gère la génération et le restart).
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import fs from 'node:fs';
import path from 'node:path';

const [, , dataDir, password] = process.argv;
if (!dataDir || !password) {
  console.error('Usage : node scripts/reset_admin.mjs <DATA_DIR> <MOT_DE_PASSE>');
  process.exit(2);
}

const dbPath = path.join(dataDir, 'multioutils-server.db');
// Base absente = mauvais DATA_DIR : on ne crée surtout pas une base vide à côté
// (le reset « réussirait » sans rien changer pour le site).
if (!fs.existsSync(dbPath)) {
  console.error(`✗ Base introuvable : ${dbPath}`);
  console.error('  Vérifie DATA_DIR (dans le .env du serveur) ou lance :');
  console.error('  DATA_DIR=/chemin/vers/data bash deploy/reset_admin.sh');
  process.exit(1);
}

const db = new Database(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');

const hash = await argon2.hash(password, { type: argon2.argon2id });
const upsert = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
upsert.run('local_pw_hash', hash);

// Vérifie que le hash relu correspond bien au mot de passe.
const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('local_pw_hash');
if (!stored || !(await argon2.verify(stored.value, password))) {
  console.error('✗ Le mot de passe a été écrit mais ne se relit pas correctement.');
  process.exit(1);
}

console.log(`✓ Mot de passe de secours local mis à jour dans ${dbPath}`);

// Secours local décoché dans les réglages → /login renverrait 403 : on le réactive
// (sinon le nouveau mot de passe ne servirait à rien).
const allow = db.prepare('SELECT value FROM settings WHERE key = ?').get('allow_local_login');
if (allow && allow.value === '0') {
  upsert.run('allow_local_login', '1');
  console.log('✓ « Autoriser l\'accès local » était désactivé : réactivé.');
}
db.close();
