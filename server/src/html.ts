/** Rendu HTML minimaliste de l'interface web (thème CDC, responsive). */

export function e(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function layout(
  title: string,
  content: string,
  opts: { nav?: boolean; active?: 'gallery' | 'clips' | 'admin' | 'reglages' } = {}
): string {
  const nav = opts.nav
    ? `<nav class="topnav">
        <span class="brand">Multi<span class="accent">Outils</span></span>
        <a href="/"${opts.active === 'gallery' ? ' class="active"' : ''}>Galerie</a>
        <a href="/clips"${opts.active === 'clips' ? ' class="active"' : ''}>Clips</a>
        <a href="/admin"${opts.active === 'admin' ? ' class="active"' : ''}>Administration</a>
        <a href="/reglages"${opts.active === 'reglages' ? ' class="active"' : ''}>Réglages</a>
        <form method="post" action="/logout" class="logout"><button type="submit">Déconnexion</button></form>
      </nav>`
    : '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} · MultiOutils</title>
<link rel="stylesheet" href="/public/style.css">
</head>
<body>
${nav}
<main class="page">
${content}
</main>
</body>
</html>`;
}

/**
 * Layout au THÈME PARTAGÉ du socle (`/public/socle/*`) — utilisé par les pages
 * qui doivent avoir le même rendu que mes autres sites : connexion, mot de passe
 * oublié, première configuration et l'écran de réglages. La page de login
 * reproduit `socle-lite/panel/templates/login.html` à l'identique (mêmes classes).
 */
export function socleLayout(
  title: string,
  content: string,
  opts: { topbar?: boolean; bodyClass?: string } = {}
): string {
  const topbar = opts.topbar
    ? `<header class="topbar">
        <a class="brand" href="/" title="Accueil" style="text-decoration:none;color:inherit">
          <img class="logo-mark" src="/public/socle/logo.svg" alt="" width="30" height="30">
          <span class="logo"><span class="g">multi</span><span class="i">outils</span></span>
        </a>
        <span class="badge">réglages</span>
        <form method="post" action="/logout" class="logout" style="margin-left:auto">
          <button class="btn small" type="submit">Déconnexion</button>
        </form>
      </header>`
    : '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0e0f11">
<title>${e(title)} · MultiOutils</title>
<link rel="icon" href="/public/socle/logo.svg">
<link rel="stylesheet" href="/public/socle/fonts.css">
<link rel="stylesheet" href="/public/socle/style.css">
<link rel="stylesheet" href="/public/socle/reglages.css">
</head>
<body class="${e(opts.bodyClass ?? '')}">
${topbar}
${content}
</body>
</html>`;
}
