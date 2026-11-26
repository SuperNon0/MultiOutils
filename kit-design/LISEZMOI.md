# Kit de design « encre » : styles Encre et Verre

Tout ce qu'il faut pour construire **n'importe quelle page** dans le design de
Noë : un site qui s'adapte à l'ordinateur et au téléphone, et la même chose
empaquetée en application Windows ou Mac. Version du kit : **2.0**
(26 novembre 2026).

**En trois phrases.** Le design s'appelle « encre » : fond couleur d'encre,
une seule couleur d'accent, titres à empattements, barre de navigation qui
flotte en verre flouté. Il existe en **deux styles** qui partagent la même
structure et les mêmes classes : **Encre** (net et sobre, celui par défaut) et
**Verre** (verre dépoli, halos de lumière, éléments en pastilles), chacun en
**clair, sombre ou automatique** et avec **5 couleurs d'accent**. Le visiteur
choisit tout ça dans Réglages → Apparence, et le site s'en souvient.

> **Tu es une IA ou un développeur et on t'a envoyé ce dossier ?**
> Lis d'abord [`CONSIGNES-IA.md`](CONSIGNES-IA.md) (une page), puis ce guide,
> puis ouvre `demo.html` dans un navigateur. Copie `modele.html` pour commencer.

## Sommaire

