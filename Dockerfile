# ==============================================================================
# AUCTAV REALTIME SOCKET.IO SERVER - DOCKERFILE
# ==============================================================================
FROM node:20-alpine AS base

# Installation des dépendances système nécessaires
RUN apk add --no-cache libc6-compat dumb-init

WORKDIR /app

# Définition de l'environnement de production
ENV NODE_ENV=production
ENV PORT=3000

# Création d'un utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 auctav && \
    adduser --system --uid 1001 -G auctav auctav

# Copie des fichiers de manifeste de paquets
COPY package.json package-lock.json* ./

# Installation des dépendances de production uniquement
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copie du code source du serveur
COPY server.js ./

# Attribution des droits au compte applicatif
RUN chown -R auctav:auctav /app

USER auctav

EXPOSE 3000

# Vérification de santé intégrée
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Utilisation de dumb-init pour gérer proprement les signaux PID 1 (SIGTERM / SIGINT)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
