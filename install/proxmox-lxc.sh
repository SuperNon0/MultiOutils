#!/usr/bin/env bash
# =============================================================================
#  MultiOutils · Installeur serveur pour Proxmox VE (crée un conteneur LXC)
# -----------------------------------------------------------------------------
#  À LANCER SUR L'HÔTE PROXMOX (shell du nœud), pas dans un conteneur :
#
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/MultiOutils/main/install/proxmox-lxc.sh)"
#
#  Ce que fait le script :
#    1. Vérifie qu'on est bien sur un hôte Proxmox.
#    2. Crée un conteneur LXC Debian 12 (non privilégié).
#    3. Installe Node.js + le serveur MultiOutils dedans.
#    4. Crée un service systemd et démarre le site (port 3000 par défaut).
#    5. Affiche l'adresse d'accès.
#
#  Esprit proche des scripts community-scripts.org, mais AUTONOME et LISIBLE
#  pour que tu puisses tout vérifier avant de lancer. Relis-le, adapte les
#  variables ci-dessous, puis exécute.
# =============================================================================
set -euo pipefail

# ─── Paramètres (modifiables) ────────────────────────────────────────────────
CTID="${CTID:-}"                       # ID du conteneur (vide = prochain libre)
HOSTNAME="${HOSTNAME:-multioutils}"
DISK_GB="${DISK_GB:-8}"                 # taille du disque (Go)
RAM_MB="${RAM_MB:-1024}"                # mémoire (Mo)
CORES="${CORES:-2}"
BRIDGE="${BRIDGE:-vmbr0}"               # pont réseau
STORAGE="${STORAGE:-local-lvm}"         # stockage du rootfs
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
NET="${NET:-dhcp}"                       # 'dhcp' ou ex. '192.168.1.50/24,gw=192.168.1.1'
APP_PORT="${APP_PORT:-3000}"
REPO_URL="${REPO_URL:-https://github.com/SuperNon0/MultiOutils.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
UNPRIVILEGED="${UNPRIVILEGED:-1}"

# ─── Aides ────────────────────────────────────────────────────────────────────
msg()  { echo -e "\e[1;33m[MultiOutils]\e[0m $*"; }
ok()   { echo -e "\e[1;32m[ OK ]\e[0m $*"; }
die()  { echo -e "\e[1;31m[ERREUR]\e[0m $*" >&2; exit 1; }

# ─── Vérifications ────────────────────────────────────────────────────────────
command -v pct >/dev/null 2>&1 || die "Ce script doit tourner sur un hôte Proxmox VE (commande 'pct' introuvable)."
[ "$(id -u)" -eq 0 ] || die "Lance ce script en root sur l'hôte Proxmox."

# Prochain CTID libre si non fourni
if [ -z "$CTID" ]; then
  CTID="$(pvesh get /cluster/nextid)"
fi
msg "Conteneur cible : CTID=$CTID, hostname=$HOSTNAME"

# ─── Template Debian 12 ───────────────────────────────────────────────────────
msg "Recherche du template Debian 12…"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available --section system | awk '/debian-12-standard/{print $2}' | sort | tail -n1)"
[ -n "$TEMPLATE" ] || die "Aucun template debian-12-standard disponible via 'pveam available'."

if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  msg "Téléchargement du template $TEMPLATE…"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi
TEMPLATE_REF="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"
ok "Template prêt : $TEMPLATE_REF"

# ─── Création du conteneur ────────────────────────────────────────────────────
msg "Création du conteneur LXC…"
pct create "$CTID" "$TEMPLATE_REF" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$RAM_MB" \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=${NET}" \
  --unprivileged "$UNPRIVILEGED" \
  --features nesting=1 \
  --onboot 1
ok "Conteneur $CTID créé."

msg "Démarrage du conteneur…"
pct start "$CTID"
sleep 5

# ─── Installation à l'intérieur du conteneur ─────────────────────────────────
msg "Installation de Node.js + serveur MultiOutils dans le conteneur…"
pct exec "$CTID" -- bash -eux <<EOF
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ca-certificates build-essential

# Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Récupération du code + build du serveur
mkdir -p /opt
git clone --branch "$REPO_BRANCH" "$REPO_URL" /opt/multioutils
cd /opt/multioutils/server
npm install
npm run build || echo "(pas de build défini pour l'instant — sera pris en compte quand le serveur existera)"

# Fichier d'environnement
cat > /opt/multioutils/server/.env <<ENV
PORT=$APP_PORT
DATA_DIR=/opt/multioutils/server/data
NODE_ENV=production
ENV
mkdir -p /opt/multioutils/server/data

# Service systemd
cat > /etc/systemd/system/multioutils.service <<UNIT
[Unit]
Description=MultiOutils server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/multioutils/server
EnvironmentFile=/opt/multioutils/server/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable multioutils
systemctl start multioutils || echo "(le service démarrera quand le code serveur sera présent)"
EOF

# ─── Récupération de l'IP ─────────────────────────────────────────────────────
sleep 3
CT_IP="$(pct exec "$CTID" -- bash -c "hostname -I | awk '{print \$1}'" 2>/dev/null || true)"

ok "Installation terminée."
echo
echo "──────────────────────────────────────────────────────────────"
echo "  MultiOutils · serveur installé dans le conteneur $CTID"
echo "  Accès local :  http://${CT_IP:-<IP-du-conteneur>}:${APP_PORT}"
echo
echo "  Étapes suivantes :"
echo "   1. Ouvre l'URL et crée le compte admin."
echo "   2. Génère un jeton d'API (Administration → Jetons)."
echo "   3. Pour l'accès distant : installe Cloudflare Tunnel"
echo "      (voir install/README.md)."
echo "   4. Dans le logiciel : Paramètres → Serveur distant → URL + jeton."
echo "──────────────────────────────────────────────────────────────"
