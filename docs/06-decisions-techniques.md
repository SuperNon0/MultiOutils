# 06 · Décisions techniques (journal)

> Ce document complète la spec quand l'implémentation a dû trancher un détail.
> Chaque entrée rappelle le contexte, la décision et l'éventuelle amélioration prévue.

## Phase 1 — MVP capture

### Outillage
- **electron-vite** orchestre les trois cibles (main / preload / renderer) avec HMR en
  dev et bundling en prod. `@multioutils/shared` (TypeScript source, workspace) est
  bundlé plutôt qu'externalisé.
- **npm workspaces** (`packages/shared`, `desktop-app` ; `server` et
  `streamdeck-plugin` seront ajoutés à leurs phases).
- La version d'**Electron est épinglée** (exigence d'`electron-builder
  install-app-deps` pour recompiler les modules natifs comme better-sqlite3).
- **CI** (`.github/workflows/ci.yml`) : tests + typecheck + build des bundles à chaque
  push. Le build de l'installeur `.exe` + publication GitHub Releases arrive en Phase 4.

### Interface ToolModule répartie main / renderer
Le contrat `ToolModule` de `docs/01 §2.1` mélange des responsabilités UI (panneau
React) et système (raccourcis globaux, menu du tray). Or dans Electron, tray,
`globalShortcut` et capture native vivent **dans le process main**. Le contrat est donc
scindé en deux moitiés, chacune enregistrée dans un registre :

| Côté | Contrat | Registre |
|---|---|---|
| renderer | `ToolModule` (`renderPanel`, `settingsPanel`) — `src/renderer/src/host/types.ts` | `src/renderer/src/registry.ts` |
| main | `MainToolModule` (`activate`, `trayMenuItems`) + IPC du module — `src/main/module-registry.ts` | enregistré dans `src/main/index.ts` |

La règle d'isolation reste inchangée : un module ne référence jamais un autre module ;
tout passe par `HostContext` (renderer) / `MainHostContext` (main). Ajouter un outil =
un dossier `src/renderer/src/modules/<outil>/` (+ éventuellement
`src/main/modules/<outil>/`) et une ligne dans chaque registre.

### Capture de fenêtre : sélecteur au lieu du survol
La spec décrit « surligne la fenêtre survolée, clic pour capturer ». Electron n'expose
pas la **géométrie des fenêtres des autres applications**, indispensable pour dessiner
le surlignage. Phase 1 : un **sélecteur** (grille de vignettes des fenêtres ouvertes,
clic = capture, Échap annule). Amélioration prévue : addon natif win32
(EnumWindows/DwmGetWindowAttribute) pour le vrai survol + bordures exactes.

### Plein écran « tous les écrans »
Composition manuelle des bitmaps de chaque moniteur sur un canevas unique, à l'échelle
du plus grand `scaleFactor` (positions réelles respectées, DPI hétérogènes gérés).

### Limitations assumées (Phase 1)
- **WebP** : `nativeImage` n'encode que PNG/JPEG. L'option WebP arrivera avec
  l'éditeur (export via canvas Konva). Formats proposés : PNG / JPG.
- **Inclure le curseur** : non supporté par `desktopCapturer` ; l'option existe mais
  est grisée. À revisiter avec l'addon natif.
- **Barre d'actions rapides** : disparaît après ~6 s (survol = pause) et après chaque
  action ; la fermeture « au clic ailleurs » viendra quand la barre sera focusable sans
  voler le focus.
- **Éditer** (barre rapide / double-clic) ouvre la bibliothèque avec un grand aperçu en
  attendant l'éditeur (Phase 2).

### Stockage & médias
- Réglages dans la table `settings` (clé/valeur JSON) — pas d'electron-store.
- Vignettes en cache dans `<dossier de stockage>/.thumbs/<id>.png`, générées à la
  capture (galerie fluide, docs/00 §10). Le chemin dérive du chemin de l'image pour
  survivre à un changement de dossier de stockage.
- Protocole interne **`mo-media://capture/<id>`** / **`mo-media://thumb/<id>`** : la
  galerie affiche les images sans désactiver la sécurité web du renderer ; la
  résolution id → fichier reste dans le process main.

### i18n
Dictionnaires JSON uniques (`desktop-app/src/i18n/{fr,en}.json`) consommés par le main
(tray, notifications) ET le renderer. FR par défaut, EN fourni.

