# 07 · Le lanceur (recréation de Flow Launcher)

Le module **Lanceur** recrée dans MultiOutils les fonctions **de base** de
[Flow Launcher](https://github.com/Flow-Launcher/Flow.Launcher) (C#/WPF, licence
MIT — voir `THIRD_PARTY_NOTICES.md`). Le **système de plugins tiers**, le
**magasin de plugins** et les plugins **Python / Node / JSON-RPC** sont laissés
de côté pour le moment : seuls les fournisseurs intégrés existent.

## Utilisation

- **Alt+Espace** (réglable) ouvre la barre, n'importe où. Échap ou un clic
  ailleurs la referme.
- Clavier : ↑↓ (ou Tab / Maj+Tab) naviguer · **Entrée** ouvrir · **Ctrl+Entrée**
  action secondaire (ouvrir le dossier) · **Maj+Entrée** ou **→** menu d'actions
  (← ou Échap pour revenir) · **Ctrl+Maj+Entrée** exécuter en administrateur ·
  **Alt+1…9** ouvrir le n-ième résultat · **Tab** complète un chemin ou une
  recherche récente quand c'est possible.
- Barre vide : recherches récentes. À la réouverture, la dernière recherche est
  sélectionnée (ou gardée, ou effacée — réglable).

| Tape… | Fournisseur | Mot-clé par défaut |
|---|---|---|
| `chrome`, `vsc` | Programmes : menu Démarrer (utilisateur + commun), bureau, dossiers indexés, applis empaquetées (`Get-StartApps`) | global |
| `f facture` | Fichiers : Everything (`es.exe`) → index Windows Search (OLE DB `SystemIndex` via PowerShell) → parcours limité des dossiers utilisateur | `f` |
| `C:\Users\`, `~\`, `\\serveur\` | Fichiers : contenu du dossier, filtré, Tab complète | global |
| `12*7,5`, `sqrt(2)`, `20%` | Calculatrice (analyseur sûr, sans `eval`) — Entrée copie | global |
| `g météo`, `yt …`, `w …` | Recherche web (moteurs configurables) ; moteur par défaut en dernier résultat | un par moteur |
| `github.com` | URL : ouvre l'adresse | global |
| `> ipconfig` | Shell : cmd ou PowerShell, historique des commandes | `>` |
| `éteindre`, `verrouiller` | Commandes système (confirmation pour les actions destructives) | global |
| `wifi`, `pare-feu` | Paramètres Windows (`ms-settings:`) + Panneau de configuration, FR et EN | global |
| `kill chrome` | Tueur de processus (groupés par nom, PID au menu) | `kill` |
| `github` | Favoris Chrome / Edge / Brave / Vivaldi / Chromium (JSON) + Firefox (`places.sqlite` lu sur une copie) | global |
| `zone`, `pipette` | Outils MultiOutils (commandes locales des modules) | global |

Mot-clé alphanumérique : suivi d'un espace (`g ` active Google, `g` seul reste
global — différence voulue avec Flow pour ne pas masquer les programmes en
« g »). Mot-clé symbolique (`>`) : peut être collé (`>dir`).

## Architecture

```
src/common/launcher.ts                 types partagés main / preload / renderer
src/main/modules/launcher/
  index.ts                             MainToolModule : IPC, raccourci, réglages, index
  window.ts                            fenêtre pré-créée, transparente, centrée sur l'écran de la souris
  core/   (pur, testé, sans Electron)
    matcher.ts    portage du StringMatcher de Flow (acronymes, début de mot, accents ignorés)
    calculator.ts analyseur à descente récursive
    query.ts      mots-clés d'action, exclusions
    ranking.ts    UsageRecord (sélections : requête×5 + résultat), tri, dédoublonnage, limite
    engine.ts     répartition aux fournisseurs, annulation (AbortSignal), résultats au fil de l'eau
    parsers.ts    favoris, tasklist/ps, Get-StartApps, .url, requête Windows Search
    web.ts, catalog.ts, settings.ts
  providers/      programmes, fichiers, système/shell/processus/outils, favoris, simples
src/renderer/src/modules/launcher/     panneau + réglages (ToolModule) + fenêtre du lanceur
src/renderer/src/windows/Launcher.tsx  route #/launcher (chargée paresseusement)
```

- **Flux** : le rendu envoie `launcher:query(texte, id)` (debounce réglable) ;
  le moteur annule la requête précédente, interroge les fournisseurs concernés
  et pousse `launcher:results` à chaque réponse (les lents — Windows Search,
  processus — n'attendent pas). Les résultats périmés sont ignorés par id.
- **Classement** : score de correspondance + priorité du fournisseur + bonus
  d'usage plafonné (150). La recherche web par défaut reste toujours en dernier.
- **Persistance** : table `settings` (clés `launcher.settings`,
  `launcher.usage`, `launcher.history`, `launcher.shellHistory`) ; index des
  programmes en cache dans `userData/launcher-programs.json`, rafraîchi 4 s
  après le démarrage puis toutes les 30 min (et sur « Réindexer »).
- **Outils MultiOutils** : le lanceur ne référence aucun module ; il appelle les
  commandes locales (`capture.region`, `colorpicker.start`, `clips.open`…) via
  `MainHostContext.runLocalCommand` / `hasLocalCommand` (ajoutés pour lui), ou
  `showMainWindow({ view: 'tool', toolId })`. Il attend ~220 ms avant une
  capture pour que sa fenêtre ait disparu.
- **Design** : kit « encre » (`renderer/src/encre/`, copie verbatim) — palette
  de recherche en verre (`palette`, `pal-g`, `pal-it`), coins 24 px, accent sur
  le résultat sélectionné, icônes du sprite. Accent et thème lus dans
  `AppSettings.appearance` (lecture tolérante, défaut lavande / auto) et posés
  en `data-accent` / `data-theme` sur `<html>`.
- **Multi-plateforme** : tout le code Windows est derrière
  `process.platform === 'win32'` ; sous Linux/mac le lanceur démarre avec
  calculatrice, web, URL, shell (`/bin/sh`), processus (`ps`), favoris et
  chemins tapés.

## Limites connues

- Le flou du verre ne s'applique pas au bureau (Chromium ne floute que son
  propre contenu) : la palette est donc presque opaque (93 %). Le matériau
  acrylique de Windows 11 (`backgroundMaterial`) est incompatible avec une
  fenêtre transparente et n'est pas utilisé.
- Pas d'icônes pour les applis empaquetées (Store) : icône générique.
- Pas de suggestions de recherche web (requête réseau), ni de recherche dans le
  contenu des fichiers, ni de « Quick Access » / historique de l'Explorateur.
- Mise en veille : `SetSuspendState` via PowerShell/WinForms ; si la veille
  prolongée est active sur le PC, Windows peut hiberner à la place.
- Testé sous Linux uniquement (tests unitaires + captures avec un faux
  `window.api`) : les fournisseurs Windows (programmes, Windows Search,
  Everything, tasklist, commandes système, UAC) restent à vérifier sur un vrai
  PC Windows.
