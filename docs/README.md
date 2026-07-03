# 📚 Documentation MultiOutils

Ce dossier contient **tout ce qu'il faut pour construire, installer et faire tourner
MultiOutils**. Il est conçu pour être lu par un humain **ou par une IA qui développe le
projet** : chaque fonction est décrite en détail, avec le comportement attendu, les cas
limites et des critères d'acceptation.

## Ordre de lecture conseillé

| # | Fichier | Contenu |
|---|---|---|
| 00 | [`00-specifications-detaillees.md`](00-specifications-detaillees.md) | **La spec complète** — chaque fonction décrite en détail (capture, éditeur, bibliothèque, système, serveur, Stream Deck, bonus). Le document principal pour développer. |
| 01 | [`01-architecture.md`](01-architecture.md) | Architecture technique, arborescence du monorepo, modèle de données (schémas SQL), système de **modules** (le screenshot n'est qu'un module parmi d'autres à venir), canaux IPC. |
| 02 | [`02-demarrage.md`](02-demarrage.md) | **Comment lancer pour la première fois** le logiciel ET le site, et **comment les connecter** (ou pas). Pas à pas, avec dépannage. |
| 03 | [`03-organisation-captures.md`](03-organisation-captures.md) | Le système de **dossiers, tags et tri** des captures (local + serveur). |
| 04 | [`04-api-serveur.md`](04-api-serveur.md) | Le **contrat d'API** entre l'app et le serveur (endpoints, formats, authentification). |
| 05 | [`05-prompt-pour-ia.md`](05-prompt-pour-ia.md) | Le **prompt prêt à copier-coller** à donner à l'IA qui développera le projet. |

Pour l'installation du serveur sur Proxmox, voir le dossier [`../install/`](../install/).

## Résumé graphique

Une vue d'ensemble stylée existe à la racine : [`../CDC.html`](../CDC.html) (à ouvrir dans
un navigateur) et [`../CDC.md`](../CDC.md) (version texte).

## Principe fondateur à retenir

> **MultiOutils est une boîte à outils modulaire.** La capture d'écran est le **premier
> module**, mais l'application est conçue comme un **hôte** qui accueille plusieurs outils
> indépendants (capture, puis d'autres à venir). Toute l'architecture doit permettre
> d'**ajouter un nouvel outil sans toucher aux autres**. Voir §2 du fichier 01.