### Divers
- Icônes `resources/icon.png` (256) et `resources/tray.png` (32) générées, motif
  « viseur » doré sur fond sombre (thème CDC).
- CSP du renderer : `script-src 'unsafe-inline'` requis en dev (préambule
  react-refresh de Vite) ; en prod tous les scripts sont des fichiers externes.
- Renommer une capture change son **nom affiché** (`filename` en base) ; le fichier sur
  disque garde son nom (le chemin reste la vérité de stockage).

## Phase 2 — Éditeur

### Modèle « original + calque vectoriel »
`Enregistrer` écrase le fichier de la bibliothèque avec l'image **aplatie**
(annotations incluses), comme le veut la spec. Pour que la **ré-édition** reparte
toujours des pixels d'origine, l'image originale est copiée dans
`.originals/<id>.<ext>` **avant le premier écrasement**. L'éditeur charge
`mo-media://original/<id>` (l'original s'il existe, sinon le fichier courant) et le
calque JSON (`captures.annotations`). Suppression définitive = image + vignette +
original.

### Choix d'implémentation
- **Konva + react-konva** ; les objets sont du **state React** (déclaratif), l'historique
  undo/redo est une pile de snapshots du document (illimité). Les déplacements /
  redimensionnements ne committent qu'au relâchement (dragend / transformend).
- **Flou / pixellisation** : nœud `Konva.Image` recadré sur la zone + filtre
  `Blur`/`Pixelate` avec cache — le rendu masque réellement les pixels exportés.
- **Recadrage non destructif** : stocké dans le document (`doc.crop`), l'export et
  l'affichage découpent ; modifiable/annulable à tout moment (le crop participe à
  l'undo).
- **WebP disponible à l'export** de l'éditeur (encodage canvas Chromium), alors que le
  format de capture par défaut reste PNG/JPG (limite `nativeImage`, cf. Phase 1).
- **Export** : `stage.toDataURL(pixelRatio = 1/zoom)` → toujours à la résolution
  native, quel que soit le zoom d'affichage. L'image de base est chargée via
  `fetch(mo-media://…) → blob:` pour éviter tout canvas « tainted ».
- **Gomme** = suppression d'objets au clic (les pixels de fond ne sont jamais gommés),
  conformément à la spec.
- **Presets de style** : reportés (les couleurs récentes sont là) ; « calques » et
  « effet cadre » sont marqués *Avancé* dans la spec → hors Phase 2.
- Raccourcis éditeur conformes à docs/00 §3 (+ `G` triangle et `E` gomme, non listés
  dans la spec).

## Phase 3 — Bibliothèque avancée

### Requêtes combinables
`library:list` prend une requête à filtres orthogonaux (dossier OU favoris OU non
triées OU envoyées, + date, + recherche nom, + tags en ET logique, + tri) traduite en
SQL dans `CaptureRepo.query`. Les dossiers intelligents datés (« Aujourd'hui », « Cette
semaine » = depuis lundi, « Ce mois-ci ») calculent leur borne côté renderer en heure
locale ; le filtre de date de la barre d'outils est combinable avec n'importe quelle
source (docs/03 §5).

### Glisser-déposer : un seul geste, deux usages
Le drag d'une carte démarre un **drag natif** (`webContents.startDrag`, fichiers
réels) :
- déposé sur un dossier de la barre latérale → les chemins sont relus via
  `webUtils.getPathForFile` puis résolus en ids (`library:dropPaths`) → rangement ;
- déposé sur une autre application (Explorateur, mail…) → copie du fichier, ce qui
  couvre « Glisser-déposer vers une autre application » (docs/00 §6, V1).

### Autres décisions
- **Suppression d'un dossier** : ses sous-dossiers remontent d'un niveau, ses captures
  redeviennent « Non triées » — aucune image supprimée.
- **Tags** : nom unique en base ; créer un tag existant renvoie l'existant.
- **Corbeille** : réglage « vider automatiquement après N jours » (0 = jamais,
  défaut 30), purge au démarrage du module.
- `window.prompt` n'existe pas dans Electron → création/renommage des dossiers et
  tags via des **éditeurs inline** dans la barre latérale (nom + couleur).
