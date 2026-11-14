# Audit de code — MultiOutils 0.9.0 (14 novembre 2026)

## Périmètre et méthode

Revue du dépôt GitHub `SuperNon0/MultiOutils` à partir de la branche `main` après publication de `v0.9.0`.
Le dépôt contient **444 entrées** (dont **193 fichiers TypeScript/TSX et 13 fichiers de tests `*.test.ts`**) selon l'inventaire GitHub au moment de l'audit. Les vérifications sont organisées par sujets : sauvegardes/SQLite, Electron et données sensibles, widgets/Home Assistant, notes et palette, fichiers/captures, serveur et CI.

Les fichiers critiques de chaque domaine ont été inspectés, mais **il ne s'agit pas d'une vérification exhaustive ligne par ligne des 444 entrées**. Les tests automatisés Linux et Windows de la version `main` et de la branche corrective ont réussi. Aucun accès au poste Windows réel, à l'instance Home Assistant, au serveur déployé ni au plugin Stream Deck physique : les scénarios de bout en bout ne sont donc pas confirmés.

## Constats

| Priorité | Sujet | Élément vérifié | Action |
|---|---|---|---|
| Haute | Jeton serveur de captures en clair si `safeStorage` indisponible | `desktop-app/src/main/modules/screenshot/remote.ts` (`plain:`) | Correction PR #41 : chiffrement obligatoire et migration des anciennes valeurs |
| Moyenne | Mini cloud et presse-papiers acceptaient aussi `plain:` | `desktop-app/src/main/modules/desktop/index.ts`, `desktop-app/src/main/modules/clipboard/index.ts` | Correction PR #41 : migration cohérente dans les trois modules |
| Moyenne | Commandes locales Stream Deck non authentifiées | `desktop-app/src/main/local-service.ts` : `Host` et `Origin` filtrés, mais absence de secret sur `POST /command/*` | Ticket #39 ; modifier l'app ET le plugin ensemble |
| Haute | Déplacement inter-disques d'un lien symbolique/jonction potentiellement silencieusement supprimé | `desktop-app/src/main/modules/files/jobs.ts` : `walk()` ignorait les types non ordinaires avant suppression de source | Correction PR #41 : refuser ce cas avant suppression |
| Moyenne | Restauration invalide bloquant le démarrage suivant | `desktop-app/src/main/backups.ts` : validation avant ouverture de la base sans quarantaine | Correction PR #41 |
| Moyenne | Validation end-to-end des sauvegardes encore manquante | `desktop-app/src/main/backups.ts` et flux WAL SQLite | Ticket #40 ; tests Windows sur profil de test |
| Faible | Double enregistrement d'une note depuis le widget | `ZoneWidgets.tsx` : `notes.save` sans identifiant d'une note existante | Correction PR #41 : identifiant archivé conservé avec la zone, y compris après redémarrage |
| Faible | Identifiants HTML partagés entre palettes Encre | `EncreColorPicker.tsx` : `encre-hue`, `encre-hex` | Correction PR #41 : identifiants React uniques |
| Moyenne | Sessions serveur stockées en mémoire ; revue CSRF/connexion requise | `server/src/index.ts`, `routes/admin.ts`, `routes/web.ts` | Ticket #42 ; approfondir sur serveur isolé |

## Points positifs relevés

- `desktop-app/src/main/storage/db.ts` : WAL SQLite, clés étrangères activées ; snapshots DB via API `better-sqlite3.backup()`.
- `desktop-app/src/main/modules/ai/keys.ts` : clés fournisseurs chiffrées via `safeStorage`, refus explicite si indisponible.
- `desktop-app/src/main/modules/launcher/index.ts` : clés Home Assistant chiffrées et non renvoyées au renderer ; identifiants des entités validés dans le client de graphique.
- `desktop-app/src/main/windows.ts` : `contextIsolation: true`, `nodeIntegration: false` pour la fenêtre principale.
- `desktop-app/src/main/modules/launcher/homeassistant/dashboard.ts` : `sandbox: true` sur la vue HA et vérification d'origine lors des navigations.
- `desktop-app/src/main/modules/files/tools.ts` : sortie ZIP renommée en cas de collision et utilisation de `-LiteralPath` pour PowerShell.
- `server/src/auth.ts` : jetons API générés aléatoirement, seul le hash Argon2 étant conservé ; borne de vérifications concurrentes.

Ces protections sont utiles mais ne constituent **pas** une preuve que chaque chemin d'entrée est exempt de vulnérabilité.

## Vérifications qui restent nécessaires

1. Installer la version corrigée sur un profil Windows de test, sauvegarder/restaurer avec données SQLite et fichiers externes, et simuler un échec de disque ou permissions.
2. Tester un plugin Stream Deck réel avant l'ajout de la nouvelle authentification locale (#39).
3. Simuler un déplacement de jonction/lien symbolique entre deux volumes sur un profil de test ; confirmer qu'il reste intact après le message d'erreur.
4. Vérifier des graphiques HA sur de vrais capteurs (valeurs numériques, `unknown`, perte réseau, 24h/7j).
5. Tester le parcours de modification/suppression des notes, persistance après relance et sélection de plusieurs palettes Encre.
6. Tester les routes sensibles du serveur (authentification, CSRF, limitations de tentatives) et substituer un store de session persistant (#42).
7. Exécuter une analyse de dépendances (`npm audit` / Dependabot) avec les accès nécessaires ; non effectuée ici.

## Suivi

- Correctifs ciblés : **PR #41** — ne pas confondre CI réussie et validation fonctionnelle Windows.
- Authentification localhost : **#39**.
- Restauration de bout en bout : **#40**.
- Sécurité de session serveur : **#42**.

Aucun changement ne doit être déployé sur une installation personnelle ou un serveur de production sans sauvegarde vérifiée et test de restauration sur profil isolé.
