# Serveur MultiOutils — utilisé par install/docker-compose.yml
# (contexte de build : le dossier server/)
FROM node:20-bookworm

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public

# argon2 et better-sqlite3 sont natifs : l'image bookworm inclut la toolchain
RUN npm install --no-audit --no-fund \
  && npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=3000

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
