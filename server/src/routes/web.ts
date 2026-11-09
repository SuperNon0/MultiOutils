import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { requireSessionOrToken } from '../auth';
import {
  gateway,
  isLocalPasswordSet,
  requireLocalLoginEnabled,
  setLocalPassword,
  verifyLocalPassword
} from '../security';
import { getDb, parseTags, type ServerCapture, type ServerClip } from '../db';
import { uploadsDir } from '../env';
import {
  dateFr,
  e,
  errorBlock,
  filtersBlock,
  ic,
  layout,
  loginLogo,
  selectField,
  socleLayout
} from '../html';
import { getMaxUploadMb, rejectIfTooLarge, UPLOAD_CEILING_MB } from '../uploads';
import {
  ALLOWED_MIME,
  insertFileClip,
  insertImageClip,
  insertTextClip,
  organizeClip,
  queryCaptures
} from './api';

/** Interface web de consultation (docs/00 §7.1). Auth : session. */
export const webRouter = Router();

// ── Connexion & secours local ───────────────────────────────────────────
// Identité normale = badge Cloudflare (voir security.ts / gateway). Le mot de
// passe local est un SECOURS : un seul champ, aucun identifiant. Écrans au
// design « encre » (login-page / login-card).

/** Page de connexion locale (secours). */
function loginPage(failed: boolean): string {
  return socleLayout(
    'Connexion locale',
    `<div class="login-card">
      ${loginLogo()}
      <span class="badge">Accès local</span>
      <h1 class="h-acces">Connexion</h1>
      ${failed ? `<p class="login-error" role="alert">Mot de passe incorrect.</p>` : ''}
      <form method="post" action="/login" data-occupe>
        <input type="password" name="password" placeholder="Mot de passe" aria-label="Mot de passe" autofocus autocomplete="current-password">
        <button type="submit" class="btn pri w">${ic('lock', 's18')}Se connecter</button>
      </form>
      <a class="forgot-link" href="/oubli">Mot de passe oublié ?</a>
      <p class="access-note">Accès local (réseau domestique) · secours si Cloudflare est indisponible</p>
    </div>`
  );
}

/** Première configuration : définir le mot de passe de SECOURS local. */
function setupPage(error?: string): string {
  return socleLayout(
    'Première configuration',
    `<div class="login-card">
      ${loginLogo()}
      <span class="badge">Première configuration</span>
      <h1 class="h-acces">Mot de passe de secours</h1>
      <p class="access-text">Définis un mot de passe local (secours si Cloudflare
      tombe). L'entrée normale, elle, passe par Cloudflare.</p>
      ${error ? `<p class="login-error" role="alert">${e(error)}</p>` : ''}
      <form method="post" action="/setup" data-occupe>
        <input type="password" name="password" placeholder="Mot de passe (8 caractères ou plus)" aria-label="Mot de passe" autofocus autocomplete="new-password" minlength="8">
        <input type="password" name="confirm" placeholder="Confirmer le mot de passe" aria-label="Confirmer le mot de passe" autocomplete="new-password" minlength="8">
        <button type="submit" class="btn pri w">${ic('check', 's18')}Enregistrer</button>
      </form>
    </div>`
  );
}

webRouter.get('/setup', requireLocalLoginEnabled, (_req, res) => {
  if (isLocalPasswordSet()) {
    res.redirect('/login');
    return;
  }
  res.send(setupPage());
});

webRouter.post('/setup', requireLocalLoginEnabled, (req, res) => {
  if (isLocalPasswordSet()) {
    res.redirect('/login');
    return;
  }
  const { password, confirm } = req.body as Record<string, string>;
  if (!password || password.length < 8) {
    res.status(400).send(setupPage('Mot de passe de 8 caractères ou plus requis.'));
    return;
  }
  if (password !== confirm) {
    res.status(400).send(setupPage('Les mots de passe ne correspondent pas.'));
    return;
  }
  void setLocalPassword(password).then(() => res.redirect('/login'));
});

