# 03 · Organisation & tri des captures (dossiers, tags, favoris)

Tu veux pouvoir **trier tes captures dans des dossiers**. Voici le système complet, côté
logiciel **et** côté site.

---

## 1. Dossiers (créés par toi)

- Tu crées autant de **dossiers** que tu veux (ex. `Travail`, `Tutos`, `Perso`, `Jeux`).
- **Imbrication** possible : un dossier peut contenir des sous-dossiers
  (`Travail / Projet A`).
- **Couleur** optionnelle par dossier (repère visuel).
- **Ranger une capture** : glisser-déposer sur le dossier, ou clic droit →
  « Déplacer vers… », ou en **lot** (sélection multiple).
- Une capture appartient à **un seul dossier** à la fois (comme dans l'explorateur).
  Pour un classement multiple, utilise les **tags** (§2).
- Les captures non rangées sont dans le dossier virtuel **« Non triées »**.

## 2. Tags / étiquettes (classement multiple)

- Une capture peut avoir **plusieurs tags** (ex. `#facture`, `#urgent`, `#client-x`).
- Chaque tag a une **couleur**.
- Filtrer par un ou plusieurs tags ; combiner avec un dossier et une date.
- Idéal quand une même capture doit être retrouvée sous plusieurs angles.

## 3. Favoris ⭐

- Marque une capture d'un clic (étoile). Le dossier virtuel **« Favoris »** les regroupe,
  sans les sortir de leur dossier réel.

## 4. Dossiers intelligents (automatiques)

Générés tout seuls, non modifiables :
- **Aujourd'hui**, **Cette semaine**, **Ce mois-ci** (par date).
- **Non triées** (aucune affectation de dossier).
- **Récemment envoyées au serveur**.

## 5. Recherche & filtres

- Barre de recherche : par **nom**, **tag**, **dossier**, **plage de dates**.
- Filtres combinables (ex. dossier `Tutos` + tag `#client-x` + « cette semaine »).
- Tri des résultats : date / nom / taille.

## 6. Actions en lot

Sélection multiple (`Ctrl`/`Maj`) puis : déplacer vers un dossier, ajouter/retirer des
tags, mettre en favori, exporter, **envoyer au serveur**, supprimer (→ corbeille).

## 7. Corbeille

- Supprimer envoie à la **corbeille** (récupérable).
- Vidage définitif manuel, ou automatique après N jours (réglable).

## 8. Synchronisation de l'organisation vers le site

- Quand tu **envoies** une capture au serveur, on transmet **aussi** son **dossier** et
  ses **tags**. Le site reconstitue la même arborescence pour la consultation à distance.
- L'organisation reste **pilotée depuis le logiciel** (source de vérité). Le site est en
  consultation ; il permet au minimum de **filtrer par dossier/tag** et de télécharger.

## 9. Modèle de données (rappel)

Voir `01-architecture.md` §4 : tables `folders` (avec `parent_id` pour l'imbrication),
`tags`, `capture_tags` (liaison n–n), et le champ `favorite` sur `captures`.

## 10. Critères d'acceptation

- [ ] Créer, renommer, imbriquer, colorer et supprimer un dossier.
- [ ] Ranger une capture par glisser-déposer et en lot.
- [ ] Ajouter plusieurs tags colorés et filtrer dessus.
- [ ] Favoris et dossiers intelligents fonctionnent.
- [ ] Recherche combinée (dossier + tag + date).
- [ ] Corbeille avec restauration.
- [ ] Dossier + tags transmis au serveur à l'envoi.
