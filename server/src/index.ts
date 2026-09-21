import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { ensureDirs, env, sessionSecret } from './env';
import { adminRouter } from './routes/admin';
import { apiRouter } from './routes/api';
import { webRouter } from './routes/web';
import { allowLocalLogin, isLocalPasswordSet, seedSecurityFromEnv } from './security';
import { VERSION } from './version';

/** Bootstrap Express (docs/01 §3) : API + interface web sur le même port. */
async function main(): Promise<void> {
  ensureDirs();
  // Première install : amorce la config Cloudflare et le mot de passe de secours
  // depuis l'environnement si le store est vide (voir security.ts).
  await seedSecurityFromEnv();
  const app = express();

  if (env.trustProxy) app.set('trust proxy', 1); // Cloudflare Tunnel en façade
  app.disable('x-powered-by');
  app.use(
    helmet({
      // pages HTML servies par nous-mêmes uniquement
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'"],
          formAction: ["'self'"],
          // On sert le site en HTTP simple sur le réseau local (l'HTTPS est
          // assuré en façade par Cloudflare Tunnel). Sans ce null, Helmet
          // ajoute `upgrade-insecure-requests`, qui force le navigateur à
          // recharger CSS/polices en HTTPS → échec et page cassée en LAN.
          upgradeInsecureRequests: null
        }
      },
      // HSTS n'a de sens que servi en HTTPS ; ici TLS est terminé par
      // Cloudflare. L'activer sur du HTTP local est inutile et peut piéger un
      // navigateur qui a déjà vu le domaine en HTTPS. On laisse Cloudflare le
      // gérer.
      hsts: false
    })
  );
  app.use(express.urlencoded({ extended: false }));
  // clips texte envoyés en JSON par le Raccourci iOS et l'app (docs/00 §9.4)
  app.use(express.json({ limit: '1mb' }));
  app.use(
    session({
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000
      }
    })
  );

  // assets publics (css, polices) — aucune donnée utilisateur ici
  app.use('/public', express.static(path.resolve(__dirname, '..', 'public')));

  // Premier lancement : tant qu'aucun mot de passe de secours local n'existe
  // (et que le secours local est autorisé), on redirige vers /setup pour en
  // définir un. Si le secours local est désactivé, l'entrée se fait uniquement
  // par Cloudflare : pas de /setup.
  app.use((req, res, next) => {
    if (
      allowLocalLogin() &&
      !isLocalPasswordSet() &&
      !req.path.startsWith('/setup') &&
      !req.path.startsWith('/login') &&
      !req.path.startsWith('/oubli') &&
      !req.path.startsWith('/public') &&
      !req.path.startsWith('/api')
    ) {
      res.redirect('/setup');
      return;
    }
    next();
  });

  app.use('/api', apiRouter);
  app.use(adminRouter);
  app.use(webRouter);

  // On écoute explicitement sur toutes les interfaces IPv4 (0.0.0.0) pour
  // garantir l'accès depuis le réseau local par l'IP du conteneur, même si
  // l'IPv6 est désactivé dans le LXC.
  app.listen(env.port, env.host, () => {
    console.log(`MultiOutils server v${VERSION} — http://${env.host}:${env.port}`);
    console.log(`Données : ${env.dataDir}`);
  });
}

void main();