webRouter.get('/login', requireLocalLoginEnabled, (req, res) => {
  if (!isLocalPasswordSet()) {
    res.redirect('/setup');
    return;
  }
  if (req.session.auth) {
    res.redirect('/');
    return;
  }
  res.send(loginPage('failed' in req.query));
});

webRouter.post('/login', requireLocalLoginEnabled, (req, res) => {
  const { password } = req.body as Record<string, string>;
  void verifyLocalPassword(password ?? '').then((ok) => {
    if (!ok) {
      res.redirect('/login?failed');
      return;
    }
    req.session.auth = true;
    res.redirect('/');
  });
});

// « Mot de passe oublié » : AUCUN reset depuis le web. On indique la commande
// serveur (script deploy/reset_admin.sh).
// Pas de sudo : le conteneur Debian n'en a pas, et on y est déjà root.
const RESET_CMD = 'bash /opt/multioutils/server/deploy/reset_admin.sh';
const RESET_CMD_PCT = 'pct exec <CTID> -- bash /opt/multioutils/server/deploy/reset_admin.sh';

webRouter.get('/oubli', requireLocalLoginEnabled, (_req, res) => {
  res.send(
    socleLayout(
      'Mot de passe oublié',
      `<div class="login-card forgot-card">
        ${loginLogo()}
        <span class="badge">Secours</span>
        <h1 class="h-acces">Mot de passe oublié</h1>
        <p class="forgot-intro">Par sécurité, le mot de passe local ne se
        réinitialise pas depuis le web. Sur le <b>serveur</b>, lance :</p>
        <div class="copie"><code>${e(RESET_CMD)}</code><button type="button" class="btn sm" data-copier="${e(RESET_CMD)}">${ic('copy', 's16')}Copier</button></div>
        <p class="forgot-intro">Depuis l'hôte <b>Proxmox</b> (remplace &lt;CTID&gt; par le numéro du conteneur) :</p>
        <div class="copie"><code>${e(RESET_CMD_PCT)}</code><button type="button" class="btn sm" data-copier="${e(RESET_CMD_PCT)}">${ic('copy', 's16')}Copier</button></div>
        <p class="forgot-note">Un nouveau mot de passe est généré et affiché (ou
        passe-le en argument). L'entrée normale, elle, passe par <b>Cloudflare</b>.</p>
        <a class="btn gh w" href="/login">${ic('chevl', 's18')}Retour à la connexion</a>
      </div>`
    )
  );
});

webRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── Galerie (docs/00 §7.1 : filtres dossier/tag/date, responsive) ───────

