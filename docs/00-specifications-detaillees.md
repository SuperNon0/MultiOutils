# 00 · Spécifications détaillées — MultiOutils

> **But de ce document :** décrire **chaque fonction** avec assez de précision pour qu'un
> développeur (humain ou IA) puisse l'implémenter sans avoir à deviner. Pour chaque
> fonctionnalité on donne : le **comportement attendu**, l'**interface**, les **cas
> limites** et des **critères d'acceptation** (✅ = « c'est réussi quand… »).

**Légende priorités :** `MVP` = indispensable au premier lancement · `V1` = première
version complète · `Avancé` = après la V1 · `Bonus` = module optionnel.

---

## 0. Principes généraux

1. **Application modulaire (hôte + outils).** L'app est un *hôte* avec une barre latérale
   d'outils. Le premier outil est **« Capture d'écran »**. D'autres outils viendront
   (voir `01-architecture.md` §2). Un outil = un module isolé qui s'enregistre auprès de
   l'hôte. **Aucune fonctionnalité de capture ne doit être codée « en dur » dans l'hôte.**
2. **Fonctionne 100 % hors-ligne.** Le logiciel n'a **jamais besoin du serveur** pour
   fonctionner. Le serveur (accès distant) est **optionnel** et activé par l'utilisateur.
3. **Local d'abord.** Toutes les captures sont stockées localement. L'envoi vers le
   serveur est **explicite** (bouton), jamais automatique.
4. **Discrétion.** L'app vit dans la zone de notification (system tray). Fermer la fenêtre
   la réduit dans le tray, elle ne quitte pas (option réglable).
5. **Réactivité.** Une capture doit apparaître à l'écran en **< 300 ms** après le
   raccourci.
6. **Zéro perte de données.** Une capture est écrite sur le disque **avant** toute autre
   action. Rien ne dépend de la RAM seule.

---

## 1. Module « Capture d'écran »

### 1.1 Types de capture

| Type | Comportement | Priorité |
|---|---|---|
| **Plein écran** | Capture l'écran contenant le curseur (ou tous les écrans, réglable). | MVP |
| **Zone / région** | Assombrit l'écran, curseur en croix, l'utilisateur trace un rectangle ; affiche en direct les **dimensions (px)** et une **loupe** de précision. `Échap` annule. | MVP |
| **Fenêtre** | Surligne la fenêtre survolée, clic pour la capturer (bordures comprises ou non, réglable). | MVP |
| **Écran choisi** | Sur multi-écran, menu pour choisir quel moniteur. | MVP |
| **Capture différée** | Compte à rebours (3/5/10 s, personnalisable) affiché dans le tray, puis capture. | V1 |
| **Capture défilante** | Capture une zone puis fait défiler automatiquement une page longue et assemble l'image. | Avancé |

**Comportement commun après capture (« flux post-capture ») :**
1. La capture est immédiatement **enregistrée** dans le dossier de stockage (nom auto :
   `Capture_AAAA-MM-JJ_HH-MM-SS.png`).