- Vue **grille/liste** et **taille des vignettes** persistées en localStorage.
- « Récemment envoyées au serveur » existe déjà (filtre `remote_state = 'sent'`) et se
  remplira en Phase 5.

## Phase 4 — Mises à jour & distribution

### Flux (docs/00 §5.3, respecté à la lettre)
`electron-updater` avec `autoDownload = false` : rien ne se télécharge sans clic.
Paramètres → Mises à jour : « Vérifier » → si version plus récente sur les GitHub
Releases → version + notes + « Télécharger et installer » → progression → « Redémarrer
et installer ». En mode dev (non packagé), le bouton explique que la mise à jour ne
s'applique qu'à l'app installée.

### Publier une version (mainteneur)
1. Monter `version` dans `desktop-app/package.json` (ex. `0.2.0`).
2. Commit, puis tag `v0.2.0` poussé sur GitHub.
3. Le workflow `build-desktop.yml` (runner Windows) construit
   `MultiOutils-Setup-0.2.0.exe` + `latest.yml` et publie la GitHub Release.
4. Les apps installées voient la mise à jour au prochain clic sur « Vérifier ».

Dépôt public → aucun jeton côté utilisateur ; le workflow utilise le
`GITHUB_TOKEN` fourni par Actions (permission `contents: write`).

## Phase 5 — Serveur auto-hébergé & envoi

### Côté serveur (`server/`)
- **Autonome** (aucune dépendance workspace) pour que le Dockerfile fonctionne avec le
  contexte `server/` seul (install/docker-compose.yml). Node 20 + Express 4 + SQLite.
- **Sécurité** (docs/00 §7.3) : mots de passe **et** jetons hachés **argon2id** (la
  vérification du jeton itère sur les jetons actifs — adapté au petit nombre de
  jetons) ; le jeton n'est affiché **qu'une fois** ; helmet + CSP ; `/media/:id`
  exige session OU jeton — **aucune image publique** ; upload limité
  (`MAX_UPLOAD_MB`, défaut 25) et types MIME png/jpeg/webp uniquement.
- **Sessions** : express-session (MemoryStore — mono-admin auto-hébergé ; un
  redémarrage déconnecte, documenté), secret persistant `data/.session-secret`,
  cookies HttpOnly/SameSite=Lax, `trust proxy` en production (Cloudflare Tunnel).
- **Bouton « Mettre à jour le site »** : `git pull --ff-only` + `npm install` +
  `npm run build -w server`, journal affiché, puis `process.exit(0)` → systemd/Docker
  relance sur le nouveau code. « Vérifier » = nombre de commits de retard.
- La galerie web sert l'image telle quelle (pas de vignettes serveur, pour éviter une
  dépendance native type sharp) — amélioration possible.
- Interface web en français (l'i18n FR/EN de la spec concerne l'application).

### Côté app
- Le **jeton** saisi dans Paramètres → Serveur distant est chiffré via
  `safeStorage` (DPAPI Windows) et **jamais renvoyé au renderer** (seul « un jeton
  est enregistré » est exposé).
- « Tester la connexion » vérifie `/api/health` (URL) puis un appel authentifié
  (jeton) — messages distincts « injoignable » / « jeton invalide ».
- Envoi TOUJOURS explicite : barre rapide, survol d'une carte, ou sélection en lot.
  États ⚪ (rien) / 🟢 / 🔴 sur les cartes ; ré-essai = re-cliquer « Envoyer ».
- Méta transmises : nom, date, dimensions, **chemin de dossier** (« Travail /
  Projet A ») et **noms de tags** (docs/03 §8) — le site filtre dessus.

## Phase 6 — Stream Deck

- **HTTP plutôt que WebSocket** pour le service local (docs/00 §8 laissait le
  choix) : plus simple, sans état, suffisant pour des déclenchements de commandes.
  Port fixe **41320**, lié à `127.0.0.1` (inaccessible depuis le réseau) ; si le port
  est pris, le service se désactive sans gêner l'app.
- **L'hôte reste générique** : `LocalService` n'expose que `GET /ping` et
  `POST /command/<id>` ; les commandes (`capture.fullscreen`, `library.open`,
  `clipboard.last`…) sont enregistrées par les modules via
  `ctx.registerLocalCommand` — un futur outil peut ajouter les siennes.
