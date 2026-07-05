import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { hasUsers } from './auth';
import { ensureDirs, env, sessionSecret } from './env';
import { adminRouter } from './routes/admin';
import { apiRouter } from './routes/api';
import { webRouter } from './routes/web';
import { VERSION } from './version';

/** Bootstrap Express (docs/01 §3) : API + interface web sur le même port. */
function main(): void {
  ensureDirs();
  const app = express();

  if (env.trustProxy) app.set('trust proxy', 1); // Cloudflare Tunnel en façade
  app.disable('x-powered-by');
  app.use(
    helmet({
      // pages HTML servies par nous-mêmes uniquement
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'"],
          styleSrc: ["'self'"],
          formAction: ["'self'"]
        }
      }
    })
  );
  app.use(express.urlencoded({ extended: false }));
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

  // premier lancement : tout redirige vers la création du compte admin
  app.use((req, res, next) => {
    if (
      !hasUsers() &&
      !req.path.startsWith('/setup') &&
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

  app.listen(env.port, () => {
    console.log(`MultiOutils server v${VERSION} — http://0.0.0.0:${env.port}`);
    console.log(`Données : ${env.dataDir}`);
  });
}

main();
