# 04 · Contrat d'API du serveur

Décrit les échanges **app ↔ serveur**. L'app est un **client** qui pousse des captures ;
l'interface web est servie par le même serveur pour la consultation humaine.

- **Base URL** : `http://IP:3010` (local) ou `https://screens.tondomaine.fr` (distant).
- **Format** : JSON, sauf l'upload d'image (multipart/form-data).
- **Fuseau/dates** : ISO 8601 (UTC).

---

## 1. Authentification

Deux mécanismes distincts :

| Public | Méthode | Usage |
|---|---|---|
| **App** | **Jeton d'API** (Bearer) | Envoi des captures. En-tête `Authorization: Bearer <jeton>`. |
| **Humain (web)** | **Session** (cookie) après login | Consultation de la galerie à distance. |

Le jeton est généré dans **Administration → Jetons d'API** ; seul son **hash** est stocké
côté serveur (il n'est affiché qu'une fois à la création).

---

## 2. Endpoints API (pour l'app)

### `GET /api/health`
Vérifie que le serveur répond (utilisé par « Tester la connexion »).
```json
200 → { "status": "ok", "version": "1.0.0" }
```

### `POST /api/captures`
Envoie une capture. `Content-Type: multipart/form-data`.

Champs :
| Champ | Type | Description |
|---|---|---|
| `file` | binaire | l'image (PNG/JPG/WebP) |
| `meta` | JSON | `{ "filename", "createdAt", "width", "height", "folder", "tags": [] }` |

```json
201 → { "id": "srv_abc123", "url": "/captures/srv_abc123" }
401 → { "error": "jeton invalide" }
413 → { "error": "fichier trop volumineux" }
```

### `GET /api/captures?folder=&tag=&from=&to=&page=`
Liste paginée (utile pour vérifier l'état / futures fonctions de sync).
```json
200 → { "items": [ { "id", "filename", "createdAt", "folder", "tags", "thumbUrl" } ], "page": 1, "total": 42 }
```

### `DELETE /api/captures/:id`
Supprime une capture côté serveur.
```json
200 → { "deleted": true }
```

---

## 3. Interface web (pour l'humain)

Servie par le même serveur (pages HTML + assets), protégée par **session** :

| Route | Rôle |
|---|---|
| `GET /login` · `POST /login` | Connexion admin |
| `GET /` | Galerie (grille, filtres dossier/tag/date) |
| `GET /captures/:id` | Aperçu grand + téléchargement |
| `GET /admin` | Administration |
| `POST /admin/tokens` · `DELETE /admin/tokens/:id` | Gérer les jetons d'API |
| `POST /admin/update` | Bouton « Mettre à jour le site » (`git pull` + redémarrage) |

Au **tout premier lancement**, si aucun utilisateur n'existe, le serveur redirige vers un
écran **« Créer le compte admin »**.

---

## 4. Codes d'erreur communs

| Code | Signification |
|---|---|
| 400 | Requête mal formée (métadonnées manquantes) |
| 401 | Jeton/session invalide ou absent |
| 403 | Accès refusé |
| 404 | Ressource inconnue |
| 413 | Fichier trop volumineux (dépasse la limite d'upload) |
| 415 | Type de fichier non supporté |
| 500 | Erreur serveur |

---

## 5. Règles de sécurité (rappel)

- HTTPS obligatoire en distant (Cloudflare Tunnel).
- Mots de passe et jetons **hachés** (argon2/bcrypt).
- Validation du **type MIME** et de la **taille** des uploads.
- Aucune image accessible sans session ou sans jeton valide.
- Journaux sans données sensibles.
