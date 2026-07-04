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
