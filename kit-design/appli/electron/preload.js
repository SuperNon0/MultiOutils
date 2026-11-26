/* =========================================================================
   appli/electron/preload.js — le lien entre la page et la fenêtre.

   La page n'a rien à faire : ce script lit les attributs que encre.js pose
   sur <html> (data-style, data-theme, data-encre-auto) au chargement et à
   chaque changement d'apparence, et les transmet à main.js.
   Il ajoute aussi window.appli (plateforme) et la classe « appli » sur
   <html> : une page peut s'en servir pour cacher ce qui n'a de sens que dans
   un navigateur (bouton « Installer », lien vers l'appli…).
   ========================================================================= */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appli", {
  plateforme: process.platform,   // "win32", "darwin" ou "linux"
});

function signaler() {
  const h = document.documentElement;
  ipcRenderer.send("encre:apparence", {
    style: h.dataset.style === "verre" ? "verre" : "encre",
    theme: "encreAuto" in h.dataset ? "auto" : h.dataset.theme === "light" ? "clair" : "sombre",
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const h = document.documentElement;
  const os = { darwin: "mac", win32: "win" }[process.platform] || "linux";
  h.classList.add("appli", "appli-" + os);   // appli-win, appli-mac ou appli-linux
  signaler();
});
// encre.js envoie cet évènement après chaque changement dans Réglages → Apparence.
document.addEventListener("encre:apparence", () => signaler());
