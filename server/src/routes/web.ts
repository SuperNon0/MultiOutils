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
import { e, layout, socleLayout } from '../html';
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

// ── Connexion & secours local (thème PARTAGÉ du socle) ──────────────────
// Identité normale = badge Cloudflare (voir security.ts / gateway). Le mot de
// passe local est un SECOURS : un seul champ, aucun identifiant. La page de
// connexion reproduit `socle-lite/panel/templates/login.html` à l'identique.

/** Page de connexion — reproduction fidèle du login.html du socle. */
function loginPage(failed: boolean): string {
  return socleLayout(
    'Connexion locale',
    `${failed ? '<div class="flash-stack"><div class="flash error">Mot de passe incorrect.</div></div>' : ''}
    <form class="login-card" method="post" action="/login">
      <div class="login-logo">
        <img class="logo-mark" src="/public/socle/logo.svg" alt="" width="44" height="44">
        <span class="logo"><span class="g">multi</span><span class="i">outils</span></span>
      </div>
      <span class="badge">accès local</span>
      <input type="password" name="password" placeholder="Mot de passe" autofocus autocomplete="current-password">
      <button type="submit" class="btn primary full">Se connecter</button>
      <a class="forgot-link" href="/oubli">Mot de passe oublié ?</a>
      <p class="access-note">Accès local (réseau domestique) · secours</p>
    </form>`,
    { bodyClass: 'login-page' }
  );
}

