import { Router } from 'express';
import { describeCfAttempt, type CfAttempt } from '../cloudflareAccess';
import { e, socleLayout } from '../html';
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

/**
 * Écran de RÉGLAGES intégré au site (thème partagé du socle) : config
 * Cloudflare (équipe + AUD + vérif) et mot de passe de secours local.
 * Protégé par le portail humain (`gateway`).
 */
export const reglagesRouter = Router();

interface PageState {
  team: string;
  aud: string;
  verify: boolean;
  allowLocal: boolean;
  cfSaved?: boolean;
  pwMessage?: { ok: boolean; text: string };
  test?: CfAttempt;
}

function testBlock(test: CfAttempt): string {
  const line = (label: string, value: string): string =>
    `<div class="test-line"><span class="muted">${e(label)}</span> ${value}</div>`;
  const yes = '<span class="accent">oui</span>';
  const no = '<span class="muted">non</span>';
  return `<div class="fl-card ${test.ok ? 'test-ok' : 'test-ko'}" style="margin-top:12px">
    <b>${test.ok ? '✅ Vérification réussie' : '❌ Vérification échouée'}</b>
    ${line('Jeton reçu :', test.tokenPresent ? `${yes} (${e(test.tokenSource ?? '?')})` : no)}
    ${line('En-tête e-mail :', test.headerEmail ? e(test.headerEmail) : no)}
    ${line('Vérif JWT :', test.verify ? 'activée' : '<b>désactivée (dev)</b>')}
    ${line('E-mail vérifié :', test.email ? e(test.email) : '—')}
    ${line('Détail :', e(test.detail))}
  </div>`;
}

function reglagesPage(state: PageState): string {
  return socleLayout(
    'Réglages',
    `<main class="page" style="max-width:760px;margin:0 auto;padding:24px 16px">
      <h1 class="fl-title-serif">Réglages</h1>

      <section class="fl-card" style="margin-top:16px">
        <h2 class="fl-title-serif">Accès Cloudflare</h2>
        <p class="access-text">Le badge Cloudflare est vérifié côté serveur
        (JWT RS256 + AUD + issuer). « Tester » essaie la vérification avec les
        valeurs saisies sur CETTE requête, sans enregistrer.</p>
        ${state.cfSaved ? '<div class="flash success">Configuration Cloudflare enregistrée.</div>' : ''}
        <form method="post">
          <label class="fl-label">Équipe Cloudflare
            <input class="fl-input" type="text" name="team" value="${e(state.team)}"
                   placeholder="ex. super-nono" autocapitalize="off" autocomplete="off">
          </label>
          <label class="fl-label">AUD (Application Audience)
            <input class="fl-input" type="text" name="aud" value="${e(state.aud)}"
                   placeholder="tag AUD de l'application Access" autocomplete="off">
          </label>
          <label class="fl-check">
            <input type="checkbox" name="verify" value="1" ${state.verify ? 'checked' : ''}>
            Vérifier le JWT (obligatoire en production ; décocher = dev local, on
            fait confiance à l'en-tête e-mail)
          </label>
          <label class="fl-check">
            <input type="checkbox" name="allowlocal" value="1" ${state.allowLocal ? 'checked' : ''}>
            Autoriser l'accès local (mot de passe LAN / secours)
          </label>
          <p class="access-note" style="margin-top:8px">⚠️ Décoché = accès
          <b>uniquement via Cloudflare</b> : tout accès direct (sans badge) est
          refusé (403). Ne le décoche que si l'origine est bien injoignable hors
          Cloudflare, sinon tu risques de te verrouiller dehors.</p>
          <div class="row-gap" style="margin-top:12px">
            <button class="btn" type="submit" formaction="/reglages/tester">Tester</button>
            <button class="btn primary" type="submit" formaction="/reglages/cloudflare">Enregistrer</button>
          </div>
        </form>
        ${state.test ? testBlock(state.test) : ''}
      </section>

      <section class="fl-card" style="margin-top:16px">
        <h2 class="fl-title-serif">Mot de passe de secours local</h2>
        <p class="access-text">Sert uniquement si Cloudflare est indisponible.
        ${isLocalPasswordSet() ? 'Un mot de passe est déjà défini.' : 'Aucun mot de passe défini pour l’instant.'}</p>
        ${
          state.pwMessage
            ? `<div class="flash ${state.pwMessage.ok ? 'success' : 'error'}">${e(state.pwMessage.text)}</div>`
            : ''
        }
        <form method="post" action="/reglages/mot-de-passe">
          ${
            isLocalPasswordSet()
              ? `<label class="fl-label">Mot de passe actuel
                   <input class="fl-input" type="password" name="current" autocomplete="current-password">
                 </label>`
              : ''
          }
          <label class="fl-label">Nouveau mot de passe
            <input class="fl-input" type="password" name="password" autocomplete="new-password" minlength="8">
          </label>
          <label class="fl-label">Confirmer
            <input class="fl-input" type="password" name="confirm" autocomplete="new-password" minlength="8">
          </label>
          <button class="btn primary" type="submit" style="margin-top:12px">Changer le mot de passe</button>
        </form>
      </section>
    </main>`,
    { topbar: true }
  );
}

