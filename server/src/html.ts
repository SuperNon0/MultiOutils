/**
 * Rendu HTML de l'interface web, au design « encre » (voir design-encre/).
 *
 * - `layout()` : pages de l'application (galerie, clips, réglages…) avec le
 *   menu de gauche (ordinateur), la barre du haut et la barre d'onglets
 *   flottante en verre (téléphone), et la recherche rapide (Ctrl K).
 * - `socleLayout()` : écrans d'accès centrés (connexion, secours, 403, erreurs).
 *
 * Les fichiers du design sont servis tels quels depuis /public/encre/ ; les
 * réglages propres au site sont dans /public/site.css et /public/site.js.
 * Aucun script en ligne : la CSP reste `script-src 'self'`.
 */
import { getDb, parseTags } from './db';
import { VERSION } from './version';

export function e(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Adresse du jeu d'icônes au trait (fichier à part, même site). */
export const SPRITE = '/public/encre/icones.svg';

/** Une icône du jeu « encre » : `ic('trash', 's18')`. */
export function ic(nom: string, cls = ''): string {
  return `<svg class="i${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="${SPRITE}#i-${nom}"/></svg>`;
}

/** Le nom du site, avec sa marque (une lettre sur l'accent). */
export function brand(href = '/'): string {
  return `<a class="brand" href="${href}" aria-label="MultiOutils, galerie"><span class="marque" aria-hidden="true">m</span><span class="wm">multi<b>outils</b></span></a>`;
}

function head(title: string, extra = ''): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(title)} · MultiOutils</title>
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b0f17" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f5f3ee" media="(prefers-color-scheme: light)">
<script src="/public/theme.js"></script>
<link rel="icon" href="/public/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/public/encre/polices.css">
<link rel="stylesheet" href="/public/encre/encre.css">
<link rel="stylesheet" href="/public/site.css">
<script defer src="/public/encre/encre.js"></script>
<script defer src="/public/site.js"></script>
${extra}`;
}

const HTML_OPEN = `<!doctype html>
<html lang="fr" data-accent-defaut="lavande" data-encre-sprite="${SPRITE}">`;

type Active = 'gallery' | 'clips' | 'deposer' | 'admin' | 'reglages';

const PAGE_OF: Record<Active, string> = {
  gallery: 'galerie',
  clips: 'clips',
  deposer: 'deposer',
  admin: 'reglages',
  reglages: 'reglages'
};

/** Dossiers et étiquettes connus, pour la recherche rapide (petite échelle). */
function searchData(): { capDossiers: string[]; capTags: string[]; clipDossiers: string[]; clipTags: string[] } {
  const collect = (table: 'captures' | 'clips'): { dossiers: string[]; tags: string[] } => {
    const rows = getDb().prepare(`SELECT folder, tags FROM ${table}`).all() as Array<{
      folder: string | null;
      tags: string | null;
    }>;
    const dossiers = new Set<string>();
    const tags = new Set<string>();
    for (const row of rows) {
      if (row.folder) dossiers.add(row.folder);
      for (const t of parseTags(row.tags)) tags.add(t);
    }
    const sort = (s: Set<string>): string[] => [...s].sort((a, b) => a.localeCompare(b));
    return { dossiers: sort(dossiers), tags: sort(tags) };
  };
  try {
    const cap = collect('captures');
    const clip = collect('clips');
    return { capDossiers: cap.dossiers, capTags: cap.tags, clipDossiers: clip.dossiers, clipTags: clip.tags };
  } catch {
    return { capDossiers: [], capTags: [], clipDossiers: [], clipTags: [] };
  }
}

function captureCount(): number {
  try {
    return (getDb().prepare('SELECT COUNT(*) AS n FROM captures').get() as { n: number }).n;
  } catch {
    return 0;
  }
}

export function layout(
  title: string,
  content: string,
  opts: { nav?: boolean; active?: Active; head?: string } = {}
): string {
  const page = opts.active ? PAGE_OF[opts.active] : '';
  const showNav = opts.nav !== false;

  const sideIt = (href: string, key: string, icone: string, nom: string, n?: number): string =>
    `<a class="side-it" href="${href}" data-page="${key}">${ic(icone)}<span class="nom">${nom}</span>${
      n !== undefined ? `<span class="n">${n}</span>` : ''
    }</a>`;
  const tab = (href: string, key: string, icone: string, nom: string): string =>
    `<a class="tab" href="${href}" data-page="${key}"><span class="ti">${ic(icone, 's22')}</span>${nom}</a>`;

  const logoutForm = (cls: string, inner: string, label = 'Se déconnecter'): string =>
    `<form method="post" action="/logout" class="${cls}"><button type="submit" class="${
      cls === 'form-deco' ? 'ib' : 'q-ext dn'
    }" title="${label}" aria-label="${label}">${inner}</button></form>`;

  const data = showNav ? searchData() : null;

  const shell = showNav
    ? `<div class="app">
  <aside class="side" aria-label="Menu principal">
    <div class="ligne">${brand()}<span class="ver" title="Version du serveur">${e(VERSION)}</span></div>
    <button class="side-search" type="button" data-encre-recherche>${ic('search', 's18')}Rechercher…<span class="kbd">Ctrl K</span></button>
    <nav aria-label="Pages">
      ${sideIt('/', 'galerie', 'grid', 'Galerie', captureCount())}
      ${sideIt('/clips', 'clips', 'layers', 'Clips')}
      ${sideIt('/clips/deposer', 'deposer', 'upload', 'Déposer')}
      ${sideIt('/admin', 'reglages', 'gear', 'Réglages')}
    </nav>
    <div class="side-lbl">Réglages</div>
    <div class="side-listes">
      <a class="side-it" href="/admin#apparence">${ic('palette')}<span class="nom">Apparence</span></a>
      <a class="side-it" href="/admin#jetons">${ic('key')}<span class="nom">Jetons d'API</span></a>
      <a class="side-it" href="/admin#maj">${ic('refresh')}<span class="nom">Mise à jour</span></a>
    </div>
    <div class="side-foot">
      <div class="side-compte">
        <span class="av" aria-hidden="true">${ic('user', 's16')}</span><span>Session ouverte</span>
        ${logoutForm('form-deco', ic('logout', 's18'))}
      </div>
    </div>
  </aside>
  <div class="main">
    <header class="top">
      ${brand()}
      <span class="esp"></span>
      <button class="ib" type="button" data-encre-recherche aria-label="Rechercher">${ic('search')}</button>
    </header>
    <main class="pages anim-in">
${content}
    </main>
    <footer class="pied"><span>MultiOutils · serveur ${e(VERSION)}</span></footer>
  </div>
</div>
<nav class="tabbar" aria-label="Navigation">
  ${tab('/', 'galerie', 'grid', 'Galerie')}
  ${tab('/clips', 'clips', 'layers', 'Clips')}
  ${tab('/clips/deposer', 'deposer', 'upload', 'Déposer')}
  ${tab('/admin', 'reglages', 'gear', 'Réglages')}
  <button class="tab" type="button" data-encre-plus="encre-plus" aria-haspopup="dialog"><span class="ti">${ic('dots', 's22')}</span>Plus</button>
</nav>
<template id="encre-plus">
  <div class="q-tuiles plus-t">
    <button type="button" class="qt" data-encre-recherche>${ic('search', 's22')}Rechercher</button>
    <a class="qt" href="/admin#apparence">${ic('palette', 's22')}Apparence</a>
    <a class="qt" href="/admin#jetons">${ic('key', 's22')}Jetons</a>
    <a class="qt" href="/admin#maj">${ic('refresh', 's22')}Mise à jour</a>
  </div>
  <a class="q-ext" href="/admin#acces">${ic('shield')}Accès Cloudflare</a>
  <a class="q-ext" href="/admin#envois">${ic('upload')}Taille maximale d'envoi</a>
  ${logoutForm('form-plus', `${ic('logout')}Se déconnecter`)}
</template>
<div id="mo-donnees" hidden
  data-cap-dossiers="${e(JSON.stringify(data?.capDossiers ?? []))}"
  data-cap-tags="${e(JSON.stringify(data?.capTags ?? []))}"
  data-clip-dossiers="${e(JSON.stringify(data?.clipDossiers ?? []))}"
  data-clip-tags="${e(JSON.stringify(data?.clipTags ?? []))}"></div>`
    : `<div class="main">
  <header class="top">${brand()}<span class="esp"></span></header>
  <main class="pages anim-in">
${content}
  </main>
</div>`;

  return `${HTML_OPEN}
<head>
${head(title, opts.head ?? '')}
</head>
<body data-page="${page}"${showNav ? '' : ' class="page-simple"'}>
${shell}
</body>
</html>`;
}

