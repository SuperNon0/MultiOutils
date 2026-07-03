# 🖥️ Installation du serveur MultiOutils (le « site »)

Ce dossier contient tout pour installer le **serveur auto-hébergé** qui permet de
**consulter tes captures à distance**. Trois méthodes, de la plus simple à la plus
manuelle. Ensuite, **Cloudflare Tunnel** pour l'accès distant.

> Rappel : le serveur est **optionnel**. Le logiciel fonctionne seul. Le serveur sert
> uniquement à voir tes captures depuis l'extérieur. Voir `../docs/02-demarrage.md`.

---

## Méthode 1 — Script Proxmox (recommandé, crée un conteneur LXC)

Sur le **shell de ton hôte Proxmox** (le nœud, en root) :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/MultiOutils/main/install/proxmox-lxc.sh)"
```

Le script ([`proxmox-lxc.sh`](proxmox-lxc.sh)) :
1. crée un conteneur **LXC Debian 12** (non privilégié) ;
2. installe **Node.js 20** + le serveur ;
3. crée un **service systemd** (`multioutils`) qui redémarre tout seul ;
4. affiche l'**IP** et le **port** d'accès (par défaut `:3000`).

**Personnaliser** (avant de lancer, exporte des variables) :
```bash
CTID=150 HOSTNAME=multioutils RAM_MB=1024 DISK_GB=8 CORES=2 \
BRIDGE=vmbr0 STORAGE=local-lvm APP_PORT=3000 \
bash -c "$(curl -fsSL .../install/proxmox-lxc.sh)"
```

> 💡 **Style community-scripts.org** : ce script suit le même principe (exécution sur
> l'hôte PVE, création d'un LXC), mais il est **autonome et lisible** pour que tu puisses
> le relire. Quand tu m'enverras le lien du framework community-scripts, je pourrai
> l'empaqueter au format exact (`ct/multioutils.sh` + `install/multioutils-install.sh`).

---

## Méthode 2 — Docker Compose

Dans une VM/LXC Debian (ou tout hôte Docker) :
```bash
git clone https://github.com/SuperNon0/MultiOutils.git
cd MultiOutils/install
cp .env.example .env      # règle APP_PORT, DATA_DIR…
docker compose up -d
```
Les images et la base sont persistées dans le dossier `DATA_DIR`.

---

## Méthode 3 — Manuelle (tout Linux)

```bash
git clone https://github.com/SuperNon0/MultiOutils.git
cd MultiOutils/server
npm install
npm run build
npm start                 # écoute sur le port 3000
```

---

## Première configuration (identique aux 3 méthodes)

1. Ouvre `http://IP:3000` sur le réseau local.
2. **Crée le compte admin** (identifiant + mot de passe).
3. **Administration → Jetons d'API → Générer** — ⚠️ copie le jeton (affiché une seule fois).
4. Garde ce jeton pour connecter le logiciel (Paramètres → Serveur distant).

---

## Accès distant — Cloudflare Tunnel

Permet d'accéder au site depuis l'extérieur en **HTTPS**, **sans ouvrir de port** sur ta
box.

### A. Dans le conteneur / la VM du serveur
```bash
# Installer cloudflared (Debian/Ubuntu)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | tee /etc/apt/sources.list.d/cloudflared.list
apt-get update && apt-get install -y cloudflared

# Authentifier + créer le tunnel
cloudflared tunnel login
cloudflared tunnel create multioutils
cloudflared tunnel route dns multioutils screens.tondomaine.fr
```

### B. Config du tunnel
Crée `/etc/cloudflared/config.yml` :
```yaml
tunnel: multioutils
credentials-file: /root/.cloudflared/<ID-DU-TUNNEL>.json
ingress:
  - hostname: screens.tondomaine.fr
    service: http://localhost:3000
  - service: http_status:404
```
Puis lance en service :
```bash
cloudflared service install
systemctl enable --now cloudflared
```

### C. (Recommandé) Cloudflare Access
Dans le dashboard **Cloudflare Zero Trust → Access → Applications**, ajoute une règle sur
`screens.tondomaine.fr` (ex. autoriser seulement ton email). Ça ajoute une **2ᵉ barrière**
avant même la page de connexion du site.

> Variante « tout Docker » : décommente le service `cloudflared` dans
> [`docker-compose.yml`](docker-compose.yml) et colle le **token de tunnel** créé depuis le
> dashboard (méthode sans fichier de config).

---

## Mise à jour du site (bouton)

Dans le site : **Administration → « Mettre à jour le site »** → `git pull` + redémarrage
du service. Le dépôt étant **public**, aucun accès supplémentaire n'est nécessaire.
(Si un jour le dépôt passe en privé : ajoute une **deploy key** SSH lecture seule dans le
conteneur.)

---

## Sauvegarde

Tout ce qui compte est dans **`server/data/`** (images + base SQLite). Sauvegarde ce
dossier (ou snapshot du conteneur via Proxmox Backup).

---

## Dépannage

| Symptôme | Piste |
|---|---|
| Le service ne démarre pas | `systemctl status multioutils` puis `journalctl -u multioutils -e` |
| Page inaccessible en local | Vérifie l'IP du conteneur (`pct exec <CTID> -- hostname -I`) et le port |
| Inaccessible à distance | `systemctl status cloudflared`, route DNS, règle Access |
| `pveam` ne trouve pas Debian 12 | `pveam update` puis relance |
