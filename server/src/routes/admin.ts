import { Router } from 'express';
import fs from 'node:fs';
import { createToken, listTokens, requireSession, revokeToken } from '../auth';
import { getDb } from '../db';
import { uploadsDir } from '../env';
import { e, layout } from '../html';
import { checkForUpdate, startUpdate, updateState } from '../update';
import { getMaxUploadMb, setMaxUploadMb, UPLOAD_CEILING_MB } from '../uploads';
import { VERSION } from '../version';

/** Administration : jetons d'API + mise à jour du site (docs/00 §7.2). */
export const adminRouter = Router();

// Ce routeur est monté à la racine (app.use(adminRouter)), donc on limite
// explicitement l'exigence de session aux chemins /admin. Sans ce préfixe,
// requireSession s'appliquait à TOUTES les routes (dont /setup et /login) et
// provoquait une boucle de redirection au premier lancement (ERR_TOO_MANY_REDIRECTS).
adminRouter.use('/admin', requireSession);

function storageStats(): { count: number; sizeMb: number } {
  const count = (
    getDb().prepare('SELECT COUNT(*) AS n FROM captures').get() as { n: number }
  ).n;
  let size = 0;
  try {
    for (const file of fs.readdirSync(uploadsDir)) {
      try {
        size += fs.statSync(`${uploadsDir}/${file}`).size;
      } catch {
        // fichier disparu entre-temps
      }
    }
  } catch {
    // dossier pas encore créé
  }
  return { count, sizeMb: Math.round((size / (1024 * 1024)) * 10) / 10 };
}

function adminPage(opts: {
  newToken?: { name: string; token: string };
  updateBlock?: string;
  uploadSaved?: boolean;
}): string {
  const tokens = listTokens();
  const stats = storageStats();
  const rows = tokens
    .map(
      (t) => `<tr>
        <td>${e(t.name ?? '—')}</td>
        <td class="muted">${e(t.created_at.slice(0, 16).replace('T', ' '))}</td>
        <td class="muted">${t.last_used_at ? e(t.last_used_at.slice(0, 16).replace('T', ' ')) : 'jamais'}</td>
        <td>${
          t.revoked
            ? '<span class="muted">révoqué</span>'
            : `<form method="post" action="/admin/tokens/${e(t.id)}/revoke"
                 onsubmit="return confirm('Révoquer ce jeton ? Les apps qui l\\'utilisent ne pourront plus envoyer.')">
                 <button class="btn btn-danger" type="submit">Révoquer</button></form>`
        }</td>
      </tr>`
    )
    .join('');

  return layout(
    'Administration',
    `<h1>Administration</h1>
    <p class="muted">Version installée : ${e(VERSION)} · ${stats.count} capture(s) · ${stats.sizeMb} Mo dans uploads/</p>

    <h2>Jetons d'API</h2>
    <p class="muted">Un jeton permet à une app MultiOutils d'envoyer des captures
    (Paramètres → Serveur distant). Il n'est affiché qu'une seule fois.</p>
    ${
      opts.newToken
        ? `<div class="token-new">
            <strong>Jeton « ${e(opts.newToken.name)} » créé — copie-le maintenant, il ne sera plus jamais affiché :</strong><br>
            <code>${e(opts.newToken.token)}</code>
          </div>`
        : ''
    }
    <form method="post" action="/admin/tokens" class="row-gap">
      <input type="text" name="name" placeholder="Nom (ex. PC bureau)" required>
      <button class="btn btn-primary" type="submit">Générer un jeton</button>
    </form>
    ${
      tokens.length > 0
        ? `<table><tr><th>Nom</th><th>Créé le</th><th>Dernier usage</th><th></th></tr>${rows}</table>`
        : ''
    }

    <h2>Taille maximale d'envoi</h2>
    <p class="muted">Limite appliquée aux captures et aux clips (texte, photo, fichier —
    PDF, docs, zip…) envoyés depuis l'app, l'iPhone/iPad ou le site. S'applique
    immédiatement, sans redémarrage.</p>
    ${opts.uploadSaved ? '<p class="ok">Limite enregistrée.</p>' : ''}
    <form method="post" action="/admin/settings/max-upload" class="row-gap">
      <input type="number" name="maxUploadMb" min="1" max="${UPLOAD_CEILING_MB}"
             value="${getMaxUploadMb()}" style="width:90px">
      <span class="muted">Mo (max ${UPLOAD_CEILING_MB} Mo)</span>
      <button class="btn btn-primary" type="submit">Enregistrer</button>
    </form>

    <h2>Mettre à jour le site</h2>
    <p class="muted">Exécute <code>git pull</code> + réinstallation + build, puis redémarre
    le service (dépôt public, aucune clé nécessaire — docs/02 §5.2).</p>
    ${opts.updateBlock ?? ''}
    <div class="row-gap">
      <form method="post" action="/admin/update/check">
        <button class="btn" type="submit">Vérifier</button>
      </form>
      <form method="post" action="/admin/update"
            onsubmit="return confirm('Mettre à jour le site maintenant ? Le service va redémarrer.')">
        <button class="btn btn-primary" type="submit">Mettre à jour le site</button>
      </form>
    </div>`,
    { nav: true, active: 'admin' }
  );
}

