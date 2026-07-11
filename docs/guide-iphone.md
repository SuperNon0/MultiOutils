# 📱 Guide : partager depuis ton iPhone vers MultiOutils

Ce guide configure le bouton **« Envoyer à MultiOutils »** dans le menu **Partager**
de l'iPhone. Une fois en place : tu sélectionnes un texte (ou une photo) → Partager →
MultiOutils → il arrive sur ton serveur **et** dans le module Presse-papiers de ton PC
(en moins de 30 secondes).

Aucune app à installer : on utilise l'app **Raccourcis** d'Apple (déjà sur l'iPhone).

---

## Avant de commencer : 2 informations à récupérer

1. **L'URL de ton serveur** — celle de ton tunnel Cloudflare, par ex.
   `https://screens.tondomaine.fr` (elle doit être en **https**).
2. **Un jeton API** — sur le site : **Administration → Jetons d'API →
   « Générer un jeton »** (nom : `iPhone` par exemple). Copie-le : il ressemble à
   `mo_XXXXXXXX…` et n'est affiché qu'une seule fois.

> 💡 Tu peux réutiliser le jeton déjà configuré dans le logiciel PC, mais un jeton
> dédié « iPhone » est plus propre (révocable indépendamment si tu perds le téléphone).

---

## Raccourci n° 1 : envoyer du TEXTE

1. Ouvre l'app **Raccourcis** → onglet **Raccourcis** → **+** (nouveau raccourci).
2. Touche le nom en haut → **Renommer** → `Envoyer à MultiOutils`.
3. Touche à nouveau le nom → **Détails** (ⓘ) → active
   **« Afficher dans la feuille de partage »**. Dans **Types de partage**, décoche
   tout sauf **Texte** et **URL**.
4. Ajoute l'action **« Obtenir le contenu de l'URL »** (cherche « URL ») et
   configure-la ainsi :
   - **URL** : `https://TON-SERVEUR/api/clips`
   - Déplie **Afficher plus** :
     - **Méthode** : `POST`
     - **En-têtes** : ajoute `Authorization` → valeur `Bearer mo_TON-JETON`
       (le mot `Bearer`, un espace, puis le jeton)
     - **Corps de la requête** : `JSON`
       - champ `text` → valeur : variable **« Entrée du raccourci »**
       - champ `source` → valeur : `iphone`
5. **OK**. C'est tout !

**Test** : dans Safari ou Notes, sélectionne un texte → **Partager** →
`Envoyer à MultiOutils`. Il apparaît sur le site (page **Clips**) et sur le PC
(module **Presse-papiers**, badge 📱).

---

## Raccourci n° 2 : envoyer une PHOTO

1. **Raccourcis** → **+** → renomme en `Photo vers MultiOutils`.
2. **Détails** (ⓘ) → active **« Afficher dans la feuille de partage »** → Types :
   seulement **Images**.
3. Ajoute l'action **« Convertir l'image »** → format **JPEG**
   (⚠️ indispensable : les photos iPhone sont en HEIC, que le serveur ne lit pas).
4. Ajoute l'action **« Obtenir le contenu de l'URL »** :
   - **URL** : `https://TON-SERVEUR/api/clips`
   - **Méthode** : `POST`
   - **En-têtes** : `Authorization` → `Bearer mo_TON-JETON`
   - **Corps de la requête** : `Formulaire`
     - champ `file` → type **Fichier** → valeur : variable **« Image convertie »**
     - champ `source` → type Texte → valeur : `iphone`
5. **OK**.

**Test** : app Photos → choisis une photo → **Partager** → `Photo vers MultiOutils`.

---

## Sans raccourci : la page « Déposer »

Depuis n'importe quel appareil (iPhone, tablette, autre PC), connecte-toi au site →
**Clips → + Déposer** : colle un texte ou téléverse une photo. Même résultat.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Erreur 401 | Jeton faux ou révoqué | Vérifie l'en-tête : `Bearer` + espace + jeton complet |
| Délai dépassé | Tunnel Cloudflare arrêté | `systemctl status cloudflared` dans le conteneur |
| Erreur 415 / photo refusée | HEIC envoyé tel quel | Ajoute l'étape **Convertir l'image → JPEG** |
| Rien n'apparaît sur le PC | Sync désactivée ou serveur non configuré dans l'app | Paramètres → Presse-papiers → « Récupérer automatiquement… » + Paramètres → Serveur distant |
| Erreur 413 | Photo trop lourde | Augmente `MAX_UPLOAD_MB` dans le `.env` du serveur (défaut : 25 Mo) |

## Sécurité

- Le jeton n'autorise que l'API (envoi/lecture de clips et captures) — jamais
  l'administration.
- Tout transite en **HTTPS** via ton tunnel Cloudflare ; aucun port ouvert chez toi.
- Perds-tu l'iPhone ? **Administration → Jetons d'API → Révoquer** le jeton `iPhone`.
