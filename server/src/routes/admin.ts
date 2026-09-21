import { Router } from 'express';
import fs from 'node:fs';
import { createToken, listTokens, revokeToken } from '../auth';
import {
  allowLocalLogin,
  gateway,
  getCfConfig,
  isLocalPasswordSet,
  setAllowLocalLogin,
  setCfConfig,
  setLocalPassword,
  verifyLocalPassword
} from '../security';
import { describeCfAttempt, type CfAttempt } from '../cloudflareAccess';
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
adminRouter.use('/admin', gateway);

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
  cf?: { team: string; aud: string; verify: boolean; allowLocal: boolean };
  cfSaved?: boolean;
  test?: CfAttempt;
  pwMessage?: { ok: boolean; text: string };
}): string {
  const tokens = listTokens();
  const stats = storageStats();
  const stored = getCfConfig();
  const cf = opts.cf ?? {
    team: stored.team,
    aud: stored.aud,
    verify: stored.verify,
    allowLocal: allowLocalLogin()
  };
  const testBlock = ((): string => {
    if (!opts.test) return `<p class="muted">Clique sur « Tester » pour vérifier la connexion.</p>`;
    const t = opts.test;
    const jeton = t.tokenPresent
      ? '<span class="pill pill-yes">OUI</span>'
      : '<span class="pill pill-no">NON</span>';
    const jwt = !t.verify
      ? '<span class="pill pill-no">désactivée</span>'
      : t.ok
        ? '<span class="pill pill-ok">OK ✓</span>'
        : '<span class="pill pill-no">échec</span>';
    return `
      <div class="tr"><span class="k">Jeton Cloudflare reçu</span>${jeton}</div>
      <div class="tr"><span class="k">En-tête e-mail</span><span class="v">${t.headerEmail ? e(t.headerEmail) : '—'}</span></div>
      <div class="tr stack"><span class="k">Équipe / AUD</span><span class="v">${e(cf.team) || '—'} / ${e(cf.aud) || '—'}</span></div>
      <div class="tr"><span class="k">Vérification JWT</span>${jwt}</div>
      <div class="tr"><span class="k">E-mail du jeton</span><span class="v">${t.email ? e(t.email) : '—'}</span></div>
      ${!t.ok ? `<p class="help-note">${e(t.detail)}</p>` : ''}`;
  })();
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

    <section class="card settings-card">
      <h2 class="settings-title">Cloudflare <span class="settings-sub">/ Accès</span></h2>
      ${opts.cfSaved ? '<p class="ok">Configuration enregistrée.</p>' : ''}
      <form method="post">
        <label class="field"><span class="field-label">Équipe (nom seul, ex. super-nono)</span>
          <input type="text" name="team" value="${e(cf.team)}" placeholder="super-nono" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span class="field-label">AUD (Application Audience Tag)</span>
          <input type="text" name="aud" value="${e(cf.aud)}" placeholder="tag AUD de l'application Access" autocomplete="off" spellcheck="false"></label>
        <label class="check-row"><input type="checkbox" name="verify" value="1" ${cf.verify ? 'checked' : ''}>
          <span>Vérifier le JWT Cloudflare (recommandé en production)</span></label>
        <label class="check-row"><input type="checkbox" name="allowlocal" value="1" ${cf.allowLocal ? 'checked' : ''}>
          <span>Autoriser l'accès local (mot de passe LAN / secours)</span></label>
        <p class="warn-note">⚠️ Décoché = accès <b>uniquement via Cloudflare</b> : tout accès direct (sans badge) est refusé (403). Ne le décoche que si l'origine est bien injoignable hors Cloudflare, sinon tu risques de te verrouiller dehors.</p>
        <div class="row-gap">
          <button class="btn" type="submit" formaction="/admin/cloudflare/test">Tester</button>
          <button class="btn btn-primary" type="submit" formaction="/admin/cloudflare">Enregistrer</button>
        </div>
      </form>
      <div class="section-label">Résultat du test</div>
      ${testBlock}
      <p class="help-note">« NON » = aucun badge reçu (tu n'es pas derrière Cloudflare). Erreur « audience » → l'AUD ne correspond pas à l'app Access. Erreur « …cloudflareaccess.com… » → mets le <b>nom seul</b> dans Équipe.</p>
    </section>

    <section class="card settings-card">
      <h2 class="settings-title">Mot de passe de secours</h2>
      <p class="muted">Sert uniquement si Cloudflare est indisponible. ${isLocalPasswordSet() ? 'Un mot de passe est défini.' : 'Aucun mot de passe défini pour l’instant.'}</p>
      <p class="warn-note">⚠️ En cas d'oubli du mot de passe, utilise le script <code>deploy/reset_admin.sh</code> sur le serveur.</p>
      ${opts.pwMessage ? `<p class="${opts.pwMessage.ok ? 'ok' : 'error'}">${e(opts.pwMessage.text)}</p>` : ''}
      <form method="post" action="/admin/password">
        ${isLocalPasswordSet() ? `<label class="field"><span class="field-label">Mot de passe actuel</span><input type="password" name="current" autocomplete="current-password"></label>` : ''}
        <label class="field"><span class="field-label">Nouveau mot de passe</span><input type="password" name="password" autocomplete="new-password" minlength="8"></label>
        <label class="field"><span class="field-label">Confirmer</span><input type="password" name="confirm" autocomplete="new-password" minlength="8"></label>
        <button class="btn btn-primary" type="submit">Changer le mot de passe</button>
      </form>
    </section>

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

// ── Cloudflare / Accès + mot de passe de secours (réglages intégrés) ─────────

adminRouter.post('/admin/cloudflare', (req, res) => {
  const b = req.body as Record<string, string>;
  const team = (b.team ?? '').trim();
  const aud = (b.aud ?? '').trim();
  const verify = b.verify === '1';
  setCfConfig({ team, aud, verify });
  setAllowLocalLogin(b.allowlocal === '1');
  res.send(adminPage({ cfSaved: true }));
});

// « Tester » : vérifie avec les valeurs SAISIES (non enregistrées) sur CETTE requête.
adminRouter.post('/admin/cloudflare/test', (req, res) => {
  const b = req.body as Record<string, string>;
  const team = (b.team ?? '').trim();
  const aud = (b.aud ?? '').trim();
  const verify = b.verify === '1';
  const allowLocal = b.allowlocal === '1';
  void describeCfAttempt(req, { team, aud, verify }).then((test) => {
    res.send(adminPage({ cf: { team, aud, verify, allowLocal }, test }));
  });
});

adminRouter.post('/admin/password', (req, res) => {
  const b = req.body as Record<string, string>;
  const password = b.password ?? '';
  const confirm = b.confirm ?? '';
  const current = b.current ?? '';
  const render = (ok: boolean, text: string): void => {
    res.send(adminPage({ pwMessage: { ok, text } }));
  };
  if (password.length < 8) {
    render(false, 'Le nouveau mot de passe doit faire au moins 8 caractères.');
    return;
  }
  if (password !== confirm) {
    render(false, 'La confirmation ne correspond pas.');
    return;
  }
  void (async (): Promise<void> => {
    if (isLocalPasswordSet()) {
      const ok = await verifyLocalPassword(current);
      if (!ok) {
        render(false, 'Mot de passe actuel incorrect.');
        return;
      }
    }
    await setLocalPassword(password);
    render(true, 'Mot de passe de secours mis à jour.');
  })();
});

// Ancien lien /reglages → tout est désormais dans Administration.
adminRouter.get('/reglages', gateway, (_req, res) => res.redirect('/admin'));

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
