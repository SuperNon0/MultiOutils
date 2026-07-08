#!/usr/bin/env bash
# =============================================================================
#  MultiOutils · Installeur serveur pour Proxmox VE (crée un conteneur LXC)
# -----------------------------------------------------------------------------
#  À LANCER SUR L'HÔTE PROXMOX (shell du nœud, en root), PAS dans un conteneur :
#
#     bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/MultiOutils/main/install/proxmox-lxc.sh)"
#
#  Le script est INTERACTIF : il pose les questions (avec des valeurs par
#  défaut entre crochets — appuie sur Entrée pour accepter). Tu peux aussi
#  tout pré-remplir par variables d'environnement (voir README).
#
#  Ce qu'il fait :
#    1. Vérifie qu'on est bien sur un hôte Proxmox.
#    2. Crée un conteneur LXC Debian 12 (non privilégié).
#    3. Installe Node.js 20 + le serveur MultiOutils (isolé du monorepo).
#    4. Crée un service systemd (démarrage auto, redémarrage auto).
#    5. (Optionnel) Installe Cloudflare Tunnel — accès distant HTTPS SANS
#       ouvrir de port sur ta box (idéal Proxmox à la maison + Zero Trust).
#    6. Affiche l'adresse d'accès et les étapes suivantes.
#
#  Mode non-interactif : passe ASSUME_YES=1 et les variables voulues.
# =============================================================================
set -euo pipefail

# ─── Aides d'affichage ────────────────────────────────────────────────────────
msg()  { echo -e "\e[1;33m[MultiOutils]\e[0m $*"; }
ok()   { echo -e "\e[1;32m[ OK ]\e[0m $*"; }
warn() { echo -e "\e[1;35m[ ! ]\e[0m $*"; }
die()  { echo -e "\e[1;31m[ERREUR]\e[0m $*" >&2; exit 1; }

ASSUME_YES="${ASSUME_YES:-0}"

