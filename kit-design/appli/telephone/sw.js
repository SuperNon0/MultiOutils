/* sw.js — service worker minimal : le site s'ouvre même sans réseau.
   Règle du design (section 2, n° 33) : le nom du cache suit la version du site.
   Change VERSION à chaque mise en ligne, sinon les téléphones gardent l'ancienne. */
const VERSION = "1.0.0";
const CACHE = "site-" + VERSION;
const FICHIERS = [
  "./", "./index.html",
  "./encre.css", "./verre.css", "./encre.js", "./polices.css", "./icones.svg",
  "./polices/archivo-latin.woff2", "./polices/dm-mono-400-latin.woff2",
  "./polices/dm-mono-500-latin.woff2", "./polices/dm-serif-display-latin.woff2",
  "./polices/dm-serif-display-italic-latin.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
/* Réseau d'abord (toujours la dernière version), cache si hors ligne. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)); return r; })
      .catch(() => caches.match(e.request))
  );
});