webRouter.get('/', gateway, (req, res) => {
  const filters = {
    folder: req.query.folder ? String(req.query.folder) : undefined,
    tag: req.query.tag ? String(req.query.tag) : undefined,
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    page: Number(req.query.page ?? 1)
  };
  const { items, total, page, pages } = queryCaptures(filters);

  // valeurs de filtres existantes (petite échelle : parcours en mémoire)
  const all = getDb().prepare('SELECT folder, tags FROM captures').all() as Array<{
    folder: string | null;
    tags: string | null;
  }>;
  const folderSet = new Set<string>();
  const tagSet = new Set<string>();
  for (const row of all) {
    if (row.folder) folderSet.add(row.folder);
    for (const tag of parseTags(row.tags)) tagSet.add(tag);
  }

  type Filters = typeof filters;
  const qs = (p: number, without?: keyof Filters): string => {
    const params = new URLSearchParams();
    if (filters.folder && without !== 'folder') params.set('folder', filters.folder);
    if (filters.tag && without !== 'tag') params.set('tag', filters.tag);
    if (filters.from && without !== 'from') params.set('from', filters.from);
    if (filters.to && without !== 'to') params.set('to', filters.to);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return s ? `/?${s}` : '/';
  };

  const actifs: Array<{ label: string; href: string }> = [];
  if (filters.folder) actifs.push({ label: filters.folder, href: qs(1, 'folder') });
  if (filters.tag) actifs.push({ label: `#${filters.tag}`, href: qs(1, 'tag') });
  if (filters.from) actifs.push({ label: `Depuis le ${dateFr(filters.from)}`, href: qs(1, 'from') });
  if (filters.to) actifs.push({ label: `Jusqu'au ${dateFr(filters.to)}`, href: qs(1, 'to') });

  const cards = items
    .map((c) => {
      const tags = parseTags(c.tags);
      return `<a class="shot" href="/captures/${e(c.id)}">
        <span class="shot-img"><img src="/media/${e(c.id)}" alt="${e(c.filename)}" loading="lazy"></span>
        <span class="shot-meta">
          <b class="shot-nom">${e(c.filename)}</b>
          <span class="shot-sous">${dateFr(c.created_at)}${c.folder ? ` · ${e(c.folder)}` : ''}</span>
          ${tags.length > 0 ? `<span class="shot-tags">${tags.map((t) => `<span class="etq">${e(t)}</span>`).join('')}</span>` : ''}
        </span>
      </a>`;
    })
    .join('');

  const champs = `${selectField('Dossier', 'folder', folderSet, filters.folder, 'Tous les dossiers')}
    ${selectField('Étiquette', 'tag', tagSet, filters.tag, 'Toutes les étiquettes')}
    <label class="filtre-champ"><span class="lbl">Depuis le</span><input class="input" type="date" name="from" value="${e(filters.from ?? '')}"></label>
    <label class="filtre-champ"><span class="lbl">Jusqu'au</span><input class="input" type="date" name="to" value="${e(filters.to ?? '')}"></label>`;

  const empty = actifs.length
    ? `<div class="carte vide">${ic('filter')}<b>Aucune capture avec ces filtres</b><span>Essaie d'en retirer un, ou réinitialise.</span><a class="btn sm" href="/">Réinitialiser</a></div>`
    : `<div class="carte vide">${ic('grid')}<b>Aucune capture pour l'instant</b><span>Envoie-en une depuis le logiciel (bouton « Envoyer au serveur »).</span></div>`;

  res.send(
    layout(
      'Galerie',
      `<div class="page-h"><h1 class="page-t">Galerie<span class="n">${total}</span></h1></div>
      ${filtersBlock({ id: 'filtres-galerie', action: '/', champs, resetHref: '/', actifs })}
      ${items.length === 0 ? empty : `<div class="grille-captures">${cards}</div>`}
      ${
        pages > 1
          ? `<nav class="pager" aria-label="Pages">
              ${page > 1 ? `<a class="btn sm" href="${qs(page - 1)}">${ic('chevl', 's16')}Précédent</a>` : '<span></span>'}
              <span class="pager-n">Page ${page} / ${pages}</span>
              ${page < pages ? `<a class="btn sm" href="${qs(page + 1)}">Suivant${ic('chev', 's16')}</a>` : '<span></span>'}
            </nav>`
          : ''
      }`,
      { nav: true, active: 'gallery' }
    )
  );
});

// ── Vue d'une capture : grand aperçu + téléchargement + suppression ─────

webRouter.get('/captures/:id', gateway, (req, res) => {
  const c = getDb()
    .prepare('SELECT * FROM captures WHERE id = ?')
    .get(req.params.id) as ServerCapture | undefined;
  if (!c) {
    res.status(404).send(
      layout(
        'Introuvable',
        errorBlock({
          titre: 'Capture introuvable',
          texte: "Elle a peut-être été supprimée, ou le lien n'est plus valable.",
          retour: { href: '/', label: 'Retour à la galerie' }
        }),
        { nav: true, active: 'gallery' }
      )
    );
    return;
  }
  const tags = parseTags(c.tags);
  res.send(
    layout(
      c.filename,
      `<a class="btn sm gh retour" href="/">${ic('chevl', 's18')}Galerie</a>
      <div class="page-h"><h1 class="page-t titre-long">${e(c.filename)}</h1></div>
      <div class="chips infos">
        <span class="chip">${ic('cal', 's16')}${dateFr(c.created_at)}</span>
        ${c.width && c.height ? `<span class="chip">${ic('layers', 's16')}${c.width} × ${c.height}</span>` : ''}
        ${c.folder ? `<a class="chip" href="/?folder=${encodeURIComponent(c.folder)}">${ic('lib', 's16')}${e(c.folder)}</a>` : ''}
        ${tags.map((t) => `<a class="chip" href="/?tag=${encodeURIComponent(t)}">${ic('hash', 's16')}${e(t)}</a>`).join('')}
      </div>
      <div class="ligne actions">
        <a class="btn pri" href="/media/${e(c.id)}?download=1" download>${ic('download', 's18')}Télécharger</a>
        <form method="post" action="/captures/${e(c.id)}/delete"
              data-confirmer="Cette capture sera supprimée du serveur. Le logiciel garde sa copie locale."
              data-titre="Supprimer la capture ?" data-ok="Supprimer" data-danger>
          <button class="btn dn" type="submit">${ic('trash', 's18')}Supprimer</button>
        </form>
      </div>
      <div class="carte capture-view"><img src="/media/${e(c.id)}" alt="${e(c.filename)}"></div>`,
      { nav: true, active: 'gallery' }
    )
  );
});

