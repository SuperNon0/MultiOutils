# 📸 Cahier des Charges — MultiOutils

> Logiciel multi-fonctions de capture et de gestion d'écran pour Windows
>
> **Version du CDC :** 1.0 · **Date :** 2026-07-03 · **Statut :** Validé (avant développement)

---

## 1. Vision du projet

**MultiOutils** est une application Windows légère qui vit dans la **barre des tâches**
(system tray), se lance au démarrage du PC, et sert de **couteau suisse** autour de la
capture d'écran :

> Capturer → Éditer / Annoter → Gérer dans une bibliothèque → Partager / Accéder à distance

L'application est conçue dès le départ de façon **modulaire** afin d'ajouter facilement
de nouvelles fonctions par la suite (vidéo, OCR, etc.).

---

## 2. Choix techniques validés

| Élément | Choix |
|---|---|
| **Application bureau** | Electron + TypeScript |
| **Éditeur d'images** | Canvas HTML (Konva.js ou Fabric.js) |
| **Serveur auto-hébergé** | Node.js (Express) + SQLite + stockage fichiers |
| **Plugin Stream Deck** | SDK officiel Elgato (JS/HTML) |
| **Dépôt GitHub** | Public, en monorepo |
| **Mises à jour** | Auto via GitHub Releases (`electron-updater`) |
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
| **Mise à jour automatique** | Détecte une nouvelle version sur GitHub → télécharge → installe | V1 |
| Paramètres | Raccourcis, dossier de sauvegarde, options | MVP |
| Thème clair / sombre | Choix de l'apparence | V1 |
| Langues | Français / Anglais | V1 |

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

### Accès depuis l'extérieur (options)

1. **Tailscale / VPN** 🥇 *(recommandé)* — accès privé chiffré, sans ouvrir de port.
2. **Reverse proxy + domaine** (Nginx/Caddy + HTTPS Let's Encrypt) — URL type
   `screens.mondomaine.fr`.
3. **Redirection de port** sur la box — le plus simple, le moins sécurisé.

### Sécurité

- Authentification par **login / mot de passe** obligatoire.
- **HTTPS** obligatoire.
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
- **Accès distant** : serveur auto-hébergé, synchro à la demande, interface web sécurisée
- **Stream Deck** : boutons pour déclencher les captures
- **Bonus** : OCR, color picker

---

*Document de référence. Le développement démarrera sur validation finale.*