- Plugin **SDK Elgato v2** (`@elgato/streamdeck`, runtime Node 20, Stream Deck ≥ 6.5),
  **6 actions fixes** (une par entrée du tableau de la spec — pas d'inspecteur de
  propriétés nécessaire). Touche → POST localhost ; app absente → alerte ⚠ sur la
  touche. Icônes générées dans le thème (doré/sombre).
- Build : `npm run build -w streamdeck-plugin` (rollup) → `…sdPlugin/bin/plugin.js` ;
  installation par `streamdeck link` ou copie dans
  `%appdata%\Elgato\StreamDeck\Plugins` (voir streamdeck-plugin/README.md).

## Phase 7 — Modules bonus (pipette & OCR)

Les deux bonus sont de **vrais modules** : un dossier renderer + un dossier main
chacun, une ligne dans chaque registre — le module capture n'a pas été modifié
(critère docs/00 §11 « ajouter un outil sans modifier les autres » ✅). Au passage,
les utilitaires écran génériques (`captureDisplay`, `hideAppWindows`…) ont été
remontés dans `src/main/screen-utils.ts` (infra hôte) pour que la pipette ne dépende
pas du module screenshot.

### Pipette (`color-picker`)
- Overlay plein écran par moniteur sur image gelée (même patron que la capture de
  zone), **loupe pixel-perfect**, code couleur en direct sous le curseur.
- Clic = copie au format choisi (**HEX / RGB / HSL**, réglable dans le panneau et
  dans Paramètres → Pipette), **historique des 12 dernières couleurs** (re-copie au
  clic, re-formaté selon le format courant).
- Accessible depuis la barre latérale, le menu du tray, et la commande locale
  `colorpicker.start` (utilisable depuis un bouton Stream Deck personnalisé).

### OCR (`ocr`)
- Tesseract (**tesseract.js**) exécuté **côté main** (aucune ouverture de la CSP du
  renderer), import paresseux au premier usage, worker terminé après chaque analyse.
- **Compromis hors-ligne** : le modèle de langue (fra/eng, ~15 Mo) est téléchargé à
  la **première** utilisation puis mis en cache dans `userData/ocr-cache` — les
  analyses suivantes sont 100 % locales. C'est la seule fonctionnalité qui touche le
  réseau en dehors du serveur de l'utilisateur et des mises à jour, toujours sur
  action explicite.
