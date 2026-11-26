# Consignes : construire avec le design « encre » (styles Encre et Verre)

À lire en premier par l'IA ou le développeur qui reçoit ce dossier. Le détail
est dans `LISEZMOI.md` ; ici, le contrat en une page.

## Ce qu'on te demande

Construire des pages (un site, ou une application Windows / Mac / téléphone
qui affiche ce site) **exactement dans ce design**, en réutilisant les
fichiers du dossier tels quels. Tu n'inventes pas un nouveau style : tu
assembles les briques existantes.

## Les fichiers à utiliser (sans les modifier)

- `encre.css` puis `verre.css` (dans cet ordre), `polices.css` + `polices/`,
  `encre.js`, `icones.svg`.
- Point de départ : **copie `modele.html`** (structure, `<head>`, Réglages →
  Apparence déjà branchés). Pour chaque brique, copie le HTML montré dans
  `demo.html`.
- React / Next.js + Tailwind : `tailwind/encre-tailwind.css` (LISEZMOI § 13).
- Appli Windows / Mac : `appli/electron/` (LISEZMOI § 14).
- Installation sur téléphone : `appli/telephone/` (LISEZMOI § 15).
- Autre technologie (Flutter, SwiftUI…) : toutes les valeurs sont dans `jetons.json`.

## Les règles à ne jamais casser

1. **Couleurs uniquement par les jetons** (`var(--bg)`, `var(--card)`,
   `var(--text)`, `var(--accent)`, `var(--ink)`…). Aucune couleur écrite en
   dur dans une page. C'est ce qui fait marcher les 2 styles × 3 thèmes × 5
   accents sans rien réécrire.
2. **Les classes du kit** (`btn pri`, `carte`, `liste-r` > `li`, `tuiles`,
   `seg`, `chips`, `tabbar`, `side`, `feuille`…), pas de nouvelles briques
   qui font la même chose.
3. **Une page s'écrit une seule fois** : pas de version « Verre » d'une page.
   `verre.css` habille tout seul quand `<html data-style="verre">`.
4. **Trois réglages dans Réglages → Apparence**, dans cet ordre : Style
   (Encre / Verre), Couleur d'accent (or, ambre, corail, menthe, lavande par
   défaut), Thème (Automatique par défaut / Clair / Sombre). Ils marchent seuls
   avec `data-encre-style`, `data-encre-accent`, `data-encre-theme`.
5. **Le petit script de `<head>`** (dans `modele.html`) reste en place : il
   pose `data-style`, `data-accent` et `data-theme` avant l'affichage.
   `data-theme` doit toujours être posé, même en automatique.
6. **Responsive** : téléphone d'abord (360 px), barre du haut + barre
   d'onglets flottante en verre (3 ou 4 onglets + « Plus ») sous 1000 px ;
   menu de gauche au-delà. Jamais de défilement horizontal. Grilles en
   `minmax(0, 1fr)`. Champs en 16 px. Boutons de 44 px.
7. **Jamais `alert`, `confirm`, `prompt`** : `Encre.toast`, `Encre.confirmer`,
   `Encre.demander`, `Encre.feuille`, `Encre.menu`.
8. **Polices** : DM Serif Display (titres), Archivo (texte), DM Mono
   (libellés, chiffres), servies par le site. **Icônes au trait** du sprite,
   jamais d'emojis.
9. **Contraste 4,5:1** minimum, zoom autorisé, animations coupées si
   l'appareil le demande.
10. **Tout en français**, phrases simples.

## Le Verre en bref

Fond de halos bleus et violets, surfaces translucides floutées
(`backdrop-filter`), reflet clair sur le bord du haut, coins plus ronds,
boutons / onglets / segments en pilule, élément actif en pastille pleine
(blanche en sombre, bleu nuit en clair). Une petite fenêtre posée seule sur
le bureau (pop-up, widget) reste en Encre. Pour une nouvelle surface en verre,
recopie la recette du LISEZMOI § 5.

## Avant de dire que c'est fini

- Captures à **390 px** (téléphone) et **1280 px** (ordinateur), en **Encre et
  en Verre**, en **clair et en sombre** : compare-les à `captures/`.
- Coche la liste du LISEZMOI § 16.
- Aucune erreur dans la console.