webRouter.post('/captures/:id/delete', gateway, (req, res) => {
  const row = getDb()
    .prepare('SELECT path FROM captures WHERE id = ?')
    .get(req.params.id) as { path: string } | undefined;
  if (row) {
    getDb().prepare('DELETE FROM captures WHERE id = ?').run(req.params.id);
    try {
      fs.unlinkSync(row.path);
    } catch {
      // fichier déjà absent
    }
  }
  res.redirect('/');
});

// ── Clips : consultation + dépôt (docs/00 §9.4) ─────────────────────────
// Textes/photos partagés depuis l'iPhone (Raccourci), la page « Déposer »
// ou l'app. Même exigence de session que la galerie.

// N'importe quel type de fichier est accepté (PDF, zip, docs…) — la taille
// reste bornée par le plafond fixe (sécurité) puis par la limite réglable
// (rejectIfTooLarge, vérifiée dans le handler).
const clipUpload = multer({
  dest: path.join(uploadsDir, '.tmp'),
  limits: { fileSize: UPLOAD_CEILING_MB * 1024 * 1024 }
});

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Libellé et icône de la provenance d'un clip. */
function sourceOf(source: string | null): { label: string; icone: string } {
  if (source === 'iphone') return { label: 'iPhone', icone: 'share' };
  if (source === 'ipad') return { label: 'iPad', icone: 'share' };
  if (source === 'web') return { label: 'Site web', icone: 'cloud' };
  return { label: 'Logiciel PC', icone: 'tv' };
}