2. Elle est **copiée dans le presse-papier** (si l'option est active).
3. Une **barre d'actions rapides** apparaît (petite fenêtre near le curseur) :
   `Éditer` · `Copier` · `Enregistrer sous…` · `Envoyer au serveur` · `Supprimer`.
   Elle disparaît après ~6 s ou au clic ailleurs.
4. Une **notification** discrète confirme (« Capture enregistrée »).

✅ *Réussi quand :* chaque type de capture produit un PNG correct, l'image est dans le
presse-papier, et la barre d'actions rapides fonctionne.

### 1.2 Raccourcis clavier globaux

- Fonctionnent **même quand l'app n'a pas le focus** (raccourcis système globaux).
- Raccourcis **par défaut** (tous réassignables dans les Paramètres) :
  - Plein écran : `Impr. écran`
  - Zone : `Ctrl + Shift + S`
  - Fenêtre : `Ctrl + Shift + W`
  - Différée : `Ctrl + Shift + D`
- Détection des **conflits** : si un raccourci est déjà pris, l'app le signale.

✅ *Réussi quand :* les 4 raccourcis déclenchent la bonne capture depuis n'importe quelle
application, et sont modifiables.

### 1.3 Options de capture (Paramètres)

- Copier automatiquement dans le presse-papier (on/off).
- Ouvrir l'éditeur automatiquement après capture (on/off).
- Inclure le curseur de la souris (on/off).
- Format d'enregistrement par défaut (PNG / JPG / WebP) + qualité JPG.
- Dossier de stockage (choisi au premier lancement, modifiable).
- Modèle de nom de fichier (variables : date, heure, compteur, nom d'app active).

---

## 2. Module « Éditeur / Annotation »

S'ouvre en double-cliquant une capture, ou juste après une capture. **Canvas** avec une
**barre d'outils** (gauche), un **panneau de propriétés** (droite) et une **barre haute**
(fichier / undo-redo / export).

### 2.1 Outils de dessin

| Outil | Détail du comportement | Priorité |
|---|---|---|
| **Sélection/déplacer** | Sélectionner un objet déjà posé, le déplacer, le redimensionner (poignées), le pivoter, le supprimer (`Suppr`). | V1 |
| **Rectangle / carré** | Glisser pour tracer ; `Maj` = carré parfait. Contour + remplissage réglables. | V1 |
| **Ellipse / cercle** | Idem ; `Maj` = cercle parfait. | V1 |
| **Triangle** | Triangle isocèle ; `Maj` = équilatéral. | V1 |
| **Ligne** | Ligne droite ; `Maj` = angles à 45°. | V1 |
| **Flèche** | Ligne avec pointe ; tête de flèche réglable (taille). | V1 |
| **Texte** | Cliquer pour poser une zone de texte éditable ; police, taille, gras/italique, couleur, contour, fond. | V1 |
| **Crayon (dessin libre)** | Trait à main levée, épaisseur réglable ; lissage. | V1 |
| **Surligneur** | Trait semi-transparent (comme un marqueur). | V1 |
| **Flou / pixellisation** 🔒 | Zone rectangulaire qui **floute** ou **pixellise** le contenu dessous (masquer infos sensibles). | V1 |
| **Numéro d'étape** | Pose des pastilles rondes numérotées **1, 2, 3…** auto-incrémentées (tutoriels). | V1 |
| **Recadrage (crop)** | Rogner l'image à un rectangle. | V1 |
| **Gomme** | Efface les objets (pas les pixels de l'image de fond). | V1 |

### 2.2 Propriétés & état

- **Couleur** (palette + sélecteur + valeurs récentes), **épaisseur** du trait, **opacité**,
  **remplissage** on/off, **style de police** (pour le texte), **taille de pointe** (flèche).
- **Presets** de style (mémoriser une combinaison couleur/épaisseur).
- **Undo / Redo illimité** (`Ctrl+Z` / `Ctrl+Y`) — pile d'historique par objet.
- **Calques** *(Avancé)* : chaque annotation reste un objet modifiable/déplaçable **après**
  coup, jamais « aplati » tant qu'on n'exporte pas.
- **Zoom / loupe** (molette + `Ctrl`), ajuster à la fenêtre.
- **Effet cadre** *(Avancé)* : ombre portée / bordure / marge de fond colorée autour de la
  capture (rendu « joli » pour réseaux).

### 2.3 Export depuis l'éditeur

- `Enregistrer` (écrase), `Enregistrer sous…`, `Copier dans le presse-papier`,
  `Exporter` (PNG/JPG/WebP + qualité), `Envoyer au serveur`.
- Le format vectoriel des annotations est **conservé dans la bibliothèque** (voir 4.4)
  pour ré-édition ; l'export produit une image aplatie.

✅ *Réussi quand :* on peut annoter une capture avec chaque outil, revenir en arrière,
ré-ouvrir plus tard pour modifier les annotations, et exporter une image correcte.

---

## 3. Raccourcis clavier de l'éditeur (référence)

| Touche | Action |
|---|---|
| `V` | Sélection · `R` Rectangle · `O` Ellipse · `L` Ligne · `A` Flèche · `T` Texte · `P` Crayon · `H` Surligneur · `B` Flou · `N` Numéro · `C` Crop |
| `Ctrl+Z` / `Ctrl+Y` | Annuler / Refaire |
| `Ctrl+C` / `Ctrl+V` | Copier / Coller un objet |
| `Suppr` | Supprimer l'objet sélectionné |
| `Ctrl+S` | Enregistrer · `Ctrl+Shift+S` Enregistrer sous |
| `+ / -` | Zoom · `Ctrl+0` Ajuster |
| `Échap` | Désélectionner / annuler l'outil |

---

## 4. Module « Bibliothèque »

### 4.1 Vue galerie

- **Grille de vignettes** de toutes les captures, avec **date**, **nom**, **dimensions**.
- Vues : grille (par défaut) et liste. Taille des vignettes réglable.
- **Tri** : date (défaut, récent en premier), nom, taille.
- **Aperçu** : clic = sélection ; double-clic = ouvre l'éditeur ; barre d'espace = grand
  aperçu.
- **Sélection multiple** (`Ctrl`/`Maj`) pour actions en lot.

### 4.2 Organisation (dossiers & tags)

> Détaillé dans [`03-organisation-captures.md`](03-organisation-captures.md). Résumé :

- **Dossiers** créés par l'utilisateur (ex. « Travail », « Tutos », « Perso »),
  **imbriqués** possibles. Glisser-déposer une capture dans un dossier.
- **Tags/étiquettes** multiples par capture, avec couleur.
- **Favoris ⭐** (dossier virtuel).
- **Dossiers intelligents** (auto) : « Aujourd'hui », « Cette semaine », « Non triées ».
- **Recherche** par nom, tag, dossier, date.
- **Corbeille** : suppression = corbeille, restaurable ; vidage définitif manuel.

### 4.3 Actions

Par capture ou en lot : ouvrir, renommer, déplacer vers un dossier, ajouter des tags,
mettre en favori, copier, exporter, **envoyer au serveur**, supprimer.

### 4.4 Stockage & métadonnées

- Chaque capture = un **fichier image** sur le disque + une **entrée en base** (SQLite)
  avec : id, chemin, nom, date, dimensions, taille, dossier, tags, favori, **état serveur**
  (non envoyé / envoyé / erreur), et un **calque d'annotations** (JSON) pour ré-édition.
- Voir schéma en `01-architecture.md` §4.

✅ *Réussi quand :* on peut ranger, taguer, chercher et retrouver n'importe quelle capture,
et que l'organisation survit au redémarrage.

---

## 5. Système & intégration Windows

### 5.1 Barre des tâches (system tray)

- Icône permanente. **Clic gauche** = ouvrir/masquer la fenêtre. **Clic droit** = menu :
  Capturer (plein écran / zone / fenêtre / différée) · Ouvrir la bibliothèque ·
  Dernière capture → presse-papier · Paramètres · Vérifier les mises à jour · Quitter.

### 5.2 Lancement au démarrage

- Option **on/off** dans les Paramètres. Sous Windows : enregistrement dans la clé de
  démarrage (via l'API Electron `app.setLoginItemSettings`), option « démarrer réduit ».

### 5.3 Mises à jour (à la demande, bouton)

Flux détaillé :
1. L'utilisateur clique **« Vérifier les mises à jour »** (Paramètres ou menu tray).
2. L'app interroge les **GitHub Releases** du dépôt public (via `electron-updater`).
3. Si une version plus récente existe : afficher la version + les notes, bouton
   **« Télécharger et installer »**.
4. Téléchargement → vérification → invite à redémarrer → installation.
5. Aucune mise à jour forcée ; l'utilisateur décide.

> Détail « côté serveur » (mise à jour du site) dans `02-demarrage.md` §5.

### 5.4 Paramètres (écrans)

Général (langue FR/EN, thème clair/sombre, démarrage auto, comportement à la fermeture) ·
Capture (voir 1.3) · Raccourcis · Stockage (dossier, nommage) · **Serveur distant**
(URL, jeton, test de connexion) · Mises à jour · À propos.

### 5.5 Internationalisation & thème

- Textes externalisés (fichiers de traduction), **FR par défaut**, EN fourni.
- Thème **clair / sombre** (le thème visuel de référence est décrit dans `../CDC.html`).

---

## 6. Module « Accès distant » (côté app)

- **Activation** : dans Paramètres → Serveur distant, l'utilisateur saisit l'**URL** du
  serveur et un **jeton d'API** (généré côté serveur, voir `04-api-serveur.md`).
  Bouton **« Tester la connexion »**.
- **Envoi** : bouton **« Envoyer au serveur »** sur une capture (ou en lot). Envoie
  l'image + ses métadonnées (nom, tags, dossier). **Uniquement à la demande.**
- **Indicateur d'état** par capture : ⚪ non envoyée · 🟢 envoyée · 🔴 erreur (avec ré-essai).
- **Sens des données** : l'app **pousse** vers le serveur ; la consultation à distance se
  fait via l'**interface web** du serveur (pas besoin de l'app pour regarder).

✅ *Réussi quand :* après configuration, un clic envoie une capture au serveur et elle
apparaît dans l'interface web ; les captures non envoyées restent locales.

---

## 7. Serveur auto-hébergé (le « site »)

Application web (Node.js/Express) qui tourne chez l'utilisateur (sur Proxmox). Deux
publics : l'**API** (pour l'app) et l'**interface web** (pour l'humain à distance).

### 7.1 Interface web (consultation à distance)

- **Connexion** obligatoire (login + mot de passe). Responsive (pensé mobile).
- **Galerie** des captures reçues, avec **dossiers et tags** (miroir de l'app).
- Actions : voir en grand, **télécharger**, supprimer, filtrer/chercher par dossier/tag/date.
- Thème sombre cohérent avec l'app.

### 7.2 Administration

- **Première connexion** : création du compte admin (mot de passe).
- Génération / révocation de **jetons d'API** (pour connecter une ou plusieurs apps).
- **Bouton « Mettre à jour le site »** : déclenche `git pull` + redémarrage (voir
  `02-demarrage.md` §5). Affiche la version installée et la version disponible.
- Réglages : quota de stockage, rétention, sauvegarde de la base.

### 7.3 Sécurité

- Mots de passe **hachés** (bcrypt/argon2). Jetons d'API stockés hachés.
- **HTTPS obligatoire** (fourni par Cloudflare Tunnel en façade — voir `install/`).
- **Cloudflare Access** possible en amont (2ᵉ barrière : email/code).
- Aucune ressource (image) accessible sans authentification.
- Limites d'upload (taille max), validation du type de fichier.

✅ *Réussi quand :* le site démarre, force la création d'un admin, n'affiche rien sans
connexion, reçoit les captures de l'app via un jeton, et se met à jour via le bouton.

---

## 8. Extension Stream Deck

Plugin officiel Elgato. Actions disponibles (à glisser sur les touches) :

| Action | Effet |
|---|---|
| Capture plein écran / zone / fenêtre / différée | Déclenche la capture correspondante dans l'app. |
| Ouvrir la bibliothèque | Met l'app au premier plan sur la galerie. |
| Dernière capture → presse-papier | Recopie la dernière capture. |

- **Communication** app ↔ plugin : l'app expose un petit **service local** (WebSocket ou
  HTTP sur `localhost`) que le plugin appelle. Le plugin ne parle **pas** au serveur
  distant, seulement à l'app locale.

✅ *Réussi quand :* une touche Stream Deck déclenche la capture correspondante, app au
premier plan ou en arrière-plan.

---

## 9. Modules bonus

### 9.1 OCR (texte depuis une image) — Bonus
- Depuis une capture : bouton **« Extraire le texte »** → OCR (moteur type Tesseract) →
  le texte détecté est affiché et **copiable**, langue FR/EN.
- ✅ Réussi quand : un texte lisible dans une capture est extrait correctement et copié.

### 9.2 Color picker / pipette — Bonus
- Outil **pipette plein écran** : loupe zoomée autour du curseur, affiche la couleur du
  pixel visé ; clic = copie le code (**HEX / RGB / HSL**, format réglable) dans le
  presse-papier ; historique des dernières couleurs.
- ✅ Réussi quand : on peut prélever la couleur de n'importe quel pixel de l'écran et
  récupérer son code.

### 9.4 Presse-papiers, fichiers & partage iPhone/iPad — Réalisé (v0.2.0 → v0.3.2)
Gestionnaire de presse-papiers intégré, import de fichiers quelconques, et
réception des partages iPhone/iPad.

**Côté PC (module « Presse-papiers ») :**
- Surveillance du presse-papiers Windows : chaque **Ctrl+C** (texte ou image) est
  ajouté à une liste horodatée. Clic sur un élément texte/image = recopié dans le
  presse-papier.
- **Fichiers quelconques** (v0.3.0) : bouton **« Ajouter un fichier »** (sélecteur
  natif) ou **glisser-déposer** — PDF, Word/Excel, zip, n'importe quel type. Aperçu
  avec icône + nom + taille ; clic = **ouvre** le fichier avec l'app par défaut ;
  bouton dédié pour l'**afficher dans l'explorateur**.
- **Épingler = garder** : un élément épinglé n'est jamais supprimé. Les autres sont
  **purgés automatiquement** après un délai réglable (1 h / 6 h / 24 h / 7 j / 30 j /
  jamais) dans les paramètres du module.
- Recherche dans l'historique, vidage manuel.
- **Visionneuse plein texte** (v0.3.2) : bouton dédié sur chaque clip texte →
  ouvre une visionneuse (zone de texte en lecture seule) montrant le message
  **en entier**, quelle que soit sa longueur, avec défilement natif et
  sélection libre d'un passage à copier (Ctrl+C ne copie que la sélection).
  Même fonctionnalité sur le site (bouton « Agrandir » à côté de « Copier »
  sur la page Clips) — cohérence app/site.
- **Présentation identique à la bibliothèque** (v0.2.2) : barre latérale avec vues
  intelligentes — Tous les éléments, **Favoris** (jamais supprimés), Aujourd'hui,
  Cette semaine, Ce mois-ci, Non triés, Reçus (iPhone/iPad) — puis dossiers et tags.
- **Dossiers & tags propres au presse-papiers** (v0.2.2) : taxonomie **séparée** de
  celle des captures (création/renommage/suppression + couleur depuis la barre
  latérale, comme la bibliothèque). Sur la page Clips du site : filtres par
  dossier/tag et édition par clip.
- **Sécurité** : les copies marquées sensibles par les gestionnaires de mots de passe
  (KeePass, 1Password…) sont **ignorées** ; surveillance désactivable.
- **Envoi au serveur** : bouton explicite par élément (principe local-first, §6) —
  rien ne part automatiquement.

**Côté iPhone/iPad → PC (via le serveur auto-hébergé) :**
- **3 Raccourcis iOS** dans le menu **Partager** : Texte, Photo, et **Fichier**
  (v0.3.0 — PDF, docs, zip… envoyés tels quels, sans conversion) — tous vers
  `POST /api/clips` (jeton API). Guide pas-à-pas complet : `docs/guide-iphone.md`.
  Fonctionne aussi depuis l'iPad (même Raccourcis, sync iCloud ou recréation).
- **Page web « Déposer »** sur le site (`/clips/deposer`) : coller un texte ou
  téléverser une photo/fichier quelconque depuis n'importe quel appareil.
- Le site affiche la boîte **« Clips »** (page `/clips`) : consultation, copie,
  téléchargement, suppression — session obligatoire.
- **Taille maximale d'envoi réglable** (v0.3.0) : **Administration → Taille
  maximale d'envoi**, en Mo, appliquée aux captures ET aux clips (texte/photo/
  fichier), **sans redémarrage** du serveur.
