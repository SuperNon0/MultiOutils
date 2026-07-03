# 📸 Cahier des Charges — MultiOutils

> Logiciel multi-fonctions de capture et de gestion d'écran pour Windows
>
> **Version du CDC :** 1.2 · **Date :** 2026-07-03 · **Statut :** Validé (avant développement)

> 📚 **Ce fichier est la vue d'ensemble.** La **spécification détaillée pour développer**
> (chaque fonction décrite précisément, pour un dev humain ou une IA) est dans le dossier
> [`docs/`](docs/), et l'installation du serveur dans [`install/`](install/).
> Commence par [`docs/README.md`](docs/README.md).

---

## 1. Vision du projet

**MultiOutils** est une **boîte à outils modulaire** pour Windows : une application légère
qui vit dans la **barre des tâches** (system tray), se lance au démarrage du PC, et
accueille plusieurs **outils indépendants**. Le **premier outil** est la **capture
d'écran** (capturer → éditer/annoter → gérer → partager → accéder à distance) :

> Capturer → Éditer / Annoter → Gérer dans une bibliothèque → Partager / Accéder à distance

**Point clé :** la capture n'est **pas le seul système**. L'app est un **hôte** conçu pour
**ajouter d'autres outils sans toucher aux existants** (voir
[`docs/01-architecture.md`](docs/01-architecture.md) §2). Modules à venir : OCR, pipette
de couleur, puis d'autres.

---

## 2. Choix techniques validés