webRouter.get('/clips', gateway, (req, res) => {
  const filterFolder = req.query.folder ? String(req.query.folder) : '';
  const filterTag = req.query.tag ? String(req.query.tag) : '';

  const all = getDb()
    .prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT 200')
    .all() as ServerClip[];

  // valeurs de filtres existantes (petite échelle, comme la galerie)
  const folderSet = new Set<string>();
  const tagSet = new Set<string>();
  for (const clip of all) {
    if (clip.folder) folderSet.add(clip.folder);
    for (const tag of parseTags(clip.tags)) tagSet.add(tag);
  }

  const clips = all.filter((clip) => {
    if (filterFolder && clip.folder !== filterFolder) return false;
    if (filterTag && !parseTags(clip.tags).includes(filterTag)) return false;
    return true;
  });

  const href = (folder: string, tag: string): string => {
    const p = new URLSearchParams();
    if (folder) p.set('folder', folder);
    if (tag) p.set('tag', tag);
    const s = p.toString();
    return s ? `/clips?${s}` : '/clips';
  };
  const actifs: Array<{ label: string; href: string }> = [];
  if (filterFolder) actifs.push({ label: filterFolder, href: href('', filterTag) });
  if (filterTag) actifs.push({ label: `#${filterTag}`, href: href(filterFolder, '') });

  const rows = clips
    .map((clip) => {
      const src = sourceOf(clip.source);
      const tags = parseTags(clip.tags);
      const body =
        clip.kind === 'text'
          ? `<pre class="clip-text" data-clip>${e(clip.content ?? '')}</pre>
             <div class="ligne">
               <button class="btn sm" type="button" data-copy>${ic('copy', 's16')}Copier</button>
               <button class="btn sm gh" type="button" data-expand>${ic('external', 's16')}Agrandir</button>
             </div>`
          : clip.kind === 'image'
            ? `<a class="clip-img" href="/api/clips/${e(clip.id)}/raw" target="_blank" rel="noopener">
                 <img src="/api/clips/${e(clip.id)}/raw" alt="${e(clip.filename ?? '')}" loading="lazy">
               </a>`
            : `<a class="clip-file" href="/api/clips/${e(clip.id)}/raw?download=1">
                 <span class="li-ic">${ic('download', 's18')}</span>
                 <span class="tx"><b>${e(clip.filename ?? 'fichier')}</b><small>${clip.size_bytes ? humanSize(clip.size_bytes) : 'Fichier'} · toucher pour télécharger</small></span>
               </a>`;
      return `<article class="carte clip">
        <div class="clip-h">
          <span class="li-ic">${ic(src.icone, 's18')}</span>
          <span class="tx"><b>${src.label}</b><small>${dateFr(clip.created_at)}${clip.filename && clip.kind !== 'file' ? ` · ${e(clip.filename)}` : ''}</small></span>
          <form method="post" action="/clips/${e(clip.id)}/delete" data-confirmer="Ce clip sera supprimé du serveur." data-titre="Supprimer le clip ?" data-ok="Supprimer" data-danger>
            <button class="btn sm ico dn gh" type="submit" aria-label="Supprimer ce clip" title="Supprimer">${ic('trash', 's16')}</button>
          </form>
        </div>
        ${body}
        ${
          clip.folder || tags.length > 0
            ? `<div class="clip-org-l">${clip.folder ? `<a class="etq" href="${e(href(clip.folder, ''))}">${ic('lib', 's16')}${e(clip.folder)}</a>` : ''}${tags
                .map((tg) => `<a class="etq" href="${e(href('', tg))}">#${e(tg)}</a>`)
                .join('')}</div>`
            : ''
        }
        <details class="clip-org">
          <summary>${ic('edit', 's16')}Dossier et étiquettes${ic('chevd', 's16 chev')}</summary>
          <form method="post" action="/clips/${e(clip.id)}/organize" class="form" data-occupe>
            <label><span class="lbl">Dossier</span><input class="input" type="text" name="folder" placeholder="Ex. : Travail / Projet A" value="${e(clip.folder ?? '')}"></label>
            <label><span class="lbl">Étiquettes</span><input class="input" type="text" name="tags" placeholder="Séparées par des virgules" value="${e(tags.join(', '))}"></label>
            <button class="btn sm pri" type="submit">${ic('check', 's16')}Enregistrer</button>
          </form>
        </details>
      </article>`;
    })
    .join('');

  const champs = `${selectField('Dossier', 'folder', folderSet, filterFolder, 'Tous les dossiers')}
    ${selectField('Étiquette', 'tag', tagSet, filterTag, 'Toutes les étiquettes')}`;

  const empty = actifs.length
    ? `<div class="carte vide">${ic('filter')}<b>Aucun clip avec ces filtres</b><span>Essaie d'en retirer un, ou réinitialise.</span><a class="btn sm" href="/clips">Réinitialiser</a></div>`
    : `<div class="carte vide">${ic('layers')}<b>Aucun clip pour l'instant</b><span>Dépose-en un, ou partage depuis ton iPhone (Raccourci « Envoyer à MultiOutils »).</span><a class="btn sm pri" href="/clips/deposer">${ic('upload', 's16')}Déposer un clip</a></div>`;

  res.send(
    layout(
      'Clips',
      `<div class="page-h">
        <h1 class="page-t">Clips<span class="n">${clips.length}</span></h1>
        <a class="btn sm pri" href="/clips/deposer">${ic('plus', 's16')}Déposer</a>
      </div>
      <p class="intro-p">Textes et photos partagés depuis ton iPhone (menu Partager),
      la page Déposer ou le logiciel. Le logiciel PC les récupère automatiquement.</p>
      ${filtersBlock({ id: 'filtres-clips', action: '/clips', champs, resetHref: '/clips', actifs })}
      ${clips.length === 0 ? empty : `<div class="grille-clips">${rows}</div>`}`,
      { nav: true, active: 'clips' }
    )
  );
});

