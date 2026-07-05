# 🎛️ Plugin Stream Deck — MultiOutils

Boutons Stream Deck pour piloter l'application MultiOutils (docs/00 §8) :

| Action | Effet |
|---|---|
| Capture plein écran / zone / fenêtre / différée | Déclenche la capture dans l'app |
| Ouvrir la bibliothèque | Met l'app au premier plan sur la galerie |
| Dernière capture → presse-papier | Recopie la dernière capture |

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
