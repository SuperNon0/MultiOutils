# 02 · Démarrage — lancer le logiciel et le site pour la première fois

Ce document explique **tout, pas à pas** : comment lancer **le logiciel** (sur le PC
Windows), comment lancer **le site** (le serveur, sur Proxmox), et **s'ils doivent être
connectés** (réponse courte : **non, c'est optionnel**) ainsi que **comment les
connecter** si tu le veux.

---

## 0. Réponse rapide à « doivent-ils être connectés ensemble ? »

**Non.** Le logiciel fonctionne **totalement seul**. Le site sert **uniquement** à
consulter tes captures **à distance**. Trois scénarios possibles :

| Tu veux… | Le logiciel | Le site |
|---|---|---|
| Juste capturer/éditer/ranger sur ton PC | ✅ requis | ❌ inutile |
| Capturer **et** consulter à distance | ✅ requis | ✅ requis + **connexion** |
| Regarder tes captures depuis le téléphone | (source) | ✅ requis |

La connexion se fait **dans un sens** : le logiciel **envoie** les captures choisies au
site ; ensuite tu regardes le site depuis n'importe où. Détail en §4.

---

## 1. Prérequis

**Pour développer / lancer depuis les sources :**
- Node.js 20+ et npm (ou pnpm), Git.
- Windows 10/11 pour l'app.

**Pour le site :**
- Un serveur Proxmox (le script d'install crée un conteneur LXC — voir `../install/`).
- Un compte **Cloudflare** (gratuit) si tu veux l'accès distant via Cloudflare Tunnel.

---

## 2. Lancer LE LOGICIEL pour la première fois

### 2.1 Option A — depuis l'installeur (utilisateur final)
1. Va dans les **Releases** GitHub du dépôt, télécharge le dernier `MultiOutils-Setup-x.y.z.exe`.
2. Lance l'installeur, suis l'assistant, ouvre l'application.

### 2.2 Option B — depuis les sources (développement)
```bash
git clone https://github.com/SuperNon0/MultiOutils.git
cd MultiOutils
npm install                 # installe tout le monorepo (workspaces)
npm run dev:app             # lance l'app Electron en mode développement
```

### 2.3 Assistant de première utilisation (first-run wizard)
Au tout premier lancement, l'app propose :
1. **Langue** (FR par défaut) et **thème** (sombre par défaut).
2. **Dossier de stockage** des captures (ex. `C:\Users\<toi>\Pictures\MultiOutils`).
3. **Raccourcis** clavier (valeurs par défaut proposées, modifiables).
4. **Lancement au démarrage** de Windows (oui/non).
5. Fin → l'icône apparaît dans la **barre des tâches** (system tray).

### 2.4 Vérifier que ça marche
- Appuie sur `Impr. écran` → une capture doit apparaître et être enregistrée.
- Double-clique la capture dans la bibliothèque → l'**éditeur** s'ouvre.

> À ce stade, **le logiciel est pleinement utilisable sans aucun site.**

---

## 3. Lancer LE SITE (serveur) pour la première fois

Tu as **trois façons** d'installer le serveur. La plus simple sur ton infra, c'est le
**script Proxmox** (§3.1). Détails complets et Cloudflare Tunnel dans `../install/README.md`.

### 3.1 Le plus simple — script Proxmox (crée un conteneur LXC)
Sur l'**hôte Proxmox** (shell du nœud), lance :
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/MultiOutils/main/install/proxmox-lxc.sh)"
```
Le script crée un conteneur Debian, installe Node + le serveur, et affiche à la fin
l'**adresse IP** et le **port** (par défaut `http://IP:3010`). Voir `../install/`.

### 3.2 Alternative — Docker (dans une VM/LXC)
```bash
cd install
cp .env.example .env        # règle le port, le dossier de données…
docker compose up -d
```

### 3.3 Alternative — manuel (n'importe quel Linux)
```bash
git clone https://github.com/SuperNon0/MultiOutils.git
cd MultiOutils/server
npm install
npm run build
npm start                   # écoute sur le port 3010 par défaut
```

### 3.4 Première connexion au site
1. Ouvre `http://IP:3010` dans un navigateur (sur le réseau local d'abord).
2. Le site demande de **créer le compte admin** (identifiant + mot de passe). Fais-le.
3. Tu arrives sur la **galerie** (vide pour l'instant).
4. Va dans **Administration → Jetons d'API** et clique **« Générer un jeton »**.
   ⚠️ **Copie le jeton maintenant**, il ne sera **plus jamais réaffiché** (seul son
   empreinte est stockée). Garde-le pour l'étape 4.

### 3.5 Rendre le site accessible à distance (Cloudflare Tunnel)
Résumé (détails dans `../install/README.md`) :
1. Installe `cloudflared` dans le conteneur/VM.
2. `cloudflared tunnel login` puis crée un tunnel et une route DNS
   (`cloudflared tunnel route dns <tunnel> screens.tondomaine.fr`).
3. Fais pointer le tunnel vers `http://localhost:3010`.
4. (Recommandé) protège l'URL avec **Cloudflare Access** (email/code).
5. Le site est alors accessible en **HTTPS** depuis partout, **sans ouvrir de port**.

### 3.6 Envoyer depuis l'iPhone/iPad quand Cloudflare Access est activé (jeton de service)

Si tu as protégé le site avec **Cloudflare Access** (§3.5, étape 4), le domaine
réclame une connexion **Google/e-mail** à *chaque* requête. Or un **Raccourci iOS**
ne sait pas faire ce login interactif : au lieu d'envoyer ton clip, il reçoit la
page « **Sign in with Google** » et l'envoi échoue.

La solution propre est de donner au Raccourci un **jeton de service** (*Service
Token*) : une **identité machine** que Cloudflare accepte **sans écran de
connexion**.

> 🔒 **Pourquoi c'est le plus sûr.** L'API reste protégée par **deux couches
> indépendantes** : Cloudflare (jeton de service) filtre **au bord**, *avant* même
> ton serveur, puis le jeton `Bearer` de l'app authentifie côté serveur. Une
> requête sans le bon jeton de service **n'atteint jamais** ton serveur (ton
> endpoint d'upload n'est donc pas exposé à Internet). Si l'un des deux secrets
> fuit, l'autre bloque encore.

**a) Créer le jeton de service (une seule fois)**
1. Ouvre **Cloudflare Zero Trust** (`one.dash.cloudflare.com`) →
   **Access controls → Service credentials** *(anciennement « Access → Service
   Auth → Service Tokens »)*.
2. **Create Service Token**, nomme-le (ex. `raccourci-iphone`).
3. Copie le **Client ID** et le **Client Secret** — ⚠️ le secret n'est affiché
   **qu'une seule fois**.

**b) Autoriser ce jeton sur l'API — dans une policy « Service Auth » DÉDIÉE**
1. **Access → Applications** → ouvre l'application qui protège ton domaine.
2. **Crée une NOUVELLE policy** (ne le mets pas dans la policy de tes e-mails) :
   - *Action* = **Service Auth** ⚠️ **(surtout pas « Allow »)**
   - *Include* = **Service Token** → sélectionne `raccourci-iphone`