adminRouter.get('/admin', (_req, res) => {
  res.send(adminPage({}));
});

adminRouter.post('/admin/tokens', (req, res) => {
  const name = String((req.body as Record<string, string>).name ?? '').trim();
  void createToken(name).then(({ token }) => {
    res.send(adminPage({ newToken: { name, token } }));
  });
});

adminRouter.post('/admin/tokens/:id/revoke', (req, res) => {
  revokeToken(req.params.id);
  res.redirect('/admin');
});

// Compat contrat docs/04 §3 (DELETE)
adminRouter.delete('/admin/tokens/:id', (req, res) => {
  revokeToken(req.params.id);
  res.json({ revoked: true });
});

adminRouter.post('/admin/settings/max-upload', (req, res) => {
  const mb = Number((req.body as Record<string, string>).maxUploadMb);
  if (Number.isFinite(mb) && mb > 0) setMaxUploadMb(mb);
  res.send(adminPage({ uploadSaved: true }));
});

adminRouter.post('/admin/update/check', (_req, res) => {
  void checkForUpdate().then((check) => {
    const block = check.error
      ? `<p class="error">Vérification impossible : ${e(check.error)}</p>`
      : check.behind === 0
        ? '<p class="ok">Le site est à jour.</p>'
        : `<p class="ok">${check.behind} mise(s) à jour disponible(s).</p>`;
    res.send(adminPage({ updateBlock: block }));
  });
});

// Lance la mise à jour en ARRIÈRE-PLAN et redirige vers la page de suivi :
// la requête répond tout de suite (Cloudflare coupe au-delà de ~100 s alors
// que npm install + build durent plusieurs minutes).
adminRouter.post('/admin/update', (_req, res) => {
  startUpdate();
  res.redirect('/admin/update/status');
});

adminRouter.get('/admin/update/status', (_req, res) => {
  const s = updateState();
  const refresh = s.status === 'running' ? '<meta http-equiv="refresh" content="3">' : '';
  const headline =
    s.status === 'running'
      ? '<p class="ok">⏳ Mise à jour en cours… (la page se rafraîchit toute seule)</p>'
      : s.status === 'ok'
        ? `<p class="ok">✅ Mise à jour appliquée — le service redémarre.
           Recharge <a href="/admin">l'administration</a> dans ~10 secondes
           pour voir la nouvelle version.</p>`
        : s.status === 'failed'
          ? '<p class="error">❌ Échec de la mise à jour — le service continue sur la version actuelle. Détail ci-dessous.</p>'
          : '<p class="muted">Aucune mise à jour en cours.</p>';
  res.send(
    layout(
      'Mise à jour',
      `${refresh}
      <p><a href="/admin">← Administration</a></p>
      <h1>Mise à jour du site</h1>
      ${headline}
      ${s.log ? `<pre class="log">${e(s.log)}</pre>` : ''}
      ${
        s.status === 'failed'
          ? `<form method="post" action="/admin/update"><button class="btn btn-primary" type="submit">Réessayer</button></form>`
          : ''
      }`,
      { nav: true, active: 'admin' }
    )
  );
});