- L'app PC **récupère automatiquement** les nouveaux clips du serveur (option
  activable/désactivable) : les partages iPhone apparaissent dans le module
  Presse-papiers avec un badge 📱.

**Stream Deck** : trois actions dédiées — ouvrir le presse-papiers, copier le dernier
clip, garder (épingler) le clip courant.

- ✅ Réussi quand : un texte partagé depuis l'iPhone apparaît sur le PC en < 30 s ;
  un Ctrl+C apparaît dans la liste ; un élément épinglé survit à la purge.

### 9.5 Roadmap ouverte (idées)
Enregistrement vidéo/GIF · règle & mesure de pixels · synchro cloud (Drive/Dropbox) ·
watermark automatique · générateur de QR code · notes rapides ·
**système de plugins tiers**.

---

## 10. Exigences non-fonctionnelles

- **Performance** : capture affichée < 300 ms ; galerie de 5 000 captures fluide
  (vignettes en cache).
- **Fiabilité** : écriture disque avant toute autre étape ; aucune capture perdue en cas
  de crash.
- **Sécurité** : voir 7.3 ; le presse-papier ne conserve pas d'infos floutées.
- **Accessibilité** : navigation clavier complète, focus visible, contrastes suffisants.
- **Compatibilité** : Windows 10 et 11 (64 bits). Multi-écran et mise à l'échelle (DPI)
  gérés.
- **Journalisation** : logs locaux pour le dépannage (niveau réglable), sans données
  sensibles.
- **Confidentialité** : aucune donnée envoyée ailleurs que sur le serveur de
  l'utilisateur ; pas de télémétrie.

---

## 11. Critères d'acceptation globaux (checklist)

- [ ] Les 4 captures de base marchent au raccourci, hors focus, et produisent un PNG.
- [ ] La barre d'actions rapides et la copie presse-papier fonctionnent.
- [ ] L'éditeur fournit tous les outils du §2 avec undo/redo et ré-édition.
- [ ] La bibliothèque range par dossiers/tags/favoris, cherche, et a une corbeille.
- [ ] L'app se lance au démarrage et vit dans le tray.
- [ ] La mise à jour du logiciel se fait par bouton depuis GitHub.
- [ ] Le serveur démarre, exige un admin, et n'affiche rien sans connexion.
- [ ] L'app envoie une capture au serveur via un jeton ; elle apparaît sur le web.
- [ ] Le site se met à jour par bouton.
- [ ] Le plugin Stream Deck déclenche les captures.
- [ ] Un nouvel outil peut être ajouté sans modifier les outils existants (§0.1).