# ask VAR "Question" "défaut"
#  - si VAR est déjà défini dans l'environnement → on le garde (non-interactif)
#  - sinon, si un terminal est dispo et ASSUME_YES≠1 → on demande
#  - sinon → valeur par défaut
ask() {
  local __var="$1" __prompt="$2" __default="$3" __input=""
  if [ -n "${!__var:-}" ]; then return; fi
  if [ "$ASSUME_YES" != "1" ] && [ -e /dev/tty ]; then
    read -r -p "$(echo -e "  \e[1;36m?\e[0m $__prompt [\e[1m$__default\e[0m] : ")" __input </dev/tty || true
  fi
  printf -v "$__var" '%s' "${__input:-$__default}"
}

# ask_secret VAR "Question"  (saisie masquée, défaut vide)
ask_secret() {
  local __var="$1" __prompt="$2" __input=""
  if [ -n "${!__var:-}" ]; then return; fi
  if [ "$ASSUME_YES" != "1" ] && [ -e /dev/tty ]; then
    read -r -s -p "$(echo -e "  \e[1;36m?\e[0m $__prompt : ")" __input </dev/tty || true
    echo
  fi
  printf -v "$__var" '%s' "${__input:-}"
}

# ─── Vérifications d'environnement ────────────────────────────────────────────
command -v pct >/dev/null 2>&1 || die "Ce script doit tourner sur un hôte Proxmox VE (commande 'pct' introuvable)."
[ "$(id -u)" -eq 0 ] || die "Lance ce script en root sur l'hôte Proxmox."

echo
msg "Configuration du conteneur — réponds aux questions (Entrée = valeur par défaut)."
echo

# ─── Questions : conteneur ────────────────────────────────────────────────────
DEFAULT_CTID="$(pvesh get /cluster/nextid 2>/dev/null || echo 150)"
ask CTID        "ID du conteneur (CTID)"                 "$DEFAULT_CTID"
ask HOSTNAME    "Nom d'hôte du conteneur"                "multioutils"
ask CORES       "Nombre de cœurs CPU"                    "2"
ask RAM_MB      "Mémoire RAM (Mo)"                       "1024"
ask DISK_GB     "Taille du disque (Go)"                  "8"
ask BRIDGE      "Pont réseau Proxmox"                    "vmbr0"
ask STORAGE     "Stockage du disque (rootfs)"            "local-lvm"
ask TEMPLATE_STORAGE "Stockage des templates"            "local"
ask NET         "Réseau ('dhcp' ou 'IP/masque,gw=passerelle')" "dhcp"

# ─── Questions : application ──────────────────────────────────────────────────
echo
ask APP_PORT    "Port du serveur MultiOutils (interne au conteneur)" "3000"
ask REPO_URL    "Dépôt Git à installer"                  "https://github.com/SuperNon0/MultiOutils.git"
ask REPO_BRANCH "Branche à installer (le serveur est sur cette branche tant que la PR n'est pas fusionnée dans main)" "claude/multioutils-screenshot-app-sxyf9r"

# ─── Questions : Cloudflare Tunnel (accès distant sans port ouvert) ───────────
echo
msg "Accès distant via Cloudflare Tunnel (Zero Trust) — laisse vide pour configurer plus tard."
echo -e "  Crée d'abord un tunnel dans \e[1mCloudflare Zero Trust → Networks → Tunnels\e[0m,"
echo -e "  choisis « Cloudflared », et copie le \e[1mtoken du connecteur\e[0m (longue chaîne)."
echo
ask_secret CF_TUNNEL_TOKEN "Colle le token du tunnel Cloudflare (ou Entrée pour passer)"

UNPRIVILEGED="${UNPRIVILEGED:-1}"

# ─── Récapitulatif + confirmation ─────────────────────────────────────────────
echo
echo "──────────────────────────────────────────────────────────────"
echo "  Récapitulatif :"
echo "    Conteneur   : CTID=$CTID, hostname=$HOSTNAME"
echo "    Ressources  : ${CORES} cœurs, ${RAM_MB} Mo RAM, ${DISK_GB} Go disque"
echo "    Réseau      : bridge=$BRIDGE, ip=$NET"
echo "    Serveur     : port $APP_PORT, branche $REPO_BRANCH"
echo "    Cloudflare  : $( [ -n "$CF_TUNNEL_TOKEN" ] && echo 'tunnel configuré' || echo 'à faire plus tard' )"
echo "──────────────────────────────────────────────────────────────"
if [ "$ASSUME_YES" != "1" ] && [ -e /dev/tty ]; then
  read -r -p "  Lancer l'installation ? [O/n] : " __go </dev/tty || true
  case "${__go:-O}" in [nN]*) die "Annulé." ;; esac
fi

# ─── Template Debian 12 ───────────────────────────────────────────────────────
msg "Recherche du template Debian 12…"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available --section system | awk '/debian-12-standard/{print $2}' | sort | tail -n1)"
[ -n "$TEMPLATE" ] || die "Aucun template debian-12-standard trouvé via 'pveam available'."
if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  msg "Téléchargement du template $TEMPLATE…"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi
TEMPLATE_REF="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"
ok "Template prêt : $TEMPLATE_REF"

# ─── Création du conteneur ────────────────────────────────────────────────────
msg "Création du conteneur LXC $CTID…"
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

# ─── Installation du serveur dans le conteneur ────────────────────────────────
msg "Installation de Node.js + serveur MultiOutils (peut prendre quelques minutes)…"
pct exec "$CTID" -- env \
  APP_PORT="$APP_PORT" REPO_URL="$REPO_URL" REPO_BRANCH="$REPO_BRANCH" \
  bash -eux <<'EOF'
export DEBIAN_FRONTEND=noninteractive
apt-get update
# build-essential + python3 : nécessaires aux modules natifs (argon2, better-sqlite3)
apt-get install -y curl git ca-certificates build-essential python3

# Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Récupération du code
mkdir -p /opt
rm -rf /opt/multioutils
git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" /opt/multioutils
git config --global --add safe.directory /opt/multioutils

# Installation + build du SERVEUR UNIQUEMENT (--no-workspaces ignore le monorepo,
# donc pas d'Electron ni d'app desktop installés sur le serveur).
cd /opt/multioutils/server
npm install --no-workspaces --no-package-lock --no-audit --no-fund
npm run build

# Dossier de données + fichier d'environnement
mkdir -p /opt/multioutils/server/data
cat > /opt/multioutils/server/.env <<ENV
PORT=$APP_PORT
DATA_DIR=/opt/multioutils/server/data
NODE_ENV=production
TRUST_PROXY=1
ENV

# Service systemd (démarre le serveur, redémarre en cas de crash)
cat > /etc/systemd/system/multioutils.service <<UNIT
[Unit]
Description=MultiOutils server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/multioutils/server
EnvironmentFile=/opt/multioutils/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable multioutils
systemctl restart multioutils
sleep 2
systemctl --no-pager --lines=0 status multioutils || true
EOF
ok "Serveur installé et démarré."

# ─── Cloudflare Tunnel (optionnel) ────────────────────────────────────────────
if [ -n "$CF_TUNNEL_TOKEN" ]; then
  msg "Installation de Cloudflare Tunnel dans le conteneur…"
  pct exec "$CTID" -- env CF_TUNNEL_TOKEN="$CF_TUNNEL_TOKEN" bash -eux <<'EOF'
export DEBIAN_FRONTEND=noninteractive
mkdir -p /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | tee /etc/apt/sources.list.d/cloudflared.list
apt-get update && apt-get install -y cloudflared
# Installe cloudflared en service avec le token du connecteur :
# connexion SORTANTE vers Cloudflare, donc AUCUN port à ouvrir sur la box.
cloudflared service install "$CF_TUNNEL_TOKEN"
systemctl enable cloudflared || true
systemctl restart cloudflared || true
EOF
  ok "Cloudflare Tunnel installé."
fi

# ─── Récupération de l'IP + résumé final ──────────────────────────────────────
sleep 3
CT_IP="$(pct exec "$CTID" -- bash -c "hostname -I | awk '{print \$1}'" 2>/dev/null || true)"

echo
echo "══════════════════════════════════════════════════════════════"
ok  "Installation terminée · conteneur $CTID"
echo "──────────────────────────────────────────────────────────────"
echo "  Accès local (réseau maison) :"
echo "     http://${CT_IP:-<IP-du-conteneur>}:${APP_PORT}"
echo
echo "  1. Ouvre cette URL → crée le compte admin."
echo "  2. Administration → Jetons d'API → « Générer un jeton » (copie-le)."
echo "  3. Dans le logiciel : Paramètres → Serveur distant → URL + jeton."
if [ -n "$CF_TUNNEL_TOKEN" ]; then
echo
echo "  Cloudflare Tunnel est actif. Dans le dashboard Zero Trust :"
echo "     Networks → Tunnels → ton tunnel → Public Hostname → Add :"
echo "        Subdomain/Domain : ex. screens.tondomaine.fr"
echo "        Service          : HTTP  →  localhost:${APP_PORT}"
echo "     (Recommandé : Access → Application pour protéger l'URL par e-mail.)"
echo "     L'app utilisera alors l'URL https://screens.tondomaine.fr"
else
echo
echo "  Accès distant : relance ce script avec un token Cloudflare, ou"
echo "     installe cloudflared manuellement (voir install/README.md)."
fi
echo
echo "  Changer le port plus tard :"
echo "     pct exec $CTID -- sed -i 's/^PORT=.*/PORT=NOUVEAU/' /opt/multioutils/server/.env"
echo "     pct exec $CTID -- systemctl restart multioutils"
echo "     (puis mets à jour le Public Hostname Cloudflare vers localhost:NOUVEAU)"
echo "══════════════════════════════════════════════════════════════"