3. Garde ta policy humaine séparée (*Action* = **Allow**, Include = tes e-mails)
   pour la consultation web via Google. Vérifie que **les deux policies sont bien
   rattachées à l'application**, puis **Save**.
   - *(Recommandé, plus propre)* : crée une **application dédiée** au chemin
     `tondomaine.fr/api` pour n'appliquer le Service Auth **qu'à l'API**, et garder
     le login Google sur l'interface web de consultation.

> ⚠️ **Le piège qui donne un « 302 » sans fin.** Un jeton de service placé dans une
> policy dont l'*Action* est **Allow** est **ignoré** : une policy Allow exige une
> **identité humaine** (session de login), or un jeton de service n'en est pas une
> → Cloudflare renvoie quand même vers la page de connexion (302). Les jetons de
> service ne fonctionnent **que** dans une policy **Service Auth**. Test rapide :
> `curl -s -o /dev/null -w "%{http_code}\n" https://tondomaine/api/health -H "CF-Access-Client-Id: …" -H "CF-Access-Client-Secret: …"`
> → **200/404/401** = ça passe ; **302** = policy en Allow (à corriger) ; **403** =
> policy Service Auth présente mais pas rattachée à cette application.

**c) Ajouter les 2 en-têtes au Raccourci**
Dans l'action **Obtenir le contenu de l'URL** du Raccourci « Envoyer à
MultiOutils », section **En-têtes**, ajoute — *en plus* de ton
`Authorization: Bearer mo_…` :

