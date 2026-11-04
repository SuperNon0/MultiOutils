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
import { dateFr, e, ic, layout } from '../html';
import { checkForUpdate, startUpdate, updateState } from '../update';
import { getMaxUploadMb, setMaxUploadMb, UPLOAD_CEILING_MB } from '../uploads';
import { VERSION } from '../version';

/** Réglages / administration : apparence, accès, jetons d'API, mise à jour (docs/00 §7.2). */
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

/** Panneaux des réglages (l'ancre #… de l'adresse ouvre le bon). */
type Panneau = 'apparence' | 'acces' | 'motdepasse' | 'jetons' | 'envois' | 'maj' | 'sensible';
const PANNEAUX: Panneau[] = ['apparence', 'acces', 'motdepasse', 'jetons', 'envois', 'maj', 'sensible'];

/** Message dans un panneau : réussite, erreur ou information. */
function avis(ton: 'ok' | 'err' | 'info', texte: string): string {
  const icone = ton === 'ok' ? 'check' : ton === 'err' ? 'alert' : 'info';
  return `<p class="avis ${ton}" role="${ton === 'err' ? 'alert' : 'status'}">${ic(icone, 's18')}<span>${texte}</span></p>`;
}

function adminPage(opts: {
  newToken?: { name: string; token: string };
  updateBlock?: string;
  uploadSaved?: boolean;
  cf?: { team: string; aud: string; verify: boolean; allowLocal: boolean };
  cfSaved?: boolean;
  test?: CfAttempt;
  pwMessage?: { ok: boolean; text: string };
  panneau?: Panneau;
}): string {
  const tokens = listTokens();
  const stats = storageStats();
  const stored = getCfConfig();
  const storedAllow = allowLocalLogin();
  const cf = opts.cf ?? {
    team: stored.team,
    aud: stored.aud,
    verify: stored.verify,
    allowLocal: storedAllow
  };

  // Panneau ouvert d'office (après un envoi de formulaire).
  const ouvert: Panneau | undefined =
    opts.panneau ??
    (opts.newToken
      ? 'jetons'
      : opts.uploadSaved
        ? 'envois'
        : opts.cfSaved || opts.test
          ? 'acces'
          : opts.pwMessage
            ? 'motdepasse'
            : opts.updateBlock
              ? 'maj'
              : undefined);
  const montre: Panneau = ouvert ?? 'apparence';
  const panneau = (id: Panneau, icone: string, titre: string, intro: string, corps: string): string =>
    `<section class="carte reg-panneau" id="p-${id}" data-panneau="${id}"${id === montre ? '' : ' hidden'}>
      <h2>${ic(icone, id === 'sensible' ? 's22 dan' : 's22 acc')}${titre}</h2>
      <p class="intro">${intro}</p>
      ${corps}
    </section>`;

  const li = (id: Panneau, icone: string, titre: string, sous: string, extra = ''): string =>
    `<a class="li${id === montre ? ' on' : ''}${extra}" href="#${id}" data-reg="${id}"><span class="li-ic${
      id === 'apparence' ? ' acc' : ''
    }">${ic(icone)}</span><span class="tx">${titre}<small>${sous}</small></span>${ic('chev', 's18 muted')}</a>`;

  const actifs = tokens.filter((t) => !t.revoked).length;

  // ── Résultat du test Cloudflare ──
  const testBlock = ((): string => {
    if (!opts.test) return `<p class="muted petit">Clique sur « Tester » pour vérifier la connexion.</p>`;
    const t = opts.test;
    const oui = (txt: string): string => `<span class="badge ok">${txt}</span>`;
    const non = (txt: string): string => `<span class="badge non">${txt}</span>`;
    const jeton = t.tokenPresent ? oui('Oui') : non('Non');
    const jwt = !t.verify ? non('Désactivée') : t.ok ? oui('Réussie') : non('Échec');
    return `<div class="reg-l"><div class="tx"><b>Jeton Cloudflare reçu</b></div>${jeton}</div>
      <div class="reg-l"><div class="tx"><b>En-tête e-mail</b><span>${t.headerEmail ? e(t.headerEmail) : 'Aucun'}</span></div></div>
      <div class="reg-l"><div class="tx"><b>Équipe / AUD</b><span class="mono">${e(cf.team) || '—'} / ${e(cf.aud) || '—'}</span></div></div>
      <div class="reg-l"><div class="tx"><b>Vérification JWT</b></div>${jwt}</div>
      <div class="reg-l"><div class="tx"><b>E-mail du jeton</b><span>${t.email ? e(t.email) : 'Aucun'}</span></div></div>
      ${!t.ok ? avis('err', e(t.detail)) : ''}`;
  })();

  // ── Jetons ──
  const tokenRows = tokens
    .map(
      (t) => `<div class="li jeton${t.revoked ? ' revoque' : ''}">
        <span class="li-ic">${ic('key', 's18')}</span>
        <span class="tx">${e(t.name ?? 'Sans nom')}<small>Créé le ${dateFr(t.created_at)} · ${
          t.last_used_at ? `dernier usage le ${dateFr(t.last_used_at)}` : 'jamais utilisé'
        }</small></span>
        ${
          t.revoked
            ? '<span class="badge">Révoqué</span>'
            : `<form method="post" action="/admin/tokens/${e(t.id)}/revoke"
                 data-confirmer="Les apps qui l'utilisent ne pourront plus envoyer de captures."
                 data-titre="Révoquer ce jeton ?" data-ok="Révoquer" data-danger>
                 <button class="btn xs dn" type="submit">Révoquer</button></form>`
        }
      </div>`
    )
    .join('');

  const hiddenAllow = storedAllow ? '<input type="hidden" name="allowlocal" value="1">' : '';

  const panneaux = [
    panneau(
      'apparence',
      'palette',
      'Apparence',
      "La couleur et le thème s'enregistrent tout de suite, sur cet appareil.",
      `<div class="reg-sec">
        <div class="lbl-mono">Couleur d'accent</div>
        <div class="pastilles" data-encre-accent role="radiogroup" aria-label="Couleur d'accent">
          <button type="button" class="past" data-v="or" role="radio"><i></i>Or</button>
          <button type="button" class="past" data-v="ambre" role="radio"><i></i>Ambre</button>
          <button type="button" class="past" data-v="corail" role="radio"><i></i>Corail</button>
          <button type="button" class="past" data-v="menthe" role="radio"><i></i>Menthe</button>
          <button type="button" class="past" data-v="lavande" role="radio"><i></i>Lavande</button>
        </div>
      </div>
      <div class="reg-sec">
        <div class="lbl-mono">Thème</div>
        <div class="seg" data-encre-theme role="group" aria-label="Thème">
          <button type="button" data-v="auto">Automatique</button><button type="button" data-v="clair">Clair</button><button type="button" data-v="sombre">Sombre</button>
        </div>
      </div>`
    ),
    panneau(
      'acces',
      'shield',
      'Accès Cloudflare',
      "L'entrée normale du site passe par Cloudflare Access. Ces valeurs se modifient sans redémarrer.",
      `${opts.cfSaved ? avis('ok', 'Configuration enregistrée.') : ''}
      <form method="post" class="form" data-occupe>
        <label><span class="lbl">Équipe (nom seul, ex. super-nono)</span>
          <input class="input" type="text" name="team" value="${e(cf.team)}" placeholder="super-nono" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
        <label><span class="lbl">AUD (Application Audience Tag)</span>
          <input class="input" type="text" name="aud" value="${e(cf.aud)}" placeholder="Tag AUD de l'application Access" autocomplete="off" spellcheck="false"></label>
        <label class="reg-l"><span class="tx"><b>Vérifier le JWT Cloudflare <button type="button" class="q" aria-label="Explication" data-t="Vérification JWT" data-d="Le site contrôle la signature du badge envoyé par Cloudflare. Recommandé en production.">?</button></b><span>Recommandé en production</span></span>
          <input type="checkbox" class="sw" name="verify" value="1" ${cf.verify ? 'checked' : ''}></label>
        ${hiddenAllow}
        <div class="ligne">
          <button class="btn" type="submit" formaction="/admin/cloudflare/test">${ic('zap', 's18')}Tester</button>
          <button class="btn pri" type="submit" formaction="/admin/cloudflare">${ic('check', 's18')}Enregistrer</button>
        </div>
      </form>
      <div class="reg-sec">
        <div class="lbl-mono">Résultat du test</div>
        ${testBlock}
        <p class="muted petit aide-test">« Non » = aucun badge reçu (tu n'es pas derrière Cloudflare). Erreur « audience » → l'AUD ne correspond pas à l'app Access. Erreur « …cloudflareaccess.com… » → mets le <b>nom seul</b> dans Équipe.</p>
      </div>`
    ),
    panneau(
      'motdepasse',
      'lock',
      'Mot de passe de secours',
      `Sert uniquement si Cloudflare est indisponible. ${
        isLocalPasswordSet() ? 'Un mot de passe est défini.' : "Aucun mot de passe défini pour l'instant."
      }`,
      `<p class="bandeau-c">${ic('alert', 's18')}<span>En cas d'oubli, utilise le script <code>deploy/reset_admin.sh</code> sur le serveur.</span></p>
      ${opts.pwMessage ? avis(opts.pwMessage.ok ? 'ok' : 'err', e(opts.pwMessage.text)) : ''}
      <form method="post" action="/admin/password" class="form reg-sec" data-occupe>
        ${isLocalPasswordSet() ? `<label><span class="lbl">Mot de passe actuel</span><input class="input" type="password" name="current" autocomplete="current-password"></label>` : ''}
        <label><span class="lbl">Nouveau mot de passe</span><input class="input" type="password" name="password" autocomplete="new-password" minlength="8"></label>
        <label><span class="lbl">Confirmer</span><input class="input" type="password" name="confirm" autocomplete="new-password" minlength="8"></label>
        <div><button class="btn pri" type="submit">${ic('key', 's18')}Changer le mot de passe</button></div>
      </form>`
    ),
    panneau(
      'jetons',
      'key',
      "Jetons d'API",
      "Un jeton permet à une app MultiOutils d'envoyer des captures (Paramètres → Serveur distant). Il n'est affiché qu'une seule fois.",
      `${
        opts.newToken
          ? `<div class="jeton-neuf">
              <p class="bandeau-c">${ic('alert', 's18')}<span>Jeton « ${e(opts.newToken.name)} » créé : copie-le maintenant, il ne sera plus jamais affiché.</span></p>
              <div class="copie"><code>${e(opts.newToken.token)}</code><button type="button" class="btn sm" data-copier="${e(opts.newToken.token)}">${ic('copy', 's16')}Copier</button></div>
            </div>`
          : ''
      }
      <form method="post" action="/admin/tokens" class="ligne reg-sec" data-occupe>
        <input class="input" type="text" name="name" placeholder="Nom (ex. PC bureau)" aria-label="Nom du jeton" required>
        <button class="btn pri" type="submit">${ic('plus', 's18')}Générer un jeton</button>
      </form>
      ${
        tokens.length > 0
          ? `<div class="reg-sec"><div class="lbl-mono">${tokens.length} jeton${tokens.length > 1 ? 's' : ''}</div><div class="liste-r">${tokenRows}</div></div>`
          : `<div class="vide">${ic('key')}<b>Aucun jeton</b><span>Génère-en un pour relier le logiciel au serveur.</span></div>`
      }`
    ),
    panneau(
      'envois',
      'upload',
      "Taille maximale d'envoi",
      "Limite appliquée aux captures et aux clips (texte, photo, fichier — PDF, docs, zip…) envoyés depuis l'app, l'iPhone/iPad ou le site. S'applique immédiatement, sans redémarrage.",
      `${opts.uploadSaved ? avis('ok', 'Limite enregistrée.') : ''}
      <form method="post" action="/admin/settings/max-upload" class="row-inline" data-occupe>
        <label><span class="lbl">Limite en Mo (max ${UPLOAD_CEILING_MB})</span>
          <input class="input small-input" type="number" name="maxUploadMb" min="1" max="${UPLOAD_CEILING_MB}" value="${getMaxUploadMb()}"></label>
        <button class="btn pri" type="submit">${ic('check', 's18')}Enregistrer</button>
      </form>`
    ),
    panneau(
      'maj',
      'refresh',
      'Mise à jour du site',
      `Version installée : <b class="mono">${e(VERSION)}</b>. Exécute <code>git pull</code>, la réinstallation et le build, puis redémarre le service (dépôt public, aucune clé nécessaire).`,
      `${opts.updateBlock ?? ''}
      <div class="ligne">
        <form method="post" action="/admin/update/check" data-occupe>
          <button class="btn" type="submit">${ic('search', 's18')}Vérifier</button>
        </form>
        <form method="post" action="/admin/update"
              data-confirmer="Le service va redémarrer : le site sera indisponible quelques instants."
              data-titre="Mettre à jour le site ?" data-ok="Mettre à jour">
          <button class="btn pri" type="submit">${ic('download', 's18')}Mettre à jour le site</button>
        </form>
      </div>
      <div class="tuiles reg-sec">
        <div class="tuile"><div class="k">${ic('grid', 's16')}Captures</div><div class="v">${stats.count}</div></div>
        <div class="tuile"><div class="k">${ic('cloud', 's16')}Stockage</div><div class="v">${String(stats.sizeMb).replace('.', ',')}<small>Mo</small></div><div class="s">dans uploads/</div></div>
      </div>`
    ),
    panneau(
      'sensible',
      'alert',
      'Zone sensible',
      "Les réglages qui peuvent t'empêcher d'entrer sur le site.",
      `<div class="zone-d">
        <h3>${ic('lock', 's18')}Accès local (secours)</h3>
        <p>Décoché = accès <b>uniquement via Cloudflare</b> : tout accès direct (sans badge) est refusé. Ne le décoche que si l'origine est bien injoignable hors Cloudflare, sinon tu risques de te verrouiller dehors.</p>
        <form method="post" action="/admin/cloudflare" class="form-sensible" data-occupe data-sensible>
          <input type="hidden" name="team" value="${e(stored.team)}">
          <input type="hidden" name="aud" value="${e(stored.aud)}">
          ${stored.verify ? '<input type="hidden" name="verify" value="1">' : ''}
          <input type="hidden" name="panneau" value="sensible">
          <label class="reg-l"><span class="tx"><b>Autoriser l'accès local</b><span>Mot de passe sur le réseau domestique</span></span>
            <input type="checkbox" class="sw" name="allowlocal" value="1" ${storedAllow ? 'checked' : ''}></label>
          <button class="btn dn sm" type="submit">${ic('check', 's16')}Enregistrer</button>
        </form>
      </div>`
    )
  ].join('');

  return layout(
    'Réglages',
    `<div class="page-h"><h1 class="page-t">Réglages</h1></div>
    <div class="reglages${ouvert ? ' detail' : ''}" id="reglages" data-ouvert="${ouvert ?? ''}">
      <div class="reg-liste">
        <div>
          <div class="reg-g">Cet appareil</div>
          <div class="liste-r">
            ${li('apparence', 'palette', 'Apparence', "Couleur d'accent, thème")}
          </div>
        </div>
        <div>
          <div class="reg-g">Accès</div>
          <div class="liste-r">
            ${li('acces', 'shield', 'Accès Cloudflare', cf.team ? `Équipe ${e(cf.team)}` : 'Équipe et AUD')}
            ${li('motdepasse', 'lock', 'Mot de passe de secours', isLocalPasswordSet() ? 'Défini' : 'Non défini')}
            ${li('jetons', 'key', "Jetons d'API", `${actifs} actif${actifs > 1 ? 's' : ''}`)}
          </div>
        </div>
        <div>
          <div class="reg-g">Site</div>
          <div class="liste-r">
            ${li('envois', 'upload', "Taille maximale d'envoi", `${getMaxUploadMb()} Mo`)}
            ${li('maj', 'refresh', 'Mise à jour', `Version ${e(VERSION)} · ${stats.count} capture${stats.count > 1 ? 's' : ''}`)}
          </div>
        </div>
        <div>
          <div class="liste-r">
            ${li('sensible', 'alert', 'Zone sensible', storedAllow ? 'Accès local autorisé' : 'Cloudflare uniquement', ' dn')}
          </div>
        </div>
      </div>
      <div class="reg-det">
        <a class="btn sm gh reg-retour" href="#liste">${ic('chevl', 's18')}Réglages</a>
        ${panneaux}
      </div>
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
  res.redirect('/admin#jetons');
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
  const panneau = PANNEAUX.includes(b.panneau as Panneau) ? (b.panneau as Panneau) : undefined;
  res.send(adminPage({ cfSaved: true, panneau }));
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

// Ancien lien /reglages → tout est désormais dans Réglages (/admin).
adminRouter.get('/reglages', gateway, (_req, res) => res.redirect('/admin'));

adminRouter.post('/admin/update/check', (_req, res) => {
  void checkForUpdate().then((check) => {
    const block = check.error
      ? avis('err', `Vérification impossible : ${e(check.error)}`)
      : check.behind === 0
        ? avis('ok', 'Le site est à jour.')
        : avis('info', `${check.behind} mise${check.behind === 1 ? '' : 's'} à jour disponible${check.behind === 1 ? '' : 's'}.`);
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
      ? `<div class="etat-maj">
          <div class="access-icon acc">${ic('spin', 'tourne')}</div>
          <div><b>Mise à jour en cours…</b><span>La page se rafraîchit toute seule.</span></div>
        </div>`
      : s.status === 'ok'
        ? `<div class="etat-maj">
            <div class="access-icon ok">${ic('check')}</div>
            <div><b>Mise à jour appliquée</b><span>Le service redémarre. Recharge <a href="/admin#maj">les réglages</a> dans une dizaine de secondes pour voir la nouvelle version.</span></div>
          </div>`
        : s.status === 'failed'
          ? `<div class="etat-maj">
              <div class="access-icon err">${ic('alert')}</div>
              <div><b>Échec de la mise à jour</b><span>Le service continue sur la version actuelle. Détail ci-dessous.</span></div>
            </div>`
          : `<div class="etat-maj">
              <div class="access-icon">${ic('clock')}</div>
              <div><b>Aucune mise à jour en cours</b><span>Lance-la depuis Réglages → Mise à jour.</span></div>
            </div>`;
  res.send(
    layout(
      'Mise à jour',
      `<a class="btn sm gh retour" href="/admin#maj">${ic('chevl', 's18')}Réglages</a>
      <div class="page-h"><h1 class="page-t">Mise à jour du site</h1></div>
      <div class="carte bloc-maj">
        ${headline}
        ${s.status === 'running' ? '<div class="pg acc"><i class="pg-indet"></i></div>' : ''}
        ${s.log ? `<pre class="bloc-code log">${e(s.log)}</pre>` : ''}
        ${
          s.status === 'failed'
            ? `<form method="post" action="/admin/update" data-occupe><button class="btn pri" type="submit">${ic('refresh', 's18')}Réessayer</button></form>`
            : ''
        }
      </div>`,
      { nav: true, active: 'admin', head: refresh }
    )
  );
});
