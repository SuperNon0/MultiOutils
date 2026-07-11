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
  opts: { nav?: boolean; active?: 'gallery' | 'clips' | 'admin' } = {}
): string {
  const nav = opts.nav
    ? `<nav class="topnav">
        <span class="brand">Multi<span class="accent">Outils</span></span>
        <a href="/"${opts.active === 'gallery' ? ' class="active"' : ''}>Galerie</a>
        <a href="/clips"${opts.active === 'clips' ? ' class="active"' : ''}>Clips</a>
        <a href="/admin"${opts.active === 'admin' ? ' class="active"' : ''}>Administration</a>
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
