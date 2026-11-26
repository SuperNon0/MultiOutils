/* =========================================================================
   appli/electron/main.js — le site au design « encre » empaqueté en
   application Windows (.exe) et Mac (.dmg) avec Electron.

   Le site lui-même ne change pas : la fenêtre charge site/index.html.
   Ce fichier ne fait que trois choses en plus :
   1. ouvrir une fenêtre dont le fond est déjà celui du design (pas d'éclair
      blanc au démarrage), dans le bon style (Encre / Verre) et le bon thème ;
   2. suivre Réglages → Apparence : quand la page change de style ou de thème,
      la barre de titre (thème natif) et le fond de la fenêtre suivent, et le
      choix est gardé pour le prochain démarrage ;
   3. ouvrir les liens externes dans le navigateur, jamais dans l'appli.

   Même principe que MultiOutils (desktop-app/src/main/windows.ts).
   ========================================================================= */
const { app, BrowserWindow, nativeTheme, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/* Fonds (= --bg) de chaque style et thème : encre.css et verre.css. */
const FONDS = {
  encre: { sombre: "#0b0f17", clair: "#f5f3ee" },
  verre: { sombre: "#08102a", clair: "#e7eefc" },
};

/* Dernière apparence connue, gardée dans le dossier de l'appli. */
const FICHIER = () => path.join(app.getPath("userData"), "apparence.json");
function lire() {
  try { return { style: "encre", theme: "auto", ...JSON.parse(fs.readFileSync(FICHIER(), "utf8")) }; }
  catch { return { style: "encre", theme: "auto" }; }
}
function ecrire(p) {
  try { fs.writeFileSync(FICHIER(), JSON.stringify(p)); } catch { /* disque en lecture seule : tant pis */ }
}

let apparence = { style: "encre", theme: "auto" };
let fenetre = null;

function fond() {
  const sombre = apparence.theme === "auto" ? nativeTheme.shouldUseDarkColors : apparence.theme === "sombre";
  const f = FONDS[apparence.style] || FONDS.encre;
  return sombre ? f.sombre : f.clair;
}

function appliquer() {
  // Thème natif : barre de titre, menus du système et prefers-color-scheme de la page.
  nativeTheme.themeSource = apparence.theme === "sombre" ? "dark" : apparence.theme === "clair" ? "light" : "system";
  if (fenetre && !fenetre.isDestroyed()) fenetre.setBackgroundColor(fond());
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 380,              // assez étroit pour voir la version téléphone
    minHeight: 560,
    show: false,
    backgroundColor: fond(),
    autoHideMenuBar: true,      // Windows : pas de barre de menus
    title: app.getName(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  fenetre.once("ready-to-show", () => fenetre.show());

  // Liens externes : dans le navigateur.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  fenetre.webContents.on("will-navigate", (e, url) => {
    if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  fenetre.loadFile(path.join(__dirname, "site", "index.html"));
}

/* La page signale son apparence (voir preload.js). */
ipcMain.on("encre:apparence", (_e, p) => {
  const style = p && p.style === "verre" ? "verre" : "encre";
  const theme = p && ["auto", "clair", "sombre"].includes(p.theme) ? p.theme : "auto";
  if (style === apparence.style && theme === apparence.theme) return;
  apparence = { style, theme };
  ecrire(apparence);
  appliquer();
});

nativeTheme.on("updated", () => {
  if (fenetre && !fenetre.isDestroyed()) fenetre.setBackgroundColor(fond());
});

app.whenReady().then(() => {
  apparence = lire();
  appliquer();
  creerFenetre();
  // Mac : recliquer sur l'icône du Dock rouvre la fenêtre.
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) creerFenetre(); });
});

// Windows : fermer la dernière fenêtre quitte. Mac : l'appli reste dans le Dock.
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