/** Première configuration : définir le mot de passe de SECOURS local. */
function setupPage(error?: string): string {
  return socleLayout(
    'Première configuration',
    `${error ? `<div class="flash-stack"><div class="flash error">${e(error)}</div></div>` : ''}
    <form class="login-card" method="post" action="/setup">
      <div class="login-logo">
        <img class="logo-mark" src="/public/socle/logo.svg" alt="" width="44" height="44">
        <span class="logo"><span class="g">multi</span><span class="i">outils</span></span>
      </div>
      <h2>Mot de passe de secours</h2>
      <p class="access-text">Définis un mot de passe local (secours si Cloudflare
      tombe). L'entrée normale, elle, passe par Cloudflare.</p>
      <input type="password" name="password" placeholder="Mot de passe (8+ caractères)" autofocus autocomplete="new-password" minlength="8">
      <input type="password" name="confirm" placeholder="Confirmer le mot de passe" autocomplete="new-password" minlength="8">
      <button type="submit" class="btn primary full">Enregistrer</button>
    </form>`,
    { bodyClass: 'login-page' }
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
    res.status(400).send(setupPage('Mot de passe (8+ caractères) requis.'));
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
// serveur (script deploy/reset_admin.sh). Reproduit oubli.html du socle.
webRouter.get('/oubli', requireLocalLoginEnabled, (_req, res) => {
  res.send(
    socleLayout(
      'Mot de passe oublié',
      `<div class="login-card">
        <div class="login-logo">
          <img class="logo-mark" src="/public/socle/logo.svg" alt="" width="44" height="44">
          <span class="logo"><span class="g">multi</span><span class="i">outils</span></span>
        </div>
        <h2>Mot de passe oublié</h2>
        <p class="access-text">Par sécurité, le mot de passe local ne se
        réinitialise pas depuis le web. Sur le <b>serveur</b>, lance :</p>
        <pre class="cmd" style="white-space:pre-wrap;text-align:left">cd /opt/multioutils/server && sudo bash deploy/reset_admin.sh</pre>
        <p class="access-note">Un nouveau mot de passe est généré et affiché (ou
        passe-le en argument). L'entrée normale, elle, passe par <b>Cloudflare</b>.</p>
        <a class="forgot-link" href="/login">← Retour</a>
      </div>`,
      { bodyClass: 'login-page' }
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

  const options = (values: Set<string>, current?: string): string =>
    [...values]
      .sort((a, b) => a.localeCompare(b))
      .map(
        (v) =>
          `<option value="${e(v)}"${v === current ? ' selected' : ''}>${e(v)}</option>`
      )
      .join('');

  const qs = (p: number): string => {
    const params = new URLSearchParams();
    if (filters.folder) params.set('folder', filters.folder);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('page', String(p));
    return `/?${params.toString()}`;
  };

  const cards = items
    .map(
      (c) => `<a class="shot" href="/captures/${e(c.id)}">
        <img src="/media/${e(c.id)}" alt="${e(c.filename)}" loading="lazy">
        <div class="meta">
          <div class="name">${e(c.filename)}</div>
          <div class="muted">${e(c.created_at.slice(0, 16).replace('T', ' '))}${
            c.folder ? ` · ${e(c.folder)}` : ''
          }</div>
          ${
            parseTags(c.tags).length > 0
              ? `<div class="tags">${parseTags(c.tags)
                  .map((t) => `<span class="tag">${e(t)}</span>`)
                  .join('')}</div>`
              : ''
          }
        </div>
      </a>`
    )
    .join('');

  res.send(
    layout(
      'Galerie',
      `<h1>Galerie <span class="muted" style="font-size:14px">${total} capture(s)</span></h1>
      <form class="filters" method="get" action="/">
        <select name="folder"><option value="">Tous les dossiers</option>${options(folderSet, filters.folder)}</select>
        <select name="tag"><option value="">Tous les tags</option>${options(tagSet, filters.tag)}</select>
        <input type="date" name="from" value="${e(filters.from ?? '')}">
        <input type="date" name="to" value="${e(filters.to ?? '')}">
        <button class="btn" type="submit">Filtrer</button>
        <a class="btn" href="/">Réinitialiser</a>
      </form>
      ${items.length === 0 ? '<div class="gallery-empty">Aucune capture pour l’instant.<br>Envoie-en une depuis le logiciel (bouton « Envoyer au serveur »).</div>' : `<div class="grid">${cards}</div>`}
      ${
        pages > 1
          ? `<div class="pager">
              ${page > 1 ? `<a class="btn" href="${qs(page - 1)}">← Précédent</a>` : ''}
              <span class="muted">Page ${page} / ${pages}</span>
              ${page < pages ? `<a class="btn" href="${qs(page + 1)}">Suivant →</a>` : ''}
            </div>`
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
    res.status(404).send(layout('Introuvable', '<p class="error">Capture inconnue.</p><p><a href="/">← Retour</a></p>', { nav: true }));
    return;
  }
  res.send(
    layout(
      c.filename,
      `<p><a href="/">← Galerie</a></p>
      <h1>${e(c.filename)}</h1>
      <p class="muted">${e(c.created_at.slice(0, 16).replace('T', ' '))}
        ${c.width && c.height ? ` · ${c.width}×${c.height}` : ''}
        ${c.folder ? ` · dossier : ${e(c.folder)}` : ''}
        ${parseTags(c.tags).length > 0 ? ` · tags : ${parseTags(c.tags).map(e).join(', ')}` : ''}
      </p>
      <div class="capture-actions">
        <a class="btn btn-primary" href="/media/${e(c.id)}?download=1">Télécharger</a>
        <form method="post" action="/captures/${e(c.id)}/delete"
              onsubmit="return confirm('Supprimer cette capture du serveur ?')">
          <button class="btn btn-danger" type="submit">Supprimer</button>
        </form>
      </div>
      <div class="capture-view"><img src="/media/${e(c.id)}" alt="${e(c.filename)}"></div>`,
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
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
  const options = (values: Set<string>, current: string): string =>
    [...values]
      .sort((a, b) => a.localeCompare(b))
      .map(
        (v) => `<option value="${e(v)}"${v === current ? ' selected' : ''}>${e(v)}</option>`
      )
      .join('');

  const clips = all.filter((clip) => {
    if (filterFolder && clip.folder !== filterFolder) return false;
    if (filterTag && !parseTags(clip.tags).includes(filterTag)) return false;
    return true;
  });

  const rows = clips
    .map((clip) => {
      const when = clip.created_at.slice(0, 16).replace('T', ' ');
      const badge =
        clip.source === 'iphone' || clip.source === 'ipad'
          ? '📱'
          : clip.source === 'web'
            ? '🌐'
            : '💻';
      const tags = parseTags(clip.tags);
      const organizeLine = [
        clip.folder ? `📁 ${e(clip.folder)}` : '',
        tags.length > 0
          ? `<span class="tags">${tags.map((tg) => `<span class="tag">${e(tg)}</span>`).join('')}</span>`
          : ''
      ]
        .filter(Boolean)
        .join(' · ');
      const body =
        clip.kind === 'text'
          ? `<pre class="clip-text" data-clip>${e(clip.content ?? '')}</pre>
             <div class="row-gap">
               <button class="btn clip-copy" type="button" data-copy>Copier</button>
               <button class="btn" type="button" data-expand>Agrandir</button>
             </div>`
          : clip.kind === 'image'
            ? `<a href="/api/clips/${e(clip.id)}/raw" target="_blank">
                 <img class="clip-img" src="/api/clips/${e(clip.id)}/raw" alt="${e(clip.filename ?? '')}" loading="lazy">
               </a>`
            : `<a class="btn clip-file" href="/api/clips/${e(clip.id)}/raw?download=1">
                 📄 ${e(clip.filename ?? 'fichier')}${clip.size_bytes ? ` · ${humanSize(clip.size_bytes)}` : ''}
               </a>`;
      return `<div class="card clip-card">
        <div class="clip-head muted">${badge} ${e(when)}${clip.filename ? ` · ${e(clip.filename)}` : ''}${organizeLine ? ` · ${organizeLine}` : ''}</div>
        ${body}
        <details class="clip-organize">
          <summary class="muted">Dossier & tags</summary>
          <form method="post" action="/clips/${e(clip.id)}/organize" class="row-gap">
            <input type="text" name="folder" placeholder="Dossier (ex. Travail / Projet A)"
                   value="${e(clip.folder ?? '')}">
            <input type="text" name="tags" placeholder="Tags séparés par des virgules"
                   value="${e(tags.join(', '))}">
            <button class="btn" type="submit">Enregistrer</button>
          </form>
        </details>
        <form method="post" action="/clips/${e(clip.id)}/delete" class="clip-del"
              onsubmit="return confirm('Supprimer ce clip ?')">
          <button class="btn btn-danger" type="submit">Supprimer</button>
        </form>
      </div>`;
    })
    .join('');

  res.send(
    layout(
      'Clips',
      `<div class="gallery-toolbar-row">
        <h1>Clips <span class="muted" style="font-size:14px">${clips.length} élément(s)</span></h1>
        <a class="btn btn-primary" href="/clips/deposer">+ Déposer</a>
      </div>
      <p class="muted">Textes et photos partagés depuis ton iPhone (menu Partager),
      la page Déposer ou le logiciel. Le logiciel PC les récupère automatiquement.</p>
      <form class="filters" method="get" action="/clips">
        <select name="folder"><option value="">Tous les dossiers</option>${options(folderSet, filterFolder)}</select>
        <select name="tag"><option value="">Tous les tags</option>${options(tagSet, filterTag)}</select>
        <button class="btn" type="submit">Filtrer</button>
        <a class="btn" href="/clips">Réinitialiser</a>
      </form>
      ${clips.length === 0 ? '<div class="gallery-empty">Aucun clip pour l’instant.<br>Dépose-en un, ou partage depuis ton iPhone (Raccourci « Envoyer à MultiOutils »).</div>' : `<div class="clips-grid">${rows}</div>`}
      <script src="/public/clips.js"></script>`,
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
      `<p><a href="/clips">← Clips</a></p>
      <h1>Déposer un clip</h1>
      <div class="deposit-grid">
        <form method="post" action="/clips/deposer" class="card deposit-card">
          <h2>Texte</h2>
          <textarea name="text" rows="6" placeholder="Colle ton texte ici…" required></textarea>
          <button class="btn btn-primary" type="submit">Envoyer</button>
        </form>
        <form method="post" action="/clips/deposer" enctype="multipart/form-data" class="card deposit-card">
          <h2>Photo ou fichier</h2>
          <p class="muted">Images, PDF, documents… n'importe quel type.</p>
          <input type="file" name="file" required>
          <button class="btn btn-primary" type="submit">Envoyer</button>
          <p class="muted deposit-max">Taille maximale : ${getMaxUploadMb()} Mo.</p>
        </form>
      </div>
      <p class="muted">Astuce : depuis l'iPhone, le Raccourci « Envoyer à MultiOutils »
      fait la même chose directement depuis le menu Partager (voir le guide dans la doc).</p>`,
      { nav: true, active: 'clips' }
    )
  );
});

webRouter.post('/clips/deposer', gateway, clipUpload.single('file'), (req, res) => {
  if (req.file) {
    if (rejectIfTooLarge(req.file)) {
      res
        .status(413)
        .send(
          layout(
            'Erreur',
            `<p class="error">Fichier trop volumineux (limite : ${getMaxUploadMb()} Mo).</p><p><a href="/clips/deposer">← Réessayer</a></p>`,
            { nav: true, active: 'clips' }
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