1. [Ce qu'il y a dans le dossier](#1-ce-quil-y-a-dans-le-dossier)
2. [Les règles du design](#2-les-règles-du-design)
3. [Style, thème, accent : les trois réglages](#3-style-thème-accent--les-trois-réglages)
4. [Les couleurs](#4-les-couleurs)
5. [Le style Verre](#5-le-style-verre)
6. [Les polices et les tailles](#6-les-polices-et-les-tailles)
7. [Formes, espaces, ombres, mouvements](#7-formes-espaces-ombres-mouvements)
8. [La mise en page : téléphone, tablette, ordinateur](#8-la-mise-en-page--téléphone-tablette-ordinateur)
9. [La barre de navigation flottante](#9-la-barre-de-navigation-flottante)
10. [Les briques](#10-les-briques)
11. [Le comportement (encre.js)](#11-le-comportement-encrejs)
12. [Faire une nouvelle page](#12-faire-une-nouvelle-page)
13. [Appliquer le design à un site](#13-appliquer-le-design-à-un-site)
14. [En application Windows ou Mac](#14-en-application-windows-ou-mac)
15. [Sur le téléphone](#15-sur-le-téléphone)
16. [Vérifier que c'est réussi](#16-vérifier-que-cest-réussi)
17. [D'où vient le design, licences](#17-doù-vient-le-design-licences)

---

## 1. Ce qu'il y a dans le dossier

| Fichier | À quoi il sert |
|---|---|
| `LISEZMOI.md` | Ce guide. |
| `CONSIGNES-IA.md` | La page à donner en premier à une IA : le contrat du design en une page. |
| `demo.html` | La démonstration. Ouvre-la dans un navigateur (double-clic) : toutes les briques, en vrai, avec leur HTML. Change le style, le thème et la couleur dans **Apparence**. |
| `modele.html` | Le squelette minimal d'un site : 3 pages, barre flottante, menu de gauche, Réglages → Apparence complet. **Le point de départ à copier.** |
| `encre.css` | Tout le design : les jetons (couleurs, polices, formes), puis les briques. Un seul fichier, sans compilation. |
| `verre.css` | Le style Verre : ne change que les jetons et l'habillage, quand `<html data-style="verre">`. Contient aussi le choix du style (`style-carte`). À charger après `encre.css`. |
| `encre.js` | Les comportements : style, thème et couleur ; feuilles, menus, « Annuler », recherche rapide, bouton retour du téléphone… Sans dépendance. |
| `polices.css` + `polices/` | Les 3 polices (10 fichiers woff2), servies par le site lui-même. |
| `icones.svg` | Les 77 icônes au trait (24 × 24). |
| `jetons.json` | Toutes les valeurs (couleurs, tailles, formes) lisibles par une machine : pour Figma, Flutter, SwiftUI, React Native… |
| `tailwind/encre-tailwind.css` | Les jetons en classes Tailwind v4 (`bg-carte`, `text-doux`…) et les variantes `verre:`, `encre:`, `clair:`, `sombre:`. |
| `appli/electron/` | Une appli Windows et Mac prête à lancer (Electron) qui affiche le site. |
| `appli/telephone/` | Manifeste et service worker pour installer le site sur l'écran d'accueil du téléphone. |
| `captures/` | À quoi ça ressemble : les deux styles, clair et sombre, téléphone et ordinateur, les 5 couleurs. |

Rien à installer pour un site : copier les fichiers suffit. `encre.css` +
`verre.css` font tout l'affichage ; `encre.js` ajoute les comportements.

---

## 2. Les règles du design

Un site au design « encre » les respecte toutes, dans les deux styles.

### L'allure

1. **Une seule couleur d'accent** pour ce qui compte : bouton principal,
   onglet actif, liens. Elle se choisit : or, ambre, corail, menthe ou
   **lavande (par défaut)**.
2. **Deux styles au choix**, mêmes pages et mêmes fonctions :
   - **Encre** (par défaut) : fond bleu nuit presque noir (ou papier crème en
     clair), cartes pleines, traits fins, coins doux.
   - **Verre** : fond de halos de lumière bleus et violets, surfaces en verre
     dépoli qui floutent ce qui passe dessous, reflet clair sur le bord du
     haut, boutons et onglets en pastilles, l'élément actif en pastille
     pleine (blanche en sombre, bleu nuit en clair).
3. **Trois thèmes** : automatique (suit l'appareil, et change avec lui
   pendant la visite), clair, sombre.
4. **Trois polices** : DM Serif Display pour les titres, Archivo pour le
   texte, DM Mono pour les petits libellés en capitales et les chiffres.
   Servies par le site (pas d'appel à Google Fonts).
5. **Des icônes au trait**, jamais d'emojis dans l'interface.
6. **Animations douces** (apparitions en cascade, fondus), coupées quand
   l'appareil demande moins d'animations.

### La navigation

7. **Barre de navigation flottante en verre flouté** en bas sur téléphone et
   tablette : détachée des bords, le contenu défile dessous. 3 ou 4 onglets
   + « Plus » (5 cases au maximum).
8. Elle **se cache** quand une feuille, un menu ou la sélection multiple est
   ouvert, et revient à la fermeture.
9. **Sur ordinateur** (1000 px et plus), un **menu à gauche** remplace la
   barre du bas et la barre du haut (en Verre, ce menu flotte lui aussi, à
   14 px des bords, coins de 30 px).
10. **« Plus »** ouvre une feuille : de grandes tuiles d'abord, puis des lignes.
11. **Recherche rapide** : Ctrl K (⌘ K sur Mac) ou « / » sur ordinateur, la
    loupe de la barre du haut sur téléphone.
12. **Le bouton retour du téléphone** referme d'abord ce qui est ouvert
    (feuille, menu, réglage) avant de quitter la page.

### Les réactions du site

13. **Jamais de fenêtre grise du navigateur** (`alert`, `confirm`, `prompt`) :
    questions et confirmations s'ouvrent dans la page (`Encre.confirmer`…).
14. **Feuilles qui montent du bas** sur téléphone, **fenêtres centrées** sur
    ordinateur.
15. **« Annuler » pendant 5 secondes** après chaque action qu'on peut défaire.
16. **Un bouton qui enregistre se bloque** (petite roue) jusqu'à la réponse.
17. **Les réglages s'enregistrent tout seuls**, avec un petit « Enregistré ».
18. **Bulles « ? »** à côté d'un chiffre ou d'un réglage pour l'expliquer.
19. **Squelettes** pendant le chargement, **message doux** quand une liste est vide.
20. **Menus** : clic droit et raccourcis à la souris ; **appui long** au doigt
    pour sélectionner plusieurs éléments.

### Les réglages et l'aide

21. **Réglages en liste**, comme sur un téléphone ; sur ordinateur, **deux
    colonnes** (la liste à gauche, le réglage ouvert à droite).
22. **Réglages → Apparence** contient toujours, dans cet ordre : **Style**
    (Encre / Verre, en cartes avec aperçu), **Couleur d'accent** (5
    pastilles), **Thème** (Automatique / Clair / Sombre).
23. Réglages techniques rangés dans **« Avancé »** ; la **zone sensible**, en
    rouge, tout en bas.
24. **Aide en questions-réponses**, et un **bouton « Copier »** à côté de tout
    ce qui se copie.

### Le confort

25. **S'adapte à tous les écrans**, d'un petit téléphone (360 px) à un grand
    écran, sans jamais défiler sur le côté, en laissant de la place à
    l'encoche et à la barre du bas des téléphones.
26. **Zoom autorisé** ; les champs de saisie font 16 px, donc l'iPhone ne
    zoome pas tout seul quand on touche un champ.
27. **Contraste d'au moins 4,5:1** entre chaque texte et son fond, dans les
    deux styles, les trois thèmes et les 5 couleurs (vérifié, voir § 4 et § 5).
28. **Facile à toucher** : boutons de 44 px de haut, barre d'onglets de 62 px.
29. **Tout en français** (sauf demande contraire).

### Pour le code

30. **Toutes les couleurs passent par les jetons** (les variables CSS de
    `:root`) : jamais de couleur écrite en dur ailleurs. C'est ce qui permet
    aux deux styles et aux trois thèmes de marcher sans rien réécrire.
31. **Les mêmes noms de classes partout** (`btn pri`, `tabbar`, `feuille`…).
32. **Ne jamais écrire de CSS propre à un style dans une page** : une page est
    écrite une seule fois avec les briques, `verre.css` l'habille. Si un
    détail doit vraiment changer en Verre, écris-le avec
    `:root[data-style="verre"] .ma-classe { … }` dans le CSS du site.
33. Si le site a un service worker, **le nom du cache suit la version** du site.

---

## 3. Style, thème, accent : les trois réglages

Ce qui décide de l'affichage, ce sont trois attributs sur la balise `<html>` :

```html
<html data-style="verre" data-theme="light" data-accent="menthe">
```

| Attribut | Valeurs | Absent = |
|---|---|---|
| `data-style` | `verre` | style Encre |
| `data-theme` | `dark`, `light` | suit l'appareil (mais `encre.js` le pose toujours, voir plus bas) |
| `data-accent` | `or`, `ambre`, `corail`, `menthe`, `lavande` | lavande |

Le choix du visiteur est gardé sur l'appareil dans `localStorage`, clé
`encre-apparence` :

```json
{ "style": "verre", "theme": "auto", "accent": "menthe" }
```

`theme` vaut `auto`, `clair` ou `sombre`. En **automatique**, `encre.js` pose
quand même `data-theme` d'après l'appareil (avec `data-encre-auto`), et le
change si l'appareil passe de jour à nuit pendant la visite. **C'est
obligatoire pour le Verre**, dont le clair se lit sur `data-theme="light"`.

Pour que rien ne clignote au chargement, un petit script dans `<head>` pose
les trois attributs avant l'affichage (il est dans `modele.html`, § 13).

Par défaut : `<html data-accent-defaut="lavande" data-style-defaut="encre">`
(mets `data-style-defaut="verre"` pour un site qui démarre en Verre).

---

## 4. Les couleurs

Toutes les couleurs sont des **jetons** : des variables CSS définies une seule
fois. Les briques ne font que s'en servir. Les valeurs exactes sont aussi
dans `jetons.json`.

### Style Encre

| Jeton | Rôle | Sombre | Clair |
|---|---|---|---|
| `--bg` | fond de la page | `#0b0f17` | `#f5f3ee` |
| `--surface` | barres, champs, menu de gauche | `#0f1520` | `#ffffff` |
| `--card` | cartes | `#141b28` | `#ffffff` |
| `--pop` | menus, feuilles, messages | `#182131` | `#ffffff` |
| `--line` | séparateurs discrets | `#1e2737` | `#e7e2d7` |
| `--line2` | bordures visibles | `#2b3549` | `#d5cfc1` |
| `--creux` | fond des segments | `#0f1520` | `#ebe7de` |
| `--text` | texte | `#e7ebf3` | `#1b1d22` |
| `--soft` | texte secondaire | `#aab3c5` | `#454a55` |
| `--muted` | texte discret | `#8a94aa` | `#666b77` |
| `--glass` | verre des barres flottantes | `rgba(24, 28, 40, .74)` | `rgba(255, 255, 255, .8)` |
| `--scrim` | voile derrière les feuilles | `rgba(3, 5, 9, .62)` | `rgba(20, 18, 12, .42)` |

Le clair d'Encre n'est pas l'inverse du sombre : c'est un papier chaud
(crème), avec des cartes blanches posées dessus.

### Style Verre

| Jeton | Sombre | Clair |
|---|---|---|
| `--bg` (sous les halos) | `#08102a` | `#e7eefc` |
| `--surface` | `rgba(255, 255, 255, .055)` | `rgba(255, 255, 255, .55)` |
| `--card` | `rgba(255, 255, 255, .075)` | `rgba(255, 255, 255, .62)` |
| `--pop` | `rgba(22, 34, 72, .92)` | `rgba(255, 255, 255, .94)` |
| `--line` / `--line2` | blanc à 10 % / 17 % | bleu nuit à 10 % / 16 % |
| `--text` | `#f2f5ff` | `#141a33` |
| `--soft` | `#c3cbe3` | `#3d4665` |
| `--muted` | `#97a3c4` | `#5f6889` |
| `--glass` | `rgba(26, 40, 84, .55)` | `rgba(255, 255, 255, .62)` |

Le clair du Verre est froid et lumineux (bleu ciel, lilas), pas crème.
Les jetons propres au verre (`--v-…`) sont décrits au § 5.

### Les états (les deux styles)

| Jeton | Rôle | Sombre | Clair |
|---|---|---|---|
| `--ok` (+ `--ok-ink` pour le texte posé dessus) | réussi, terminé | `#4fc0ad` | `#17725f` |
| `--prog` (+ `--prog-ink`) | en cours, progression | `#8f9cf0` | `#5159c9` |
| `--danger` | supprimer, erreur | `#ef7d6b` | `#bf3f2c` |
| `--warn` | attention | `#efb36b` | `#94560a` |

### Les 5 couleurs d'accent (les deux styles)

Chaque accent a une version pour le sombre et une plus foncée pour le clair,
plus la couleur du texte posé dessus.

| Accent | Sombre : accent / texte dessus | Clair : accent / texte dessus |
|---|---|---|
| **Lavande** (défaut) | `#a99bff` / `#120d2e` | `#5a48d0` / `#ffffff` |
| Or | `#e8c547` / `#1b1504` | `#8a6400` / `#ffffff` |
| Ambre | `#f0a64a` / `#1a1206` | `#995400` / `#ffffff` |
| Corail | `#ff7a59` / `#2a0d05` | `#b23c1d` / `#ffffff` |
| Menthe | `#4fd1b5` / `#05211b` | `#0b7562` / `#ffffff` |

Dans les briques, on n'utilise que `--accent` (l'accent affiché) et `--ink`
(le texte posé dessus), plus les teintes calculées toutes seules :
`--acc-dim` (fond teinté, 14 %), `--acc-line` (bordure, 45 %), `--ok-dim`,
`--prog-dim`, `--danger-dim`.

**Ajouter une 6e couleur** (par exemple « rubis ») :

1. dans `encre.css`, un bloc
   `:root[data-accent="rubis"] { --acc-d: …; --ink-d: …; --acc-l: …; --ink-l: …; }`,
   une pastille `--sw-rubis` (dans `:root` et dans les deux blocs du clair) et
   `.past[data-v="rubis"] i { background: var(--sw-rubis); }` ;
2. dans `encre.js`, ajouter `"rubis"` à la liste `ACCENTS` ;
3. un bouton `<button type="button" class="past" data-v="rubis" role="radio"><i></i>Rubis</button>`
   dans Réglages → Apparence ;
4. vérifier le contraste du texte posé dessus (au moins 4,5:1), en Encre et en Verre.

---

## 5. Le style Verre

Le Verre est un **habillage** : `verre.css` ne touche à aucune structure ni
fonction. Il s'active avec `<html data-style="verre">` et change :

- **le fond** : trois halos de lumière (bleu, violet, bleu ciel) sur un
  dégradé bleu nuit, plus de minuscules étoiles en sombre (`--v-fond`,
  `--v-etoiles`, posés sur `body`, fixes au défilement) ;
- **les surfaces** (cartes, listes, tuiles, menu de gauche, barres) : un
  dégradé translucide (`--v-carte`, `--v-verre`) qui **floute ce qui passe
  dessous** (`backdrop-filter: blur(22px) saturate(1.6)`), un **reflet** d'un
  pixel en haut (`--v-reflet`), un **bord plus clair en haut qu'en bas**
  (`--v-bord-haut`, `--v-bord-bas`) ;
- **les formes** : coins plus ronds (`--r-lg` 22 px, `--r-md` 16 px,
  `--r-sm` 12 px, `--r-btn` 14 px) ; boutons, puces, segments, onglets,
  champs de recherche et barres en **pilule** ;
- **l'élément actif** (onglet, ligne du menu, segment choisi, ligne de la
  recherche rapide) : une **pastille pleine**, blanche avec texte bleu nuit
  en sombre, bleu nuit avec texte blanc en clair (`--v-actif`,
  `--v-actif-ink`, `--v-actif-fond`), son icône prend l'accent ;
- **le bouton principal** : l'accent avec un reflet en haut et une lueur de
  sa couleur ;
- **les menus, feuilles, messages, recherche rapide** : verre plus opaque et
  plus flou (`blur(28px)`), pour rester lisibles.

La recette d'une surface en verre, si tu en crées une nouvelle :

```css
:root[data-style="verre"] .ma-surface {
  background: var(--v-carte);
  border: 1px solid var(--v-bord-bas); border-top-color: var(--v-bord-haut);
  -webkit-backdrop-filter: var(--v-flou); backdrop-filter: var(--v-flou);
  box-shadow: var(--v-reflet), var(--shadow-s);
  border-radius: var(--r-lg);
}
```

### Les règles du Verre

- **Le flou a besoin de quelque chose derrière.** Le Verre est fait pour la
  page principale (fond à halos). Une petite fenêtre posée seule sur le bureau
  de l'ordinateur (pop-up, widget, zone de capture) reste en **Encre** : sans
  rien de coloré derrière, un verre transparent est illisible. C'est ce que
  fait MultiOutils : le Verre ne s'applique qu'à la fenêtre principale et au
  lanceur.
- **Pas de verre dans le verre en grande quantité.** Le flou coûte cher au
  téléphone : flouter les cartes, oui ; flouter chacune des 200 lignes d'une
  liste, non (les lignes `li` ne sont pas floutées, seule leur liste l'est).
- **Lisibilité d'abord.** Les barres et le menu ont une teinte sous le verre
  (`--v-teinte`) pour que les petits textes restent à 4,5:1 même devant le
  halo le plus clair ; en sombre, les textes discrets du menu de gauche
  prennent la couleur `--soft`. Mesuré : 5,4:1 au plus bas en sombre,
  4,7:1 en clair.
- **Accessibilité** : si l'appareil demande moins de transparence
  (`prefers-reduced-transparency`), le verre devient presque opaque ; si le
  navigateur ne sait pas flouter, il devient une matière pleine. Déjà prévu
  dans `verre.css`.
- **Les couleurs des états et des accents ne changent pas** : seules les
  matières changent.

---

## 6. Les polices et les tailles

| Police | Rôle | Graisses |
|---|---|---|
| **DM Serif Display** | titres de page et de section, grands chiffres, nom du site | normale + italique |
| **Archivo** | tout le texte : résumés, boutons, réglages | 400 à 700 |
| **DM Mono** | petits libellés en capitales, chiffres, raccourcis clavier, code | 400, 500 |

| Élément | Classe | Police | Taille |
|---|---|---|---|
| Titre de page | `page-t` | DM Serif Display | 27 px (30 px sur ordinateur) |
| Titre de section | `sec-t` | DM Serif Display | 19 px |
| Grand chiffre | `tuile .v` | DM Serif Display | 27 px (40 à 52 px pour `tuile big`) |
| Texte courant | (le `body`) | Archivo | 15 px, interligne 1,5 |
| Bouton | `btn` | Archivo, gras | 14 px |
| Petit texte | `petit` | Archivo | 12,5 px |
| Libellé | `lbl-mono` | DM Mono, capitales espacées | 11 px |
| Onglet de la barre | `tab` | Archivo | 10,5 px |
| Champ de saisie | `input`, `select`… | Archivo | 16 px (jamais moins) |

Toutes les tailles de titres sont multipliées par `--t-scale` (1,05). Les
polices sont les mêmes dans les deux styles.

---

## 7. Formes, espaces, ombres, mouvements

| | Encre | Verre |
|---|---|---|
| Cartes, listes, tuiles (`--r-lg`) | 14 px | 22 px (tuiles 20 px) |
| Boutons (`--r-btn`) | 10 px | pilule |
| Puces, segments, onglets | pilule / 12 px | pilule |
| Feuille du bas / fenêtre | 24 px / 20 px | idem |
| Barre flottante | 26 px | pilule |
| Menu de gauche (ordinateur) | collé au bord, trait à droite | flottant, à 14 px des bords, 30 px |
| Ombres | `--shadow-s`, `--shadow`, `--sh-tab`, `--sh-feuille` | + `--v-reflet`, `--v-ombre` |

- **Espaces** : 16 px de marge sur les côtés sur téléphone (`--pad`, plus si
  l'écran a une encoche), 34 px sur ordinateur ; 10 à 14 px entre les cartes ;
  les groupes se rangent avec `gap`, pas avec des marges.
- **Mouvement** : une seule courbe, `--ease` = `cubic-bezier(.2, .8, .2, 1)` ;
  0,12 à 0,45 s ; les boutons s'enfoncent un peu quand on appuie
  (`scale(.97)`) ; les pages apparaissent en fondu, leurs blocs en cascade.
  Tout est coupé si l'appareil demande « réduire les animations ».

---

## 8. La mise en page : téléphone, tablette, ordinateur

La structure est la même partout ; c'est la largeur qui décide :

```
.app
├── aside.side            menu de gauche   (ordinateur seulement)
└── .main
    ├── header.top        barre du haut    (téléphone et tablette)
    └── main.pages        le contenu
nav.tabbar                barre flottante  (téléphone et tablette)
template#encre-plus       contenu de « Plus »
```

| Largeur | Ce qui change |
|---|---|
| Moins de 640 px (téléphone) | barre du haut + barre flottante (à 12 px des bords) ; feuilles du bas ; réglages : la liste, puis le réglage en plein écran |
| 640 px et plus (tablette) | barre flottante centrée (520 px), messages centrés |
| 760 px et plus | les feuilles deviennent des fenêtres centrées (520 px) ; menus flottants à la souris |
| 1000 px et plus (ordinateur) | menu de gauche (248 px) à la place des deux barres ; réglages en deux colonnes ; marges de 34 px |

Pour que rien ne déborde : les grilles utilisent `minmax(0, 1fr)`, les longs
textes se coupent (`overflow-wrap: anywhere`), les marges tiennent compte de
l'encoche (`env(safe-area-inset-…)`) et les hauteurs plein écran utilisent
`100dvh`. Une grille de cartes se fait ainsi :

```css
.ma-grille { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@media (min-width: 760px)  { .ma-grille { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1200px) { .ma-grille { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } }
```

---

## 9. La barre de navigation flottante

Elle flotte à 14 px au-dessus du bas de l'écran et à 12 px des côtés. Son
fond est à moitié transparent et **floute ce qui passe dessous**. En Verre,
elle devient une pilule et l'onglet actif une pastille pleine.

```html
<nav class="tabbar" aria-label="Navigation">
  <a class="tab" href="#accueil" data-page="accueil">
    <span class="ti"><svg class="i s22" aria-hidden="true"><use href="#i-home"/></svg></span>Accueil</a>
  <a class="tab" href="#liste" data-page="liste">
    <span class="ti"><svg class="i s22" aria-hidden="true"><use href="#i-list"/></svg></span>Liste</a>
  <!-- … 3 ou 4 onglets en tout … -->
  <button class="tab" type="button" data-encre-plus="encre-plus" aria-haspopup="dialog">
    <span class="ti"><svg class="i s22" aria-hidden="true"><use href="#i-dots"/></svg></span>Plus</button>
</nav>

<template id="encre-plus">
  <div class="q-tuiles plus-t">
    <a class="qt" href="#reglages"><svg class="i s22" aria-hidden="true"><use href="#i-gear"/></svg>Réglages</a>
  </div>
</template>
```

- **Place en bas** : `.pages` garde un espace de la hauteur de la barre
  (+ 52 px) pour que la dernière ligne ne reste jamais cachée dessous.
- **Elle se cache** quand une feuille ou un menu est ouvert
  (`body.overlay-ouvert`) ou pendant une sélection (`body.mode-sel`) :
  `encre.js` pose ces classes.
- **Onglet actif** : `encre.js` met `class="on"` sur l'onglet de la page en
  cours (d'après l'adresse `#page`, ou `<body data-page="…">`).
- **La barre du haut** (`.top`) est en verre elle aussi et prend un trait fin
  dès qu'on fait défiler.

---

## 10. Les briques

Chaque brique garde le même nom de classe sur tous les sites et dans les deux
styles. `demo.html` les montre toutes, avec leur HTML.

| Brique | Classes | À savoir |
|---|---|---|
| Boutons | `btn` ; `pri` (principal), `gh` (discret), `dn` (danger, `dn plein` = rouge plein), `prg`, `okb` ; tailles `sm`, `xs`, `ico` ; `w` (pleine largeur), `deux` (deux lignes) | 44 px de haut |
| Bouton rond | `ib` (+ `on`), `ib verre` sur une image | 40 px |
| Liens | `lien`, `lien-r` (« Tout voir ») | |
| Puces | `chips` > `chip` (+ `on`), `n` (nombre), `pastille` | pilules |
| Segments | `seg` > `button` (+ `on`), `seg ico` | |
| Champs | `champ` (avec icône), `input`, `select`, `lbl`, `form`, `statut ok` | 16 px |
| Interrupteur | `<input type="checkbox" class="sw">` | |
| Coches | `ck` (ronde), `ck sq` (carrée), (+ `on`) | |
| Cartes | `carte`, `bloc`, `ligne` (rangée qui passe à la ligne) | |
| Têtes | `page-h` > `page-t` ; `sec-h` > `sec-t` + `lien-r` ; `intro-p` | |
| Chiffres | `tuiles` > `tuile` (`big`), avec `k`, `v`, `s` ; barre `split` + `leg` | |
| Lignes | `liste-r` > `li` (`li-ic`, `tx` + `small`, `v`) | 54 px mini |
| Progression | `pg` > `i` (`ok`, `acc`, `epais`) | |
| Badges | `badge`, `role-badge role-super / role-membre / role-bloque`, `kbd` | |
| Vide, chargement | `vide` ; `sk`, `sk ln`, `sk ln t`, `sk-l` | |
| Zone sensible | `zone-d` | en bas des réglages |
| Copier, avertir, code | `copie` (`code` + bouton), `bandeau-c`, `bloc-code` | |
| Aide | `faq` > `faq-g`, `details` > `summary` + `rep` | |
| Réglages | `reglages` > `reg-liste` (`reg-g`, `liste-r`) + `reg-det` (`reg-retour`, `reg-panneau`, `reg-sec`, `reg-l`) | `reglages detail` = un réglage ouvert (téléphone) |
| **Choix du style** | `style-choix` > `style-carte st-encre` / `st-verre` (`style-ap` > `i` + 3 `b`, `style-nom`, `style-sous`) | dans `verre.css` |
| Couleur d'accent | `pastilles` > `past` (`data-v`) | |
| Connexion | `login-page` sur `body`, puis `login-card`, `login-logo`, `h-acces`, `access-icon` (`acc`, `warn`, `err`, `ok`), `access-text`, `access-note`, `mail-chip`, `forgot-link` | |
| Page sans menu | `page-simple` sur `body` | une page à part |
| Recherche rapide | `side-search` ; `palette`, `pal-g`, `pal-it` | faite par `encre.js` |
| Feuilles, menus | `voile`, `feuille` (`feuille-t`, `feuille-c`), `pop` > `mi`, `q-tuiles` > `qt`, `q-ext` | faits par `encre.js` |
| Messages | `toasts` > `toast` (`err`) | faits par `encre.js` |
| Sélection | `barre-act sel` | en verre |
| Bulle | `q` (le bouton « ? »), `bulle` | |
| Mise en page | `app`, `side` (`side-it`, `side-lbl`, `side-foot`, `side-compte`), `main`, `top`, `pages`, `page` (+ `on`), `tabbar`, `pied` | |
| Icônes | `<svg class="i s18"><use href="#i-nom"/></svg>` ; tailles `s16`, `s18`, `s22`, `s24` ; couleurs `acc`, `muted` | |
| Apparition | `anim` + `Encre.animerEntree(el)` | |

**Réglages → Apparence**, à copier tel quel (il marche tout seul avec `encre.js`) :

```html
<div class="reg-sec">
  <div class="lbl-mono">Style</div>
  <div class="style-choix" data-encre-style role="radiogroup" aria-label="Style">
    <button type="button" class="style-carte st-encre" data-v="encre" role="radio"><span class="style-ap" aria-hidden="true"><i></i><b></b><b></b><b></b></span><span class="style-nom">Encre</span><span class="style-sous">Net et sobre, couleur d'encre</span></button>
    <button type="button" class="style-carte st-verre" data-v="verre" role="radio"><span class="style-ap" aria-hidden="true"><i></i><b></b><b></b><b></b></span><span class="style-nom">Verre</span><span class="style-sous">Verre dépoli, reflets et lumière</span></button>
  </div>
</div>
<div class="reg-sec">
  <div class="lbl-mono">Couleur d'accent</div>
  <div class="pastilles" data-encre-accent role="radiogroup" aria-label="Couleur d'accent">
    <button type="button" class="past" data-v="or" role="radio"><i></i>Or</button>
    <button type="button" class="past" data-v="ambre" role="radio"><i></i>Ambre</button>
    <button type="button" class="past" data-v="corail" role="radio"><i></i>Corail</button>
    <button type="button" class="past" data-v="menthe" role="radio"><i></i>Menthe</button>
    <button type="button" class="past" data-v="lavande" role="radio"><i></i>Lavande</button>
  </div>
</div>
<div class="reg-sec">
  <div class="lbl-mono">Thème</div>
  <div class="seg" data-encre-theme role="group" aria-label="Thème">
    <button type="button" data-v="auto">Automatique</button><button type="button" data-v="clair">Clair</button><button type="button" data-v="sombre">Sombre</button>
  </div>
</div>
```

**Les 77 icônes** (`#i-…`) : `home`, `lib`, `compass`, `bell`, `bellon`,
`dots`, `search`, `list`, `listplus`, `user`, `users`, `chart`, `gear`,
`help`, `check`, `checks`, `x`, `plus`, `bookmark`, `bookmarkon`, `play`,
`info`, `chev`, `chevl`, `chevd`, `chevu`, `clock`, `film`, `tv`, `heart`,
`trash`, `filter`, `sort`, `grid`, `rows`, `grip`, `shield`, `key`, `cloud`,
`plug`, `download`, `refresh`, `alert`, `sparkle`, `moon`, `sun`, `palette`,
`type`, `lock`, `logout`, `edit`, `undo`, `wrench`, `chat`, `eye`, `cal`,
`share`, `arrow`, `layers`, `zap`, `hourglass`, `mail`, `signal`, `wifi`,
`spin`, `copy`, `hash`, `dot`, `star`, `staron`, `heartfill`, `dice`,
`upload`, `ticket`, `external`, `minus`, `rotate`. Tracées au trait (24 × 24,
trait de 1,8), elles prennent la couleur du texte autour. Il en manque une ?
Dessine-la dans le même style (trait 1,8, bouts ronds, grille 24) ou prends
la même chez Lucide (`strokeWidth={1.8}`).

---

## 11. Le comportement (encre.js)

`encre.js` ajoute un seul objet global, `Encre`, et démarre tout seul. Il ne
dépend de rien et ne touche pas au fonctionnement du site.

```js
// Apparence
Encre.apparence.choisir({ style: "verre" });        // ou "encre"
Encre.apparence.choisir({ theme: "auto" });         // "clair", "sombre"
Encre.apparence.choisir({ accent: "menthe" });
Encre.apparence.prefs;                              // { style, theme, accent }
document.addEventListener("encre:apparence", (e) => console.log(e.detail));  // après chaque changement

// Messages
Encre.toast("Enregistré");
Encre.toast("Ajouté à la liste", { annuler: async () => { /* défaire */ } });  // « Annuler » 5 s
Encre.toastErr(erreur);

// Questions (à la place de confirm() et prompt())
const ok = await Encre.confirmer("Ce titre sera retiré.", { ok: "Retirer", danger: true, titre: "Retirer ?" });
const nom = await Encre.demander("Nouvelle liste", { label: "Nom", placeholder: "Ex. : Soirées", ok: "Créer" });

// Feuilles et menus
const f = Encre.feuille({ titre: "Détails", html: "<p>…</p>" });   // f.fermer()
Encre.menu(bouton, [
  { icone: "edit", texte: "Renommer", touche: "R", action: renommer },
  null,                                                             // séparateur
  { icone: "trash", texte: "Supprimer", danger: true, action: supprimer },
], { titre: "Ma liste" });

// Boutons, copie, gestes
Encre.occupe(bouton, () => fetch("/api/enregistrer", { method: "POST" }));
Encre.copier("texte à copier", bouton);
Encre.appuiLong(liste, ".carte", (carte) => selectionner(carte));
Encre.animerEntree(conteneur);

// Recherche rapide : Ctrl K, ⌘ K, « / » ou un bouton data-encre-recherche
Encre.recherche.raccourcis = [
  { titre: "Réglages", sous: "Tous les réglages", icone: "gear", href: "#reglages" },
  { titre: "Nouvelle liste", icone: "listplus", mots: "créer ajouter", action: nouvelleListe },
];
Encre.recherche.chercher = async (texte, { signal }) => {          // facultatif
  const r = await fetch(`/api/chercher?q=${encodeURIComponent(texte)}`, { signal });
  return (await r.json()).map((x) => ({ groupe: "Résultats", titre: x.nom, sous: x.categorie, icone: "list", href: x.url }));
};

// Navigation
Encre.nav.marquer("accueil");
Encre.nav.aller("#reglages");
Encre.ic("home", "s18");               // le HTML d'une icône
```

Les réglages par attribut :

| Attribut | Où | Effet |
|---|---|---|
| `data-accent-defaut="lavande"` | `<html>` | la couleur par défaut du site |
| `data-style-defaut="encre"` | `<html>` | le style par défaut du site (`verre` possible) |
| `data-style`, `data-accent`, `data-theme` | `<html>` | ce qui est affiché (posés par `encre.js` ou par le serveur) |
| `data-encre-auto` | `<html>` | posé en thème automatique |
| `data-encre-prefs` | `<html>` | le serveur décide (préférences du compte) : l'appareil n'est pas relu |
| `data-encre-sans-retour` | `<html>` | pas d'historique pour les feuilles (Next.js, ou site qui a son propre routeur) |
| `data-encre-sprite="/static/encre/icones.svg"` | `<html>` | icônes dans un fichier à part |
| `data-page="…"` | `<body>` | la page courante, pour un site à plusieurs pages côté serveur |
| `data-encre-style` | conteneur des cartes de style | choix du style branché tout seul |
| `data-encre-accent` | conteneur des pastilles | choix de la couleur branché tout seul |
| `data-encre-theme` | segment du thème | choix du thème branché tout seul |
| `data-encre-plus="id"` | bouton « Plus » | ouvre la feuille faite du `<template id="…">` |
| `data-encre-recherche` | n'importe quel bouton | ouvre la recherche rapide |
| `data-fermer` | dans une feuille | ferme la feuille |
| `class="q" data-t="Titre" data-d="Texte"` | bouton « ? » | bulle d'explication |

**Garder l'apparence sur le compte** (site avec comptes) : le serveur pose
`data-style`, `data-accent`, `data-theme` et `data-encre-prefs` sur `<html>`,
et la page donne à `encre.js` de quoi enregistrer :

```js
Encre.apparence.sauver = async (prefs) => {        // prefs = { style, theme, accent }
  const r = await fetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!r.ok) throw new Error("Pas enregistré, réessaie.");   // le choix est alors annulé
};
```

**Le bouton retour du téléphone** : chaque feuille, menu ou fenêtre ouverte
ajoute une étape à l'historique ; « retour » la referme au lieu de quitter le
site. Pour une couche faite maison :
`const c = Encre.Couches.ouvrir(fermerMaCouche)` puis `Encre.Couches.fermer(c)`.

---

## 12. Faire une nouvelle page

La marche à suivre pour **n'importe quelle page** (tableau de bord, liste,
fiche, formulaire, réglages…) :

1. **Une section** dans `main.pages` :
   `<section class="page" data-page="nom">` (ou, pour un site à plusieurs
   adresses, le contenu directement dans `main.pages` avec
   `<body data-page="nom">`).
2. **Une tête** : `<div class="page-h"><h1 class="page-t">Titre</h1> … boutons</div>`,
   éventuellement un `<p class="intro-p">` dessous.
3. **Des sections** : `<div class="sec-h"><h2 class="sec-t">…</h2><a class="lien-r">Tout voir</a></div>`.
4. **Le contenu avec les briques** : chiffres en `tuiles`, listes en
   `liste-r` > `li`, blocs en `carte`, actions en `btn`, filtres en `chips`
   ou `seg`, formulaires en `form` > `lbl` + `input`. Pas de nouvelle couleur,
   pas de nouvelle police : seulement les jetons.
5. **Les états** : un squelette (`sk`) pendant le chargement, un `vide`
   quand il n'y a rien, une erreur avec `Encre.toastErr`.
6. **La navigation** : un onglet dans la `tabbar` (s'il reste de la place,
   sinon une tuile dans « Plus »), une ligne `side-it` dans le menu de gauche,
   une entrée dans `Encre.recherche.raccourcis`.
7. **Vérifier** à 360 px, 768 px et 1280 px, en Encre et en Verre, en clair
   et en sombre (Réglages → Apparence).

Exemple de page tableau de bord :

```html
<section class="page" data-page="tableau">
  <div class="page-h">
    <h1 class="page-t">Tableau de bord</h1>
    <div class="seg" role="group" aria-label="Période"><button class="on" type="button">Jour</button><button type="button">Semaine</button><button type="button">Mois</button></div>
  </div>
  <div class="tuiles">
    <div class="tuile"><div class="k"><svg class="i s16"><use href="#i-chart"/></svg>Visites</div><div class="v">1 284</div><div class="s">+12 % cette semaine</div></div>
    <div class="tuile"><div class="k"><svg class="i s16"><use href="#i-alert"/></svg>Erreurs</div><div class="v">3</div><div class="s">dont 1 nouvelle</div></div>
  </div>
  <div class="sec-h"><h2 class="sec-t">Activité récente</h2><a class="lien-r" href="#journal">Tout voir<svg class="i s16"><use href="#i-chev"/></svg></a></div>
  <div class="liste-r">
    <div class="li"><span class="li-ic"><svg class="i"><use href="#i-refresh"/></svg></span><span class="tx">Site mis à jour<small>Tout s'est bien passé</small></span><span class="v">Lun.</span></div>
  </div>
</section>
```

`demo.html` montre en vrai une page d'accueil, toutes les briques, les
retours (messages, feuilles, menus), l'apparence, les réglages, la connexion
et l'aide : copie le bloc le plus proche de ce que tu veux.

---

## 13. Appliquer le design à un site

### Étape par étape (tous les sites)

1. **Copier** `encre.css`, `verre.css`, `encre.js`, `polices.css`,
   `polices/` et `icones.svg` dans les fichiers statiques du site (par
   exemple `static/encre/`).
2. **Dans `<head>`** (adresses à adapter) :

   ```html
   <!-- Zoom autorisé : pas de maximum-scale ni de user-scalable=no. -->
   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
   <meta name="color-scheme" content="dark light">
   <meta name="theme-color" content="#0b0f17" media="(prefers-color-scheme: dark)">
   <meta name="theme-color" content="#f5f3ee" media="(prefers-color-scheme: light)">
   <script>
     /* Avant l'affichage : style, accent et thème gardés sur cet appareil (rien ne clignote). */
     try {
       var p = JSON.parse(localStorage.getItem("encre-apparence") || "{}"), h = document.documentElement;
       if (p.style === "verre") h.dataset.style = "verre";
       if (p.accent) h.dataset.accent = p.accent;
       if (p.theme === "sombre") h.dataset.theme = "dark";
       else if (p.theme === "clair") h.dataset.theme = "light";
       else { h.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; h.dataset.encreAuto = ""; }
     } catch (e) {}
   </script>
   <link rel="preload" href="/static/encre/polices/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
   <link rel="stylesheet" href="/static/encre/polices.css">
   <link rel="stylesheet" href="/static/encre/encre.css">
   <link rel="stylesheet" href="/static/encre/verre.css">
   <script defer src="/static/encre/encre.js"></script>
   ```

   (Si le serveur pose lui-même les attributs d'après le compte, le petit
   script est inutile : mets `data-encre-prefs` sur `<html>`.)
3. **Les icônes** : colle le contenu de `icones.svg` juste après `<body>`, ou
   laisse le fichier à part et mets `data-encre-sprite="/static/encre/icones.svg"`
   sur `<html>` (dans ce cas, écris `<use href="/static/encre/icones.svg#i-home"/>`).
4. **La structure** de `modele.html` (§ 8).
5. **Habiller le contenu** avec les briques (§ 10 et § 12). Le fonctionnement
   du site ne change pas : seulement l'apparence.
6. **Retirer les anciennes couleurs et polices** : tout passe par les jetons.
7. **Remplacer** chaque `alert`, `confirm`, `prompt` par `Encre.toast`,
   `Encre.confirmer`, `Encre.demander`.
8. **Ajouter Réglages → Apparence** : style, couleur, thème (§ 10).
9. **Vérifier** avec la liste du § 16.

### Flask / FastAPI + Jinja

- Fichiers dans `static/encre/`, liens avec
  `{{ url_for('static', filename='encre/encre.css') }}` (Flask) ou
  `{{ url_for('static', path='encre/encre.css') }}` (FastAPI).
- Icônes : copie `icones.svg` en `templates/_icons.html` et
  `{% include "_icons.html" %}` juste après `<body>`.
- Un gabarit `_base.html` porte `<head>`, les barres et un
  `{% block contenu %}` ; chaque page l'étend avec `<body data-page="…">`.
- Apparence sur le compte : le gabarit pose
  `<html data-style="{{ prefs.style }}" data-accent="{{ prefs.accent }}" data-encre-prefs …>`
  et une route `/api/prefs` reçoit `Encre.apparence.sauver`.

### Next.js / React + Tailwind

- Copie le dossier dans `src/encre/` et les polices dans `public/polices/` ;
  dans `polices.css`, remplace `url(polices/` par `url(/polices/`.
- Dans `src/app/globals.css` :

  ```css
  @import "tailwindcss";
  @import "../encre/polices.css";
  @import "../encre/encre.css";
  @import "../encre/verre.css";
  @import "../encre/tailwind/encre-tailwind.css";
  ```

  Les jetons deviennent des classes : `bg-fond`, `bg-carte`, `text-texte`,
  `text-doux`, `text-discret`, `border-trait`, `bg-accent text-encre`,
  `bg-accent-dim`, `text-danger`, `font-titre`, `font-mono`, `rounded-doux`,
  `shadow-barre`… et les variantes `verre:rounded-full`, `clair:…`,
  `sombre:…` (testé avec Tailwind 4.1). Les briques restent utilisables
  telles quelles : `className="btn pri"`.
- Dans `app/layout.tsx` :
  `<html lang="fr" data-accent-defaut="lavande" data-encre-sans-retour suppressHydrationWarning>`
  et le petit script du point 2 dans `<head>` avec `dangerouslySetInnerHTML`.
- `encre.js` dans `public/`, chargé par
  `<Script src="/encre.js" strategy="afterInteractive" />` ; ensuite
  `window.Encre.toast("Enregistré")` depuis un composant client.
- La barre flottante en composant React : les mêmes classes (`tabbar`, `tab`,
  `ti`), des `<Link>`, et l'onglet actif d'après `usePathname()`.
- Icônes : `lucide-react` convient (même style au trait) avec
  `strokeWidth={1.8}` ; ou le sprite `icones.svg`.

### Un site en HTML simple

Copie `modele.html` et les fichiers à côté, puis remplace les pages.

---

## 14. En application Windows ou Mac

Le design marche tel quel dans une application de bureau : c'est le même
site, affiché dans une fenêtre. Deux façons de faire.

### Electron (celle de MultiOutils, prête dans `appli/electron/`)

```
appli/electron/
├── package.json   lancement et empaquetage (.exe Windows, .dmg Mac)
├── main.js        la fenêtre : fond et thème natif qui suivent le style et le thème
├── preload.js     transmet à main.js les attributs posés par encre.js
└── preparer.js    remplit site/ avec le modèle si tu n'y as pas mis ton site
```

1. Installe Node.js (version 20 ou plus).
2. Mets ton site dans `appli/electron/site/` (avec `index.html` et le
   dossier du design à côté). Sans rien, l'appli affiche `modele.html`.
3. Dans `appli/electron/` : `npm install`, puis `npm start` pour essayer.
4. `npm run windows` fabrique l'installateur Windows dans `dist/` ;
   `npm run mac` fabrique le `.dmg` (à lancer **sur un Mac** ; pour le
   distribuer sans alerte, il faut signer avec un compte Apple Developer).
   L'icône : mets `icone.ico` (256 px, Windows) et `icone.icns` (Mac) dans
   `appli/electron/icones/`, puis ajoute `"icon": "icones/icone.ico"` dans
   `build.win` et `"icon": "icones/icone.icns"` dans `build.mac` du
   `package.json` (sans ça, l'appli garde l'icône d'Electron).

Ce que fait l'appli, en plus du site :

- **Pas d'éclair blanc au démarrage** : la fenêtre s'ouvre avec le fond du
  style et du thème choisis la dernière fois (`#0b0f17` / `#f5f3ee` en Encre,
  `#08102a` / `#e7eefc` en Verre).
- **La barre de titre suit le thème** : quand on change le thème ou le style
  dans Réglages → Apparence, Windows et Mac passent en clair ou sombre.
- **Les liens externes s'ouvrent dans le navigateur**, jamais dans l'appli.
- `<html>` reçoit la classe `appli` (et `appli-win`, `appli-mac` ou
  `appli-linux`) : cache avec `.appli .seulement-web { display: none; }` ce qui
  n'a de sens que dans un navigateur.
- Fenêtre redimensionnable jusqu'à 380 px de large : **les mêmes règles de
  largeur s'appliquent** (menu de gauche au-delà de 1000 px, barre flottante
  en dessous).

À savoir pour une appli :

- Le **flou du Verre** floute ce qu'il y a **dans la page** (le fond à
  halos), pas le bureau derrière la fenêtre. Un vrai flou du bureau demande
  une fenêtre transparente (`backgroundMaterial: "acrylic"` sur Windows 11,
  `vibrancy` sur Mac) : possible, mais à réserver à une petite fenêtre
  (lanceur, barre rapide), avec un fond de secours.
- Les **petites fenêtres posées sur le bureau** (pop-ups, widgets) restent en
  style **Encre**, même quand l'utilisateur a choisi Verre (§ 5).
- Raccourci de la recherche rapide : Ctrl K sur Windows, ⌘ K sur Mac (déjà
  géré par `encre.js`).
- Pas de `localStorage` partagé entre deux applis : l'apparence est gardée
  par appli.

### Tauri (plus léger)

Tauri fait des applis plus petites (quelques Mo) en utilisant le navigateur du
système. Le site ne change pas ; dans `tauri.conf.json` :

```json
{
  "app": {
    "windows": [{
      "title": "Mon appli", "width": 1220, "height": 800,
      "minWidth": 380, "minHeight": 560,
      "backgroundColor": "#0b0f17"
    }]
  }
}
```

Attention : sur Windows, Tauri utilise WebView2 (comme Edge) ; sur Mac,
WebKit (comme Safari), qui a besoin du préfixe `-webkit-backdrop-filter`
(déjà présent dans `encre.css` et `verre.css`).

---

## 15. Sur le téléphone

Le site **est** déjà l'appli du téléphone : à moins de 640 px de large, il
prend la barre du haut, la barre flottante et les feuilles du bas.

- **Ajouter à l'écran d'accueil** (application installable, plein écran, sans
  barre d'adresse) : copie `appli/telephone/manifest.webmanifest` et
  `appli/telephone/sw.js` à la racine du site, fais des icônes PNG
  (192 et 512 px, plus une « maskable » de 512 px avec une marge de 20 %),
  puis dans `<head>` :

  ```html
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/icones/icone-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");</script>
  ```

  Le site doit être servi en **https**. Change `VERSION` dans `sw.js` à
  chaque mise en ligne.
- **L'encoche et la barre du bas** de l'iPhone sont déjà gérées
  (`viewport-fit=cover` + `env(safe-area-inset-…)`).
- **La couleur de la barre du téléphone** suit le fond du style et du thème
  (`encre.js` met à jour `<meta name="theme-color">`).
- Une vraie appli de store (App Store, Play Store) se fait en emballant le
  même site avec **Capacitor** : mêmes fichiers, aucune règle en plus.

---

## 16. Vérifier que c'est réussi

- [ ] Sur téléphone (360 et 390 px), la barre flotte en bas, détachée des
      bords, et le contenu passe dessous, flouté.
- [ ] Elle disparaît quand une feuille ou un menu s'ouvre, et revient ensuite.
- [ ] Le bouton retour du téléphone referme la feuille sans quitter la page.
- [ ] Sur ordinateur (1280 px), le menu de gauche remplace les deux barres.
- [ ] Réglages → Apparence : les **2 styles**, les **5 couleurs** et les
      **3 thèmes** se changent, s'appliquent tout de suite et restent après
      un rechargement.
- [ ] En **automatique**, changer le thème de l'appareil change le site.
- [ ] En **Verre** : fond à halos, cartes et menu translucides et floutés,
      onglet actif en pastille pleine ; textes lisibles en clair comme en sombre.
- [ ] Aucune page ne défile sur le côté, même à 360 px de large.
- [ ] Plus aucun `alert(`, `confirm(` ni `prompt(` dans le code.
- [ ] Aucune couleur écrite en dur en dehors des jetons.
- [ ] Le zoom marche, et toucher un champ ne zoome pas tout seul.
- [ ] Aucune erreur dans la console du navigateur.
- [ ] En appli : pas d'éclair blanc au démarrage, la barre de titre suit le
      thème, les liens externes s'ouvrent dans le navigateur.

Les captures de `captures/` montrent le résultat attendu :
`ordinateur-` / `telephone-`, puis `encre-` / `verre-`, puis `sombre-` /
`clair-`, plus les 5 couleurs en Verre et quelques écrans (feuille « Plus »,
confirmation, recherche rapide, modèle).

---

## 17. D'où vient le design, licences

Le style **Encre** a été fait sur mesure pour cinéthèque (version 29), puis
rangé dans ce kit (v1.0, 3 novembre 2026). Le style **Verre** a été ajouté à
MultiOutils en version 0.19.0 (26 novembre 2026) d'après une vidéo « Glassy
Sidebar » que Noë aimait, puis repris ici pour toutes les briques du kit
(v2.0). Quelques noms de classes viennent encore de cinéthèque (`side-listes`,
`dot ordo`, `split` Films / Séries) : ils marchent tels quels pour n'importe
quel contenu.

**Licences** : les trois polices sont sous licence libre SIL Open Font License
(on peut les servir avec le site) ; les icônes et le code ont été faits pour
les projets de Noë.