/**
 * Layout des écrans d'ACCÈS centrés (connexion, secours, première config,
 * 403, erreurs) : mêmes feuilles de style que le reste du site, sans les
 * barres de navigation (classe `login-page` du design).
 */
export function socleLayout(
  title: string,
  content: string,
  opts: { bodyClass?: string } = {}
): string {
  return `${HTML_OPEN}
<head>
${head(title)}
</head>
<body class="${e(opts.bodyClass ?? 'login-page')}">
${content}
</body>
</html>`;
}

/** Bloc de logo des cartes d'accès. */
export function loginLogo(): string {
  return `<div class="login-logo"><span class="marque" aria-hidden="true">m</span><span class="wm">multi<b>outils</b></span></div>`;
}

/** Carte d'accès « message » : icône, titre, texte (accès refusé, erreurs…). */
export function accessCard(o: {
  icone: string;
  ton: 'acc' | 'warn' | 'err' | 'ok';
  titre: string;
  texte: string;
  note?: string;
  actions?: string;
}): string {
  return `<div class="login-card">
    ${loginLogo()}
    <div class="access-icon ${o.ton}">${ic(o.icone)}</div>
    <h1 class="h-acces">${o.titre}</h1>
    <p class="access-text">${o.texte}</p>
    ${o.note ? `<p class="access-note">${o.note}</p>` : ''}
    ${o.actions ?? ''}
  </div>`;
}

