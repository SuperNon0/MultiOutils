#!/usr/bin/env bash
#
# MultiOutils (serveur) — réinitialise le mot de passe de SECOURS LOCAL.
#
# Contrairement au socle-lite (qui n'a pas de base), MultiOutils stocke le hash
# dans son store SQLite (table `settings`, clé `local_pw_hash`). Ce script
# régénère ce hash puis redémarre le service.
#
# Usage (en root sur le serveur) :
#   sudo bash deploy/reset_admin.sh                 # génère un mot de passe et l'affiche
#   sudo bash deploy/reset_admin.sh 'MonNouveauMdp' # fixe un mot de passe précis
#
# Réglages (variables d'environnement, si ton install diffère) :
#   SERVER_DIR=/opt/multioutils/server   dossier du serveur (défaut)
#   SERVICE=multioutils                  nom du service systemd (défaut)
#   DATA_DIR=$SERVER_DIR/data            dossier de données (base SQLite)
#   ENV_FILE=$SERVER_DIR/.env            .env éventuel qui définit DATA_DIR
#
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-/opt/multioutils/server}"
SERVICE="${SERVICE:-multioutils}"
ENV_FILE="${ENV_FILE:-${SERVER_DIR}/.env}"

# Récupère DATA_DIR : argument d'env > .env du service > défaut (SERVER_DIR/data).
if [ -z "${DATA_DIR:-}" ] && [ -f "${ENV_FILE}" ]; then
  FROM_ENV="$(grep -E '^DATA_DIR=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true)"
  [ -n "${FROM_ENV}" ] && DATA_DIR="${FROM_ENV}"
fi
DATA_DIR="${DATA_DIR:-${SERVER_DIR}/data}"

NEW="${1:-}"
GENERATED=""
if [ -z "${NEW}" ]; then
  NEW="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(9).toString("base64url"))')"
  GENERATED="1"
fi

if [ ! -d "${SERVER_DIR}/node_modules" ]; then
  echo "✗ Dépendances serveur introuvables dans ${SERVER_DIR}/node_modules" >&2
  echo "  Lance d'abord l'installation du serveur, ou précise SERVER_DIR=…" >&2
  exit 1
fi

# Écrit le hash dans le store (le mot de passe est passé en argument, jamais
# interpolé dans une requête SQL construite à la main).
( cd "${SERVER_DIR}" && node scripts/reset_admin.mjs "${DATA_DIR}" "${NEW}" )

# Recharge le service s'il existe.
if command -v systemctl >/dev/null 2>&1 \
   && systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}\.service"; then
  systemctl restart "${SERVICE}"
  echo "→ service ${SERVICE} redémarré."
else
  echo "→ redémarre le service manuellement pour appliquer (ex. systemctl restart ${SERVICE})."
fi

if [ -n "${GENERATED}" ]; then
  echo "  Nouveau mot de passe de secours : ${NEW}   ← note-le !"
fi

# Rappel : si le secours local est désactivé, ce mot de passe est inerte.
if [ -f "${ENV_FILE}" ] && grep -qiE '^ALLOW_LOCAL_LOGIN=(false|0|no|off)$' "${ENV_FILE}"; then
  echo "  (note : ALLOW_LOCAL_LOGIN est désactivé → l'entrée se fait uniquement par Cloudflare.)"
fi