- `asarUnpack` sur tesseract.js/tesseract.js-core (le worker thread doit charger ses
  fichiers hors de l'asar).
- Le panneau choisit une capture via l'**API bibliothèque de l'hôte** (pas de
  référence au module capture) ; langue FR/EN, texte affiché sélectionnable +
  bouton Copier.

## Déploiement du serveur (Proxmox / mise à jour)

Le serveur vit dans un monorepo, mais il est **autonome** (aucune dépendance
workspace). Sur un serveur, on ne veut surtout pas installer l'app Electron.

- **Isolation via `npm install --no-workspaces`** (exécuté dans `server/`) : npm ignore
  le `package.json` racine et n'installe que les dépendances du serveur — vérifié : 0
  paquet Electron/Konva. `--no-package-lock` garde l'arbre git propre pour que le
  bouton « Mettre à jour le site » (`git pull --ff-only`) ne rencontre pas de conflit.
- **Bouton « Mettre à jour le site »** (`server/src/update.ts`) : `git pull` puis
  `npm install --no-workspaces` + `npm run build` **dans `server/` uniquement**
  (auparavant il installait tout le monorepo au niveau racine → Electron sur le
  serveur, corrigé).
- **Script Proxmox interactif** (`install/proxmox-lxc.sh`) : pose les questions
  (ressources, réseau, **port**, branche, **token Cloudflare**) avec valeurs par défaut ;
  mode non-interactif via `ASSUME_YES=1` + variables. Installe `build-essential` +
  `python3` (modules natifs argon2 / better-sqlite3), clone en `--depth 1`, build isolé,
  service systemd (`node dist/index.js`).
- **Cloudflare Tunnel par token de connecteur** (Zero Trust) : `cloudflared service
  install <token>` — connexion **sortante**, aucun port ouvert sur la box. Le port du
  serveur reste interne au conteneur ; le tunnel mappe le hostname public →
  `localhost:<port>`. Changer le port = éditer `.env` (`PORT=`) + `systemctl restart
  multioutils`, puis ajuster le Public Hostname côté Cloudflare.
- **Branche** : tant que la PR n'est pas fusionnée dans `main`, le serveur n'existe que
  sur la branche de dev ; le script la propose par défaut (à repasser sur `main` après
  fusion). C'était la cause du « serveur qui ne s'installe pas ».

## Module Presse-papiers & partage iPhone (v0.2.0, docs/00 §9.4)

- **Surveillance par polling (900 ms)** : Electron n'expose aucun événement de
  changement du presse-papiers. Signature bon marché — SHA-1 du texte, ou
  dimensions + SHA-1 du bitmap brut (`toBitmap`, sans ré-encodage PNG) pour les
  images — pour ne réagir qu'aux vrais changements. Quand l'app recopie
  elle-même un élément, la signature est pré-armée pour ne pas le recapturer.
- **Contenus sensibles ignorés** : si les formats du presse-papiers contiennent
  un marqueur de gestionnaire de mots de passe
  (`ExcludeClipboardContentFromMonitorProcessing`, KeePass…), rien n'est
  enregistré.
- **Table `clips` créée par le module** (`ctx.db.exec` dans `activate`) : l'hôte
  n'est pas modifié — conforme au principe « ajouter un outil sans toucher aux
  autres » (docs/01 §2). Images stockées dans `userData/clips/`, miniature en
  data URL directement en base (le renderer n'accède à aucun fichier).
- **Rétention** : purge périodique des éléments **non épinglés** plus vieux que
  le délai réglé (1 h → 30 j, ou jamais) ; les épinglés survivent toujours.
- **Local-first respecté** : l'envoi d'un clip au serveur est un bouton
  explicite par élément. La **récupération** (pull) des clips serveur — partagés
  depuis l'iPhone — est automatique (30 s) mais désactivable ; elle ne fait que
  lire, dédup par `remote_id`.
- **iPhone via Raccourcis iOS** (docs/guide-iphone.md) : le menu Partager envoie
  `POST /api/clips` (JSON pour le texte, multipart pour les photos converties en
  JPEG — HEIC non supporté par nativeImage). Alternative sans configuration :
  page web `/clips/deposer`. Le choix « Raccourci » évite une app iOS native
  (compte développeur, App Store) pour un résultat natif équivalent.
- **Lecture des réglages `remote.*` par le module** : URL + jeton du serveur
  appartiennent à l'hôte (Paramètres → Serveur distant, chiffrés DPAPI) ; le
  module les lit, il ne les gère pas.

## Fiabilisation du bouton « Mettre à jour le site » (v0.2.1)

- **Bug corrigé — site mort après une mise à jour réussie** : l'unité systemd
  historique avait `Restart=on-failure` alors que la fin de mise à jour faisait
  `process.exit(0)` (sortie propre) → systemd ne relançait jamais le service.
  Correctifs : (1) `scheduleRestart` passe par un **timer transitoire
  `systemd-run`** (hors de notre cgroup) qui exécute `systemctl restart
  multioutils` après notre mort — fonctionne quelle que soit la politique
  Restart ; sans systemd (Docker), repli sur `exit(0)` +
  `restart: unless-stopped`. (2) L'unité créée par le script d'installation
  passe à `Restart=always`.
- **Mise à jour en arrière-plan + page de suivi** (`/admin/update/status`) :
  l'ancien POST bloquait la requête pendant `npm install` + build (plusieurs
  minutes) — Cloudflare Tunnel coupe à ~100 s. Désormais le POST répond
  immédiatement et la page de suivi (auto-rafraîchie) montre la progression,
  le succès (avec redémarrage) ou l'échec avec le journal complet. Le journal
  est aussi persisté dans `DATA_DIR/last-update.log` pour diagnostic après
  redémarrage.
- **« tsc: not found » lors de la mise à jour par le bouton** : le service tourne
  avec `NODE_ENV=production` (EnvironmentFile) ; l'étape `npm install` lancée
  par le bouton héritait de cette variable et npm **supprimait les
  devDependencies** (dont TypeScript) → build impossible. Correctif : les
  étapes de mise à jour s'exécutent dans un environnement **sans NODE_ENV** et
  l'install force `--include=dev`. Reproduit et vérifié : tsc supprimé +
  NODE_ENV=production → le bouton réinstalle et build avec succès.
