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
  const pill = (href: string, label: string, key: string): string =>
    `<a class="navpill${opts.active === key ? ' active' : ''}" href="${href}">${label}</a>`;
  const nav = opts.nav
    ? `<nav class="topnav">
        <a class="brand" href="/">
          <img class="brand-mark" src="/public/logo.svg" width="28" height="28" alt="">
          <span class="brand-word">multi<span class="accent">outils</span></span>
        </a>
        <div class="topnav-links">
          ${pill('/', 'Galerie', 'gallery')}
          ${pill('/clips', 'Clips', 'clips')}
          ${pill('/admin', 'Administration', 'admin')}
        </div>
        <form method="post" action="/logout" class="logout"><button type="submit">Déconnexion</button></form>
      </nav>`
    : '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} · MultiOutils</title>
<meta name="theme-color" content="#0e0f11">
<link rel="icon" href="/public/logo.svg">
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
 * Layout des pages d'ACCÈS centrées (connexion, secours, première config, 403).
 * Utilise EXACTEMENT la même feuille de style que le reste du site
 * (`/public/style.css`) pour un rendu 100 % cohérent — juste sans la barre de
 * navigation, et avec un contenu centré (classe `login-page`).
 */
export function socleLayout(
  title: string,
  content: string,
  opts: { bodyClass?: string } = {}
): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0e0f11">
<title>${e(title)} · MultiOutils</title>
<link rel="icon" href="/public/logo.svg">
<link rel="stylesheet" href="/public/style.css">
</head>
<body class="${e(opts.bodyClass ?? '')}">
${content}
</body>
</html>`;
}
