# 🎛️ Plugin Stream Deck — MultiOutils

Boutons Stream Deck pour piloter l'application MultiOutils (docs/00 §8) :

| Action | Effet |
|---|---|
| Capture plein écran / zone / fenêtre / différée | Déclenche la capture dans l'app |
| Ouvrir la bibliothèque | Met l'app au premier plan sur la galerie |
| Dernière capture → presse-papier | Recopie la dernière capture |
| Ouvrir le presse-papiers | Ouvre le module Presse-papiers de l'app |
| Copier le dernier clip | Recopie le dernier élément de l'historique (y compris venus de l'iPhone) |
| Garder le clip courant | Épingle le contenu actuel du presse-papiers (jamais supprimé) |
| **HA : Lumière, Interrupteur, Volet, Thermostat, Capteur, Lecteur, Scène ou script, Caméra** | Une action par modèle de touche : le panneau ne propose que les entités de ce type et part des bons réglages. Bouton « Choisir dans une grande fenêtre » : sélecteur par pièce, avec icônes, dans MultiOutils |
| **HA : Avancé (tout)** | Toutes les entités et tous les modes : basculer, préréglage, liste, pas, lecteur, caméra, service libre, événement, modèle affiché |
| PC : veille / verrouiller / éteindre / redémarrer | Commandes du PC (confirmation sur la touche pour éteindre et redémarrer) |

## Icônes personnalisées pour l’autoclic

Pour les touches **Autoclic marche/arrêt** et **Autoclic — profil**, active
**Icône personnalisée dans Stream Deck** dans les réglages de la touche, puis
choisis ton image depuis sa vignette dans Stream Deck. Le plugin conserve cette
image et actualise uniquement le nom du profil, superposé en haut de la touche.
Laisse le champ **Titre** vide pour garder le nom automatique ; Stream Deck
permet d’ajuster sa position, sa police et sa couleur.

Dans ce mode, l’image reste fixe même quand le profil tourne. Désactive l’option
pour retrouver les icônes animées MultiOutils. Le sélecteur de couleur a été retiré :
les couleurs d’une icône personnalisée se règlent dans l’image elle-même.

## Home Assistant

La touche **Home Assistant** se règle entièrement dans le panneau du logiciel
Stream Deck : recherche d'entité (pièce, étage, type), action à l'appui,
formulaire du service généré à partir de Home Assistant (ou YAML/JSON),
bouton « Tester », apparence (style, couleurs allumé/éteint, icône Material
Design, nom, valeur, jauge, couleur réelle de la lampe, pochette), règles
d'affichage (couleur, icône, clignotement selon l'état), modèles de touches
prêts à l'emploi et copier/coller des réglages.

Connexion :

1. **Via MultiOutils** (recommandé) : l'app utilise l'adresse et le jeton déjà
   réglés dans Réglages › Home Assistant (jeton chiffré, jamais transmis au
   plugin). Les états arrivent en direct (WebSocket de HA → app → plugin par
   attente longue sur `/ha/wait`). Une adresse distante peut être ajoutée,
   essayée quand l'adresse locale ne répond pas.
2. **Connexion directe en secours** : si l'app n'est pas lancée, le plugin se
   connecte lui-même avec l'adresse et le jeton saisis dans « Connexion
   directe » (réglages globaux du plugin, gardés par le logiciel Stream Deck).

Un point orange sur une touche = Home Assistant injoignable ; rouge = entité
indisponible.

Le plugin parle **uniquement à l'app locale** via son service localhost
(`http://127.0.0.1:41320`, lié à la boucle locale — inaccessible depuis le
réseau). Il ne parle jamais au serveur distant. Si l'app n'est pas lancée, la
touche affiche une alerte ⚠.

## Construire

```bash
npm install               # à la racine du monorepo
npm run build -w streamdeck-plugin
```

Le bundle est produit dans `com.supernon0.multioutils.sdPlugin/bin/plugin.js`.

## Installer (utilisation normale)

Chaque **Release GitHub** contient le fichier
`MultiOutils-StreamDeck.streamDeckPlugin` (à côté de l'installeur de l'app) :
télécharge-le et **double-clique** dessus — le logiciel Stream Deck l'installe
tout seul. Les 6 actions MultiOutils apparaissent alors dans la liste des
actions. (L'app MultiOutils doit être lancée pour que les touches agissent.)

## Installer (développement)

Deux options :

1. **CLI Elgato** (recommandé) :
   ```bash
   npm i -g @elgato/cli
   streamdeck link com.supernon0.multioutils.sdPlugin
   streamdeck restart com.supernon0.multioutils
   ```
2. **Manuel** : copier le dossier `com.supernon0.multioutils.sdPlugin` dans
   `%appdata%\Elgato\StreamDeck\Plugins\`, puis redémarrer le logiciel
   Stream Deck.

Pré-requis : logiciel Stream Deck ≥ 6.5 (embarque le runtime Node 20 utilisé
par le SDK v2).