| Clé | Valeur |
|---|---|
| `CF-Access-Client-Id` | le **Client ID** |
| `CF-Access-Client-Secret` | le **Client Secret** |

Relance le Raccourci : **plus d'écran de connexion**, le clip part directement. ✅

> ♻️ **Révocation immédiate.** En cas de doute (téléphone perdu, secret exposé…),
> supprime le jeton de service dans Cloudflare : l'accès machine est coupé
> **aussitôt**, sans toucher au serveur ni à ton jeton d'app.

---

## 4. CONNECTER le logiciel et le site

À faire **une seule fois**, seulement si tu veux l'accès distant.

1. Dans le **logiciel** → **Paramètres → Serveur distant**.
2. **URL du serveur** : mets l'adresse du site
   - en local : `http://IP:3010`
   - à distance : `https://screens.tondomaine.fr`
3. **Jeton d'API** : colle le jeton généré en §3.4.
4. Clique **« Tester la connexion »** → doit afficher ✅ *Connecté*.
5. C'est fini. Désormais, sur n'importe quelle capture, le bouton **« Envoyer au
   serveur »** l'enverra sur le site.

### 4.1 Ce qui se passe quand tu envoies une capture
```
[Logiciel]  clic "Envoyer au serveur"
     │  POST /api/captures  (image + métadonnées, en-tête Authorization: Bearer <jeton>)
     ▼
[Serveur]   stocke l'image dans data/uploads + une ligne en base
     │
     ▼
[Web]       la capture apparaît dans la galerie du site → visible à distance
```
- Seules les captures **choisies** partent (jamais automatiquement).
- L'état de chaque capture est visible dans l'app : ⚪ non envoyée / 🟢 envoyée / 🔴 erreur.

---

## 5. Tenir à jour (logiciel ET site) — par bouton, à la demande

Le dépôt étant **public**, aucune authentification supplémentaire n'est nécessaire.

### 5.1 Mettre à jour le LOGICIEL
- **Paramètres → Mises à jour → « Vérifier les mises à jour »** (ou menu du tray).
- Si une version existe : notes de version + **« Télécharger et installer »** → redémarrage.
- Techniquement : `electron-updater` lit les **GitHub Releases**.

### 5.2 Mettre à jour le SITE
- Dans le site : **Administration → « Mettre à jour le site »** — la page de suivi montre la progression, puis le service redémarre tout seul.
- Le serveur exécute `git pull` sur le dépôt public + `npm install` si besoin + redémarrage.
- Affiche la version installée et la version disponible.
- ⚙️ Automatisable en option (GitHub Actions/webhook), mais le mode par défaut est
  **manuel (bouton)**.

> **Cas « dépôt privé »** : si un jour tu passes le dépôt en privé, il faut ajouter une
> **deploy key** (clé SSH lecture seule) dans le conteneur pour que `git pull` fonctionne.
> Tant que c'est public : rien à faire.

---

## 6. Dépannage (FAQ)

| Problème | Cause probable | Solution |
|---|---|---|
| Le raccourci ne capture pas | Conflit avec une autre app | Change le raccourci dans Paramètres → Raccourcis |
| « Tester la connexion » échoue | Mauvaise URL / jeton / site éteint | Vérifie l'URL, régénère un jeton, vérifie que le site tourne |
| Le site ne s'ouvre pas à distance | Tunnel non lancé | Vérifie `cloudflared`, la route DNS et Cloudflare Access |
| Le Raccourci iPhone affiche « Sign in with Google » | Cloudflare Access bloque la requête machine | Ajoute un **jeton de service** au Raccourci (§3.6) |
| Capture 🔴 erreur | Jeton révoqué ou quota atteint | Régénère un jeton / libère de l'espace |
| L'app ne démarre pas avec Windows | Option désactivée | Paramètres → Général → Lancement au démarrage |
| Mise à jour du site échoue | Dépôt passé en privé sans deploy key | Ajoute une deploy key (§5.2) |

---

## 7. Récapitulatif express

1. **Logiciel** : installer → assistant (dossier, raccourcis, démarrage auto) → capturer.
   *Fonctionne seul.*
2. **Site** (optionnel) : script Proxmox → créer l'admin → générer un jeton → Cloudflare
   Tunnel pour l'accès distant.
3. **Connexion** (optionnelle) : Paramètres → Serveur distant → URL + jeton → tester.
4. **Mises à jour** : bouton dans le logiciel, bouton dans le site.
