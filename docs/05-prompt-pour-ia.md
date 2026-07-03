# 05 · Prompt à donner à l'IA développeuse

> Copie tout le bloc ci-dessous et donne-le à l'IA qui va développer le projet.
> Tu peux ajuster le nom du dépôt / la branche si besoin.

---

```text
Tu es un développeur senior chargé de construire une application de A à Z.

📌 MISSION
Développer « MultiOutils » : une boîte à outils modulaire pour Windows, centrée d'abord
sur la capture et la gestion d'écran, avec un serveur auto-hébergé optionnel pour
consulter les captures à distance, et un plugin Stream Deck.

📂 TOUTE LA SPÉCIFICATION EST DANS LE DÉPÔT GITHUB
Dépôt : https://github.com/SuperNon0/MultiOutils   (public)
Branche à lire : claude/windows-screenshot-manager-xm707t
(si elle est déjà fusionnée dans main, lis main)

AVANT D'ÉCRIRE LA MOINDRE LIGNE DE CODE, lis ces fichiers dans cet ordre :
  1. README.md                         — vue d'ensemble
  2. docs/README.md                    — index de la documentation
  3. docs/00-specifications-detaillees.md — CHAQUE fonction décrite en détail (+ critères
                                           d'acceptation ✅). C'est LE document de référence.
  4. docs/01-architecture.md           — architecture, système de MODULES, schémas de base
                                           de données, arborescence du monorepo, IPC
  5. docs/02-demarrage.md              — comment lancer app + serveur, et comment ils se
                                           connectent
  6. docs/03-organisation-captures.md  — dossiers, tags, favoris, tri
  7. docs/04-api-serveur.md            — contrat d'API app ↔ serveur
  8. install/README.md                 — installation du serveur (Proxmox, Docker, Cloudflare)
  9. CDC.html                          — le THÈME VISUEL à respecter (sombre, accent doré
                                           #e8c547, DM Serif Display + DM Mono)

Considère la documentation comme la source de vérité. Si un détail manque ou est ambigu,
POSE-MOI LA QUESTION avant de trancher — n'invente pas de comportement.

🧱 CONTRAINTES NON NÉGOCIABLES
- Stack : Electron + TypeScript + React (app) ; Node.js/Express + SQLite (serveur) ;
  Konva pour l'éditeur ; electron-updater + electron-builder ; SDK Elgato pour Stream Deck.
- ARCHITECTURE MODULAIRE : l'app est un HÔTE qui charge des OUTILS (modules). La capture
  est le premier module ; on doit pouvoir ajouter un outil SANS modifier les autres
  (voir docs/01-architecture.md §2, interface ToolModule). Ne code rien « en dur » dans
  l'hôte.
- LOCAL D'ABORD : l'app fonctionne 100 % hors-ligne. Le serveur est OPTIONNEL. L'envoi
  d'une capture au serveur est TOUJOURS explicite (bouton), jamais automatique.
- MISES À JOUR À LA DEMANDE (bouton) : logiciel via GitHub Releases (electron-updater),
  site via `git pull`. Dépôt public → pas d'authentification supplémentaire.
- THÈME : respecter exactement le thème de CDC.html (dark-only, doré, DM Serif/DM Mono).
- LANGUE : interface en français par défaut (anglais fourni). Textes externalisés (i18n).
- SÉCURITÉ : mots de passe et jetons hachés (argon2/bcrypt) ; HTTPS pour le serveur
  distant ; aucune ressource accessible sans authentification ; pas de télémétrie.
- CIBLE : Windows 10 et 11, multi-écran et mise à l'échelle DPI gérés.

🗂️ MÉTHODE DE TRAVAIL
- Monorepo (workspaces) : desktop-app/ , server/ , streamdeck-plugin/ , packages/shared/ .
- Travaille par PHASES (voir CDC / docs). Commence par la PHASE 1 (MVP capture) :
  captures plein écran / zone / fenêtre / multi-écran, raccourcis globaux, system tray,
  lancement au démarrage, galerie de base. Livre une base qui marche AVANT d'ajouter
  l'éditeur, la bibliothèque avancée, le serveur, etc.
- Après chaque phase : code qui compile et se lance, un court récap de ce qui est fait,
  et les critères d'acceptation de docs/00 cochés.
- Commits clairs et fréquents. Écris des tests là où c'est pertinent.
- Mets à jour la documentation si tu prends une décision technique qui la complète.

▶️ PREMIÈRE RÉPONSE ATTENDUE
1. Confirme que tu as lu la documentation (résume en 5 lignes ce que tu vas construire).
2. Liste les questions éventuelles là où la spec est ambiguë.
3. Propose le plan de la Phase 1 (fichiers à créer, ordre) et attends mon feu vert, ou
   commence si tout est clair.
```

---

## Variante courte (si tu veux un prompt minimal)

```text
Développe « MultiOutils » (boîte à outils Windows modulaire : capture + gestion d'écran,
serveur auto-hébergé optionnel, plugin Stream Deck). TOUTE la spécification est dans le
dépôt public https://github.com/SuperNon0/MultiOutils (branche
claude/windows-screenshot-manager-xm707t) : commence par lire README.md puis le dossier
docs/ (surtout docs/00-specifications-detaillees.md et docs/01-architecture.md) et respecte
le thème de CDC.html. Contraintes clés : architecture modulaire (hôte + outils), l'app
marche hors-ligne (serveur optionnel, envoi manuel), mises à jour par bouton, interface FR,
stack Electron+TypeScript / Node+SQLite. Confirme d'abord ta compréhension, pose tes
questions, puis commence par la Phase 1 (MVP capture). Ne devine pas : demande si un détail
manque.
```