/** « 2026-11-04T10:01:… » → « 04/11/2026 10:01 » (heure telle qu'enregistrée). */
export function dateFr(iso: string | null | undefined): string {
  const s = String(iso ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return e(s);
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
}

/**
 * Filtres d'une liste (galerie, clips) : en ligne sur ordinateur, dans une
 * feuille du bas sur téléphone (bouton « Filtres », géré par site.js).
 * `actifs` = puces des filtres en cours, chacune avec le lien qui la retire.
 */
export function filtersBlock(o: {
  id: string;
  action: string;
  champs: string;
  resetHref: string;
  actifs: Array<{ label: string; href: string }>;
}): string {
  const n = o.actifs.length;
  return `<div class="filtres-barre">
    <button class="btn sm filtres-btn" type="button" data-filtres="${o.id}">${ic('filter', 's16')}Filtres${
      n ? `<span class="pastille">${n}</span>` : ''
    }</button>
    ${
      n
        ? `<div class="chips filtres-actifs">${o.actifs
            .map(
              (a) =>
                `<a class="chip on" href="${e(a.href)}" aria-label="Retirer le filtre ${e(a.label)}">${e(a.label)}${ic('x', 's16')}</a>`
            )
            .join('')}</div>`
        : ''
    }
  </div>
  <form class="filtres" id="${o.id}" method="get" action="${o.action}">
    ${o.champs}
    <div class="filtres-bts">
      <button class="btn pri sm" type="submit">${ic('filter', 's16')}Filtrer</button>
      <a class="btn sm gh" href="${o.resetHref}">Réinitialiser</a>
    </div>
  </form>`;
}

/** Un champ de filtre : libellé + liste déroulante. */
export function selectField(
  label: string,
  name: string,
  values: Set<string>,
  current: string | undefined,
  tous: string
): string {
  const opts = [...values]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => `<option value="${e(v)}"${v === current ? ' selected' : ''}>${e(v)}</option>`)
    .join('');
  return `<label class="filtre-champ"><span class="lbl">${label}</span><select class="select" name="${name}"><option value="">${tous}</option>${opts}</select></label>`;
}

/** Page d'erreur dans l'application (avec les menus). */
export function errorBlock(o: { titre: string; texte: string; retour: { href: string; label: string } }): string {
  return `<div class="carte vide erreur-p">
    ${ic('alert')}
    <b>${o.titre}</b>
    <span>${o.texte}</span>
    <a class="btn sm" href="${o.retour.href}">${ic('chevl', 's16')}${o.retour.label}</a>
  </div>`;
}
