/* =========================================================================
   appli/electron/preparer.js — remplit site/ avant de lancer ou d'empaqueter.

   - Si site/index.html existe déjà (ton vrai site, copié là), on n'y touche pas.
   - Sinon, on y copie le modèle du kit (modele.html devient index.html) et
     les fichiers du design, pour avoir tout de suite une appli qui marche.
   ========================================================================= */
const fs = require("node:fs");
const path = require("node:path");

const kit = path.resolve(__dirname, "..", "..");
const site = path.join(__dirname, "site");

if (fs.existsSync(path.join(site, "index.html"))) {
  console.log("site/index.html existe : on garde ton site tel quel.");
  process.exit(0);
}

fs.mkdirSync(site, { recursive: true });
for (const f of ["encre.css", "verre.css", "encre.js", "polices.css", "icones.svg"]) {
  fs.copyFileSync(path.join(kit, f), path.join(site, f));
}
fs.cpSync(path.join(kit, "polices"), path.join(site, "polices"), { recursive: true });
fs.copyFileSync(path.join(kit, "modele.html"), path.join(site, "index.html"));
console.log("site/ rempli avec le modèle du kit (index.html + design).");
