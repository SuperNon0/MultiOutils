import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {
  createAdmin,
  hasUsers,
  requireSession,
  requireSessionOrToken,
  verifyLogin
} from '../auth';
import { getDb, parseTags, type ServerCapture, type ServerClip } from '../db';
import { env, uploadsDir } from '../env';
import { e, layout } from '../html';
import { insertImageClip, insertTextClip, queryCaptures } from './api';

/** Interface web de consultation (docs/00 §7.1). Auth : session. */
export const webRouter = Router();

// ── Première configuration : création du compte admin (docs/04 §3) ──────

webRouter.get('/setup', (_req, res) => {
  if (hasUsers()) {
    res.redirect('/login');
    return;
  }
  res.send(
    layout(
      'Première configuration',
      `<div class="auth-wrap"><form method="post" action="/setup" class="card auth-card">
        <h1>Créer le compte <span class="accent">admin</span></h1>
        <p class="muted">Première configuration du serveur MultiOutils.</p>
        <input type="text" name="username" placeholder="Identifiant" required minlength="3" autofocus>
        <input type="password" name="password" placeholder="Mot de passe" required minlength="8">
        <input type="password" name="confirm" placeholder="Confirmer le mot de passe" required minlength="8">
        <button class="btn btn-primary" type="submit">Créer le compte</button>
      </form></div>`
    )
  );
});

webRouter.post('/setup', (req, res) => {
  if (hasUsers()) {
    res.redirect('/login');
    return;
  }
  const { username, password, confirm } = req.body as Record<string, string>;
  if (!username || username.length < 3 || !password || password.length < 8) {
    res.status(400).send(layout('Erreur', `<p class="error">Identifiant (3+) et mot de passe (8+) requis.</p><p><a href="/setup">Réessayer</a></p>`));
    return;
  }
  if (password !== confirm) {
    res.status(400).send(layout('Erreur', `<p class="error">Les mots de passe ne correspondent pas.</p><p><a href="/setup">Réessayer</a></p>`));
    return;
  }
  void createAdmin(username, password).then(() => res.redirect('/login'));
});

// ── Connexion ────────────────────────────────────────────────────────────

webRouter.get('/login', (req, res) => {
  if (!hasUsers()) {
    res.redirect('/setup');
    return;
  }
  if (req.session.userId) {
    res.redirect('/');
    return;
  }
  const failed = 'failed' in req.query;
  res.send(
    layout(
      'Connexion',
      `<div class="auth-wrap"><form method="post" action="/login" class="card auth-card">
        <h1>Multi<span class="accent">Outils</span></h1>
        <p class="muted">Consultation à distance des captures.</p>
        ${failed ? '<p class="error">Identifiant ou mot de passe incorrect.</p>' : ''}
        <input type="text" name="username" placeholder="Identifiant" required autofocus>
        <input type="password" name="password" placeholder="Mot de passe" required>
        <button class="btn btn-primary" type="submit">Se connecter</button>
      </form></div>`
    )
  );
});

webRouter.post('/login', (req, res) => {
  const { username, password } = req.body as Record<string, string>;
  void verifyLogin(username ?? '', password ?? '').then((userId) => {
    if (!userId) {
      res.redirect('/login?failed');
      return;
    }
    req.session.userId = userId;
    res.redirect('/');
  });
});

webRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ── Galerie (docs/00 §7.1 : filtres dossier/tag/date, responsive) ───────

webRouter.get('/', requireSession, (req, res) => {
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
      ${items.length === 0 ? '<p class="muted">Aucune capture. Envoie-en une depuis le logiciel (bouton « Envoyer au serveur »).</p>' : `<div class="grid">${cards}</div>`}
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

webRouter.get('/captures/:id', requireSession, (req, res) => {
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

webRouter.post('/captures/:id/delete', requireSession, (req, res) => {
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

// PNG/JPEG uniquement : ce sont les formats que l'app PC sait recopier dans
// le presse-papiers Windows (nativeImage). Le Raccourci iOS convertit en JPEG.
const ALLOWED_CLIP_MIME: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true
};

const clipUpload = multer({
  dest: path.join(uploadsDir, '.tmp'),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(ALLOWED_CLIP_MIME[file.mimetype]))
});

webRouter.get('/clips', requireSession, (_req, res) => {
  const clips = getDb()
    .prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT 100')
    .all() as ServerClip[];

  const rows = clips
    .map((clip) => {
      const when = clip.created_at.slice(0, 16).replace('T', ' ');
      const badge =
        clip.source === 'iphone' ? '📱' : clip.source === 'web' ? '🌐' : '💻';
      const body =
        clip.kind === 'text'
          ? `<pre class="clip-text" data-clip>${e(clip.content ?? '')}</pre>
             <button class="btn clip-copy" type="button" data-copy>Copier</button>`
          : `<a href="/api/clips/${e(clip.id)}/raw" target="_blank">
               <img class="clip-img" src="/api/clips/${e(clip.id)}/raw" alt="${e(clip.filename ?? '')}" loading="lazy">
             </a>`;
      return `<div class="card clip-card">
        <div class="clip-head muted">${badge} ${e(when)}${clip.filename ? ` · ${e(clip.filename)}` : ''}</div>
        ${body}
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
      ${clips.length === 0 ? '<p class="muted">Aucun clip pour l’instant.</p>' : `<div class="clips-grid">${rows}</div>`}
      <script src="/public/clips.js"></script>`,
      { nav: true, active: 'clips' }
    )
  );
});

webRouter.get('/clips/deposer', requireSession, (_req, res) => {
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
          <h2>Photo</h2>
          <input type="file" name="file" accept="image/png,image/jpeg" required>
          <button class="btn btn-primary" type="submit">Envoyer</button>
        </form>
      </div>
      <p class="muted">Astuce : depuis l'iPhone, le Raccourci « Envoyer à MultiOutils »
      fait la même chose directement depuis le menu Partager (voir le guide dans la doc).</p>`,
      { nav: true, active: 'clips' }
    )
  );
});

webRouter.post('/clips/deposer', requireSession, clipUpload.single('file'), (req, res) => {
  if (req.file) {
    insertImageClip(req.file, 'web');
  } else {
    const text = String((req.body as Record<string, string>).text ?? '').trim();
    if (text) insertTextClip(text, 'web');
  }
  res.redirect('/clips');
});

webRouter.post('/clips/:id/delete', requireSession, (req, res) => {
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
