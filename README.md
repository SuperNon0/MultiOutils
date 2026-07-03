# MultiOutils

**Boîte à outils modulaire pour Windows**, centrée d'abord sur la **capture et la gestion
d'écran** (capturer, éditer/annoter, ranger, partager) — et conçue pour accueillir
d'autres outils par la suite. Accès distant optionnel via un serveur auto-hébergé.

> 🚧 **Phase 1 (MVP capture) développée** : app Electron avec captures plein écran /
> zone / fenêtre / multi-écran / différée, raccourcis globaux, system tray, galerie de
> base, paramètres, i18n FR/EN. Suite du plan : éditeur (2), bibliothèque avancée (3),
> mises à jour (4), serveur (5), Stream Deck (6), bonus (7). Voir
> [`docs/06-decisions-techniques.md`](docs/06-decisions-techniques.md).

## 🚀 Développer / lancer depuis les sources

```bash
git clone https://github.com/SuperNon0/MultiOutils.git
cd MultiOutils
npm install         # installe tout le monorepo (workspaces)
npm run dev:app     # lance l'app Electron en mode développement
npm test            # tests · npm run typecheck · npm run build:app
```

## 📖 Par où commencer

| Je veux… | Aller à |
|---|---|
| La **vue d'ensemble** (jolie) | [`CDC.html`](CDC.html) (ouvrir dans un navigateur) · [`CDC.md`](CDC.md) |
| La **spec détaillée pour développer** | [`docs/`](docs/) → [`docs/README.md`](docs/README.md) |
| **Lancer** le logiciel et le site (1ʳᵉ fois) | [`docs/02-demarrage.md`](docs/02-demarrage.md) |
| **Installer le serveur** (Proxmox / Docker) | [`install/`](install/) → [`install/README.md`](install/README.md) |

## 🧩 Contenu prévu (monorepo)

- `desktop-app/` — application Electron (capture, éditeur, bibliothèque, modules)
- `server/` — serveur auto-hébergé + interface web (consultation à distance)
- `streamdeck-plugin/` — plugin Stream Deck

## ✨ Grandes lignes

- Capture plein écran / zone / fenêtre / multi-écran / différée, raccourcis globaux
- Éditeur : formes, flèches, texte, flou, numérotation d'étapes, undo/redo
- Bibliothèque : **dossiers, tags, favoris**, recherche, corbeille
- Lancement au démarrage, system tray, **mise à jour par bouton** depuis GitHub
- **Accès distant** auto-hébergé (Proxmox + Cloudflare Tunnel), envoi à la demande
- Bonus : OCR, pipette de couleur
- **Architecture modulaire** : ajouter un nouvel outil sans toucher aux autres

## 📄 Licence

À définir.