| Élément | Choix |
|---|---|
| **Application bureau** | Electron + TypeScript |
| **Éditeur d'images** | Canvas HTML (Konva.js ou Fabric.js) |
| **Serveur auto-hébergé** | Node.js (Express) + SQLite + stockage fichiers, sur **Proxmox** (VM/LXC) |
| **Accès distant** | **Cloudflare Tunnel** (`cloudflared`) + Cloudflare Access |
| **Plugin Stream Deck** | SDK officiel Elgato (JS/HTML) |
| **Dépôt GitHub** | Public, en monorepo |
| **Mises à jour** | À la demande (bouton) — logiciel via `electron-updater`, site via `git pull` |
| **CI/CD** | GitHub Actions (build automatique de l'installeur `.exe`) |

### Organisation du dépôt (monorepo)

```
MultiOutils/
├── CDC.md                  # Ce document
├── README.md
├── desktop-app/            # 1) Logiciel Electron (capture, éditeur, galerie)
├── server/                 # 2) Serveur auto-hébergé + interface web distante
├── streamdeck-plugin/      # 3) Plugin Stream Deck
└── .github/workflows/      # CI/CD (build automatique)
```

---

## 3. Fonctionnalités — CAPTURE 🎯

| Fonction | Description | Priorité |
|---|---|---|
| Capture plein écran | Tout l'écran en un raccourci | MVP |
| Capture zone / région | Sélection d'un rectangle à la souris | MVP |
| Capture fenêtre active | La fenêtre au premier plan uniquement | MVP |
| Multi-écran | Choix de l'écran si plusieurs moniteurs | MVP |
| Capture différée | Délai 3 / 5 / 10 s (utile pour menus déroulants) | V1 |
| Capture défilante | Page / document long qui scrolle | Avancé |
| Raccourcis clavier globaux | Personnalisables (ex. `Impr. écran`, `Ctrl+Shift+2`) | MVP |
| Auto-copie presse-papier | La capture est directement disponible en `Ctrl+V` | MVP |

---

## 4. Fonctionnalités — ÉDITEUR / ANNOTATION 🎨

| Fonction | Description | Priorité |
|---|---|---|
| **Formes** | Carré/rectangle, cercle/ellipse, triangle, ligne, **flèche**, polygone | V1 |
| **Texte** | Ajout de texte : police, taille, couleur, gras/italique, contour | V1 |
| **Dessin libre** | Crayon / pinceau + gomme | V1 |
| **Surlignage** | Marqueur semi-transparent | V1 |
| **Flou / pixellisation** 🔒 | Masquer les infos sensibles (mots de passe, visages, IP) | V1 |
| **Numérotation d'étapes** | Ronds numérotés 1, 2, 3… (idéal pour les tutos) | V1 |
| Recadrage (crop) | Rogner la capture | V1 |
| Redimensionnement / rotation | Ajuster la taille et l'orientation | V1 |
| Loupe / zoom | Zoomer dans l'éditeur | V1 |
| Couleurs & épaisseur | Réglables + palette de presets | V1 |
| **Annuler / Refaire** | Undo / redo illimité | V1 |
| Calques | Chaque annotation reste modifiable / déplaçable après coup | Avancé |
| Effet ombre / bordure / fond | Rendu « joli » pour partage réseaux sociaux | Avancé |

---

## 5. Fonctionnalités — BIBLIOTHÈQUE LOCALE 🗂️

| Fonction | Description | Priorité |
|---|---|---|
| Galerie | Vignettes de toutes les captures | MVP |
| Tri | Par date, nom, taille | V1 |
| Recherche | Recherche texte | V1 |
| Tags / étiquettes | Classer par mots-clés | V1 |
| Dossiers | Organisation en dossiers | V1 |
| Favoris ⭐ | Marquer les captures importantes | V1 |
| Renommer / supprimer | Gestion des fichiers | MVP |
| Corbeille | Restauration des captures supprimées | V1 |
| Aperçu rapide | Prévisualisation sans ouvrir l'éditeur | MVP |
| Double-clic → éditeur | Ouverture directe pour édition | MVP |
| Métadonnées | Date, résolution, écran source | V1 |

---

## 6. EXPORT / PARTAGE 📤

| Fonction | Description | Priorité |
|---|---|---|
| Enregistrer | PNG / JPG / WebP | MVP |
| Copier presse-papier | Image dans le `Ctrl+V` | MVP |
| Glisser-déposer | Vers une autre application | V1 |
| Export PDF | Plusieurs captures en un PDF | Bonus |

---

## 7. Fonctionnalités — SYSTÈME ⚙️

| Fonction | Description | Priorité |
|---|---|---|
| **Lancement au démarrage** | Activable / désactivable dans les paramètres | MVP |
| **Icône barre des tâches** | System tray + menu clic-droit | MVP |
| **Mise à jour à la demande** | Bouton « Mettre à jour » → télécharge et installe la dernière version depuis GitHub Releases | V1 |
| Paramètres | Raccourcis, dossier de sauvegarde, options | MVP |
| Thème clair / sombre | Choix de l'apparence | V1 |
| Langues | Français / Anglais | V1 |

### Stratégie de mise à jour (logiciel ET site)

Le dépôt GitHub étant **public**, aucune authentification supplémentaire (token,
deploy key) n'est nécessaire. Deux mises à jour **déclenchées à la demande, via un
bouton** :

| Cible | Déclencheur | Mécanisme |
|---|---|---|
| **Logiciel** (app Electron) | Bouton « Mettre à jour » dans l'app | `electron-updater` télécharge la dernière **GitHub Release** et installe |
| **Site** (serveur Proxmox) | Bouton « Mettre à jour le site » dans l'interface admin | `git pull` du dépôt public + redémarrage du service |

> Une mise à jour **automatique du site** (GitHub Actions / webhook à chaque `push`)
> reste possible en option, mais le mode par défaut est **manuel (bouton)**.
>
> Note : si le dépôt passait un jour en **privé**, il faudrait ajouter une *deploy key*
> (clé SSH en lecture seule) pour que le serveur puisse se mettre à jour.

---

## 8. Module — ACCÈS DISTANT AUTO-HÉBERGÉ 🌐

Permet d'accéder à ses captures **à distance** (depuis le téléphone, le travail, etc.)
via un **serveur hébergé chez soi** (PC, Raspberry Pi, NAS).

### Principe

- **Synchro à la demande** : ✅ *seules les captures choisies* sont envoyées au serveur
  (bouton « Envoyer sur mon serveur » sur chaque capture). Rien n'est envoyé
  automatiquement.
- **Interface web** : galerie responsive (mobile) pour consulter / télécharger les
  captures à distance.

### Architecture

| Brique | Rôle |
|---|---|
| Serveur | Service Node.js (Express) tournant 24/7 chez l'utilisateur |
| Base de données | SQLite (métadonnées, tags) |
| Stockage | Dossier local pour les images |
| App ↔ Serveur | L'app pousse les captures sélectionnées via une API sécurisée |
| Interface web | Galerie responsive, recherche, tags, téléchargement |

### Hébergement (infrastructure de l'utilisateur)

- **Proxmox** : le serveur tourne dans une **VM ou un conteneur LXC** (éventuellement
  en Docker à l'intérieur) sur l'hyperviseur Proxmox de l'utilisateur.

### Accès depuis l'extérieur (méthode retenue)

1. **Cloudflare Tunnel** (`cloudflared`) 🥇 *(retenu)* — accès distant **sans ouvrir de
   port** sur la box, **HTTPS automatique**, et **Cloudflare Access** possible en amont
   (authentification par email / code).
2. *(alternatives)* Reverse proxy + domaine (Nginx/Caddy + Let's Encrypt) ou redirection
   de port — non retenues, Cloudflare Tunnel est privilégié.

### Sécurité

- Authentification par **login / mot de passe** obligatoire (+ Cloudflare Access en amont).
- **HTTPS** obligatoire (fourni par Cloudflare).
- Aucune capture accessible publiquement sans authentification.

---

## 9. Module — PLUGIN STREAM DECK 🎛️

Boutons Stream Deck (Elgato) pour piloter l'application :

- Déclencher : capture plein écran / zone / fenêtre / différée
- Ouvrir la bibliothèque
- Copier la dernière capture dans le presse-papier

Communication app ↔ Stream Deck via l'**API officielle Elgato**.

---

## 10. Modules bonus retenus

| Module | Description | Statut |
|---|---|---|
| 🌐 Accès distant auto-hébergé | Voir §8 | ✅ Retenu |
| 🔤 **OCR** | Extraire le texte d'une capture → copier | ✅ Retenu |
| 🎨 **Color picker / pipette** | Récupérer le code couleur d'un pixel à l'écran | ✅ Retenu |

### Idées pour plus tard (roadmap ouverte)

- 🎥 Enregistrement vidéo d'écran + GIF animé
- 📏 Règle / mesure de pixels
- ☁️ Synchro cloud (Google Drive / Dropbox)
- 🔖 Historique du presse-papier
- 💧 Watermark automatique
- 🔌 Système de plugins pour ajouter ses propres outils
- 🌐 Générateur de QR code, notes rapides…

---

## 11. Découpage en phases 📅

| Phase | Contenu | Livrable |
|---|---|---|
| **Phase 1 — MVP** | Capture (plein écran / zone / fenêtre / multi-écran), raccourcis, system tray, démarrage auto, galerie de base | App qui capture et affiche |
| **Phase 2 — Éditeur** | Formes, texte, flèches, flou, numérotation, undo/redo | Éditeur complet |
| **Phase 3 — Bibliothèque** | Galerie avancée, tags, dossiers, favoris, corbeille, export/partage | Gestion complète |
| **Phase 4 — Mises à jour** | Auto-update GitHub + CI/CD (build `.exe`) | Distribution auto |
| **Phase 5 — Accès distant** | Serveur auto-hébergé + interface web | Accès à distance |
| **Phase 6 — Stream Deck** | Plugin Elgato | Contrôle Stream Deck |
| **Phase 7 — Bonus** | OCR, color picker | Outils supplémentaires |

---

## 12. Récapitulatif de la demande

- **Capture** : plein écran, zone, fenêtre, multi-écran, différée, raccourcis, auto-presse-papier
- **Éditeur** : carré / rond / triangle / flèche / ligne, texte, dessin libre, surlignage,
  flou (masquer infos), numérotation d'étapes, crop / rotation, couleurs / épaisseur, undo/redo
- **Bibliothèque locale** : galerie, tri, recherche, tags, dossiers, favoris, corbeille
- **Export / partage** : PNG / JPG, presse-papier, glisser-déposer
- **Système** : lancement au démarrage, system tray, mise à jour auto GitHub, paramètres,
  thème clair/sombre, FR/EN
- **Accès distant** : serveur auto-hébergé sur Proxmox, accès via Cloudflare Tunnel,
  synchro à la demande, interface web sécurisée, mise à jour du site par bouton
- **Stream Deck** : boutons pour déclencher les captures
- **Bonus** : OCR, color picker

---

*Document de référence. Le développement démarrera sur validation finale.*