reglagesRouter.get('/reglages', gateway, (_req, res) => {
  const cfg = getCfConfig();
  res.send(
    reglagesPage({ team: cfg.team, aud: cfg.aud, verify: cfg.verify, allowLocal: allowLocalLogin() })
  );
});

// « Tester » : tente la vérif avec les valeurs SAISIES (non enregistrées).
reglagesRouter.post('/reglages/tester', gateway, (req, res) => {
  const body = req.body as Record<string, string>;
  const team = (body.team ?? '').trim();
  const aud = (body.aud ?? '').trim();
  const verify = body.verify === '1';
  const allowLocal = body.allowlocal === '1';
  void describeCfAttempt(req, { team, aud, verify }).then((test) => {
    res.send(reglagesPage({ team, aud, verify, allowLocal, test }));
  });
});

reglagesRouter.post('/reglages/cloudflare', gateway, (req, res) => {
  const body = req.body as Record<string, string>;
  const team = (body.team ?? '').trim();
  const aud = (body.aud ?? '').trim();
  const verify = body.verify === '1';
  setCfConfig({ team, aud, verify });
  setAllowLocalLogin(body.allowlocal === '1');
  const cfg = getCfConfig();
  res.send(
    reglagesPage({
      team: cfg.team,
      aud: cfg.aud,
      verify: cfg.verify,
      allowLocal: allowLocalLogin(),
      cfSaved: true
    })
  );
});

reglagesRouter.post('/reglages/mot-de-passe', gateway, (req, res) => {
  const body = req.body as Record<string, string>;
  const password = body.password ?? '';
  const confirm = body.confirm ?? '';
  const current = body.current ?? '';
  const cfg = getCfConfig();
  const render = (ok: boolean, text: string): void => {
    res.send(
      reglagesPage({
        team: cfg.team,
        aud: cfg.aud,
        verify: cfg.verify,
        allowLocal: allowLocalLogin(),
        pwMessage: { ok, text }
      })
    );
  };

  if (password.length < 8) {
    render(false, 'Le nouveau mot de passe doit faire au moins 8 caractères.');
    return;
  }
  if (password !== confirm) {
    render(false, 'La confirmation ne correspond pas.');
    return;
  }
  const proceed = async (): Promise<void> => {
    // Si un mot de passe existe déjà, exiger l'actuel (formulaire authentifié
    // mais l'entrée peut venir de Cloudflare, sans connaître le mot de passe).
    if (isLocalPasswordSet()) {
      const ok = await verifyLocalPassword(current);
      if (!ok) {
        render(false, 'Mot de passe actuel incorrect.');
        return;
      }
    }
    await setLocalPassword(password);
    render(true, 'Mot de passe de secours mis à jour.');
  };
  void proceed();
});