webRouter.post('/clips/:id/organize', gateway, (req, res) => {
  const body = req.body as Record<string, string>;
  organizeClip(req.params.id, {
    folder: body.folder ?? null,
    tags: (body.tags ?? '')
      .split(',')
      .map((tg) => tg.trim())
      .filter((tg) => tg.length > 0)
  });
  res.redirect('/clips');
});

webRouter.get('/clips/deposer', gateway, (_req, res) => {
  res.send(
    layout(
      'Déposer',
      `<a class="btn sm gh retour" href="/clips">${ic('chevl', 's18')}Clips</a>
      <div class="page-h"><h1 class="page-t">Déposer un clip</h1></div>
      <div class="grille-depot">
        <form method="post" action="/clips/deposer" class="carte depot form" data-occupe>
          <h2 class="sec-t">${ic('type', 's18 acc')}Texte</h2>
          <textarea class="input" name="text" rows="6" placeholder="Colle ton texte ici…" aria-label="Texte" required></textarea>
          <button class="btn pri" type="submit">${ic('upload', 's18')}Envoyer</button>
        </form>
        <form method="post" action="/clips/deposer" enctype="multipart/form-data" class="carte depot form" data-occupe>
          <h2 class="sec-t">${ic('download', 's18 acc')}Photo ou fichier</h2>
          <p class="muted petit">Images, PDF, documents… n'importe quel type.</p>
          <input class="input fichier" type="file" name="file" aria-label="Fichier" required>
          <button class="btn pri" type="submit">${ic('upload', 's18')}Envoyer</button>
          <p class="muted petit">Taille maximale : ${getMaxUploadMb()} Mo.</p>
        </form>
      </div>
      <p class="intro-p astuce">${ic('info', 's16')}<span>Astuce : depuis l'iPhone, le Raccourci « Envoyer à MultiOutils »
      fait la même chose directement depuis le menu Partager (voir le guide dans la doc).</span></p>`,
      { nav: true, active: 'deposer' }
    )
  );
});

webRouter.post('/clips/deposer', gateway, clipUpload.single('file'), (req, res) => {
  if (req.file) {
    if (rejectIfTooLarge(req.file)) {
      res.status(413).send(
        layout(
          'Fichier trop volumineux',
          errorBlock({
            titre: 'Fichier trop volumineux',
            texte: `La limite est de ${getMaxUploadMb()} Mo. Elle se règle dans Réglages → Taille maximale d'envoi.`,
            retour: { href: '/clips/deposer', label: 'Réessayer' }
          }),
          { nav: true, active: 'deposer' }
        )
      );
      return;
    }
    // Types connus décodables en miniature côté app → 'image' ; sinon 'file'.
    if (ALLOWED_MIME[req.file.mimetype]) insertImageClip(req.file, 'web');
    else insertFileClip(req.file, 'web');
  } else {
    const text = String((req.body as Record<string, string>).text ?? '').trim();
    if (text) insertTextClip(text, 'web');
  }
  res.redirect('/clips');
});

webRouter.post('/clips/:id/delete', gateway, (req, res) => {
  const clip = getDb()
    .prepare('SELECT path FROM clips WHERE id = ?')
    .get(req.params.id) as { path: string | null } | undefined;
  if (clip) {
    getDb().prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);
    if (clip.path) {
      try {
        fs.unlinkSync(clip.path);
      } catch {
        // fichier déjà absent
      }
    }
  }
  res.redirect('/clips');
});

// ── Média : JAMAIS accessible sans session ni jeton (docs/00 §7.3) ──────

webRouter.get('/media/:id', requireSessionOrToken, (req, res) => {
  const row = getDb()
    .prepare('SELECT path, filename FROM captures WHERE id = ?')
    .get(req.params.id) as { path: string; filename: string } | undefined;
  if (!row || !fs.existsSync(row.path)) {
    res.status(404).end();
    return;
  }
  if ('download' in req.query) {
    res.download(row.path, row.filename);
  } else {
    res.sendFile(row.path);
  }
});
