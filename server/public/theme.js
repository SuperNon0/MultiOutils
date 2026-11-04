/* Avant l'affichage : accent et thème gardés sur cet appareil (rien ne
   clignote). Fichier à part (et non script en ligne) pour garder la CSP
   `script-src 'self'`. Chargé sans defer, tout en haut de <head>. */
try {
  var p = JSON.parse(localStorage.getItem("encre-apparence") || "{}"), h = document.documentElement;
  if (p.accent) h.dataset.accent = p.accent;
  if (p.theme === "sombre") h.dataset.theme = "dark";
  else if (p.theme === "clair") h.dataset.theme = "light";
  else { h.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; h.dataset.encreAuto = ""; }
} catch (e) {}
