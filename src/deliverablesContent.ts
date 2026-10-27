/**
 * @file src/deliverablesContent.ts
 * @description Contenu exact des 9 fichiers livrables pour consultation directe et copie depuis l'interface UI.
 */

export const deliverables: Record<string, string> = {
  'server.js': `/**
 * @file server.js
 * @description Serveur Socket.IO haute performance pour la plateforme de ventes aux enchères équines Auctav.
 * Conçu pour fonctionner comme relais temps réel entre l'Admin régie, les enchérisseurs (bidders),
 * les écrans salle et les pages de suivi des logs.
 * Compatible Engine.IO v3 (socket.io-client 2.3.0) et Engine.IO v4.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import pino from 'pino';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_KEY = process.env.ADMIN_KEY || 'auctav_secret_dev_key';
const REDIS_URL = process.env.REDIS_URL || null;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const ALLOW_UNAUTH_UPDATELOT = process.env.ALLOW_UNAUTH_UPDATELOT === 'true';

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || 'https://www.auctav.com,https://auctav.com';
const ALLOWED_ORIGINS = rawAllowedOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';
const logger = pino({
  level: LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

const ROOM_REGEX = /^auctav(\\d+|_follow|_screen)$/;

const ADMIN_ONLY_TYPES = new Set([
  'numLot', 'listLot', 'updateLot', 'closeEnchere', 'previousLot',
  'confirmEnchere', 'validEnchere', 'changeDevice', 'noActivity',
  'message', 'online', 'users',
]);

const NON_ADMIN_ALLOWED_TYPES = new Set([
  'doEncheres', 'reconnection', 'getEncheresList', 'requestRefresh',
  'connected', 'exit', 'follow', 'getEncheres', 'getScreen',
]);

export async function createAdminStore(redisUrl = null) {
  if (redisUrl) {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
      return {
        type: 'redis',
        client: redis,
        async get(room) { return await redis.get(\`auctav:admin:\${room}\`); },
        async set(room, socketId) { await redis.set(\`auctav:admin:\${room}\`, socketId); },
        async delete(room) { await redis.del(\`auctav:admin:\${room}\`); },
        async getRoomsBySocketId(socketId) {
          const keys = await redis.keys('auctav:admin:*');
          const matching = [];
          for (const key of keys) {
            const val = await redis.get(key);
            if (val === socketId) matching.push(key.replace('auctav:admin:', ''));
          }
          return matching;
        },
        async isAdminSocket(socketId) {
          const keys = await redis.keys('auctav:admin:*');
          for (const key of keys) {
            if ((await redis.get(key)) === socketId) return true;
          }
          return false;
        },
        async close() { await redis.quit(); }
      };
    } catch (e) {
      logger.error({ err: e.message }, 'Repli sur stockage mémoire interne');
    }
  }

  const memoryMap = new Map();
  return {
    type: 'memory',
    async get(room) { return memoryMap.get(room) || null; },
    async set(room, socketId) { memoryMap.set(room, socketId); },
    async delete(room) { memoryMap.delete(room); },
    async getRoomsBySocketId(socketId) {
      const rooms = [];
      for (const [r, sId] of memoryMap.entries()) {
        if (sId === socketId) rooms.push(r);
      }
      return rooms;
    },
    async isAdminSocket(socketId) {
      for (const sId of memoryMap.values()) {
        if (sId === socketId) return true;
      }
      return false;
    },
    async close() { memoryMap.clear(); }
  };
}

export function verifyAdminKey(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') return false;
  const a = crypto.createHash('sha256').update(providedKey).digest();
  const b = crypto.createHash('sha256').update(expectedKey).digest();
  return crypto.timingSafeEqual(a, b);
}

export function isValidMessageType(type) {
  return typeof type === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(type);
}

class SocketRateLimiter {
  constructor() {
    this.globalCapacity = 20;
    this.globalTokens = 20;
    this.bidCapacity = 5;
    this.bidTokens = 5;
    this.lastRefill = Date.now();
  }
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.globalTokens = Math.min(this.globalCapacity, this.globalTokens + elapsed * this.globalCapacity);
      this.bidTokens = Math.min(this.bidCapacity, this.bidTokens + elapsed * this.bidCapacity);
      this.lastRefill = now;
    }
  }
  tryConsume(type) {
    this.refill();
    if (this.globalTokens < 1) return false;
    if (type === 'doEncheres') {
      if (this.bidTokens < 1) return false;
      this.bidTokens -= 1;
    }
    this.globalTokens -= 1;
    return true;
  }
}

export async function createAuctavServer(existingHttpServer = null, options = {}) {
  const app = options.app || express();
  const httpServer = existingHttpServer || http.createServer(app);
  const adminStore = await createAdminStore(options.redisUrl || REDIS_URL);

  const corsOriginCheck = (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost') || origin.includes('run.app')) {
      return callback(null, true);
    }
    return callback(new Error('Origine non autorisée'), false);
  };

  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOriginCheck, credentials: true },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e5,
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  app.get('/health', async (req, res) => {
    res.json({
      status: 'ok',
      service: 'auctav-socket-server',
      uptime: Math.floor(process.uptime()),
      connections: io.engine ? io.engine.clientsCount : 0,
      timestamp: new Date().toISOString(),
    });
  });

  async function broadcastUserList(room, targetSocketId = null) {
    const adminId = await adminStore.get(room);
    const roomSockets = io.sockets.adapter.rooms.get(room);
    const count = roomSockets ? roomSockets.size : 0;
    const payload = { admin: adminId || null, count };
    io.to(room).emit('userList', payload);
    if (targetSocketId) io.to(targetSocketId).emit('userList', payload);
  }

  io.on('connection', socket => {
    socket.data = { isAdmin: false, name: 'Anonyme', rooms: new Set(), rateLimiter: new SocketRateLimiter() };

    socket.on('admin', async (pseudo, key, ack) => {
      const hasAck = typeof ack === 'function';
      if (!key || !verifyAdminKey(key, ADMIN_KEY)) {
        if (hasAck) ack({ ok: false });
        return;
      }
      socket.data.isAdmin = true;
      socket.data.name = typeof pseudo === 'string' && pseudo.trim() ? pseudo.slice(0, 100) : 'Admin';
      if (hasAck) ack({ ok: true });
      for (const room of socket.data.rooms) {
        if (ROOM_REGEX.test(room)) {
          await adminStore.set(room, socket.id);
          await broadcastUserList(room);
        }
      }
    });

    socket.on('joinroom', async room => {
      if (typeof room !== 'string' || !ROOM_REGEX.test(room)) return;
      socket.join(room);
      socket.data.rooms.add(room);
      if (socket.data.isAdmin) await adminStore.set(room, socket.id);
      await broadcastUserList(room, socket.id);
    });

    socket.on('username', pseudo => {
      if (!socket.data.isAdmin && typeof pseudo === 'string') {
        socket.data.name = pseudo.slice(0, 100);
      }
    });

    socket.on('getMsgRoom', async payload => {
      if (!payload || typeof payload !== 'object') return;
      const { room, type, msg, name } = payload;
      if (!room || !ROOM_REGEX.test(room) || !isValidMessageType(type)) return;
      if (!socket.data.rateLimiter.tryConsume(type)) return;

      if (!socket.data.isAdmin) {
        if (!ALLOW_UNAUTH_UPDATELOT || type !== 'updateLot') return;
      }

      io.to(room).emit('sendMsg', {
        type,
        msg: typeof msg === 'object' && msg !== null ? msg : { value: msg },
        name: typeof name === 'string' && name.trim() ? name.slice(0, 100) : socket.data.name,
        from: socket.id,
      });
    });

    socket.on('getMsgPrivate', async payload => {
      if (!payload || typeof payload !== 'object') return;
      const { toid, type, msg, name } = payload;
      if (!toid || typeof toid !== 'string' || !isValidMessageType(type)) return;
      if (!socket.data.rateLimiter.tryConsume(type)) return;

      if (!socket.data.isAdmin) {
        if (!(await adminStore.isAdminSocket(toid))) return;
        if (!NON_ADMIN_ALLOWED_TYPES.has(type)) return;
      }

      io.to(toid).emit('sendMsg', {
        type,
        msg: typeof msg === 'object' && msg !== null ? msg : { value: msg },
        name: typeof name === 'string' && name.trim() ? name.slice(0, 100) : socket.data.name,
        from: socket.id,
      });
    });

    socket.on('disconnecting', async () => {
      if (socket.data.isAdmin) {
        const ownedRooms = await adminStore.getRoomsBySocketId(socket.id);
        for (const room of ownedRooms) {
          await adminStore.delete(room);
          const roomSockets = io.sockets.adapter.rooms.get(room);
          const currentCount = roomSockets ? Math.max(0, roomSockets.size - 1) : 0;
          io.to(room).emit('userList', { admin: null, count: currentCount });
        }
      }
    });
  });

  return { app, httpServer, io, adminStore, logger };
}
`,

  'package.json': `{
  "name": "auctav-socket-server",
  "version": "1.0.0",
  "description": "Serveur Socket.IO haute performance pour ventes aux enchères équines Auctav (compatibilité Engine.IO v3)",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test:client": "node test-client.js"
  },
  "dependencies": {
    "@socket.io/redis-adapter": "^8.3.0",
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "ioredis": "^5.4.1",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "socket.io-client": "^4.8.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
`,

  '.env.example': `# Port d'écoute du serveur
PORT=3000

# Clé secrète requise pour l'administrateur régie
ADMIN_KEY="auctav_secret_production_key_change_me"

# Origines CORS autorisées (séparées par une virgule)
ALLOWED_ORIGINS="https://www.auctav.com,https://auctav.com,https://socket-auctav.astucom.com"

# URL de connexion Redis (optionnel)
# REDIS_URL="redis://127.0.0.1:6379"

# Niveau de logs (info, debug, warn, error)
LOG_LEVEL="info"

# Compatibilité temporaire pour update.php non authentifié (défaut false)
ALLOW_UNAUTH_UPDATELOT=false
`,

  'Dockerfile': `FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat dumb-init
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 auctav && adduser --system --uid 1001 -G auctav auctav

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server.js ./
RUN chown -R auctav:auctav /app
USER auctav
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
`,

  'docker-compose.yml': `version: '3.8'
services:
  auctav-socket:
    build: .
    container_name: auctav_socket_server
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      ADMIN_KEY: \${ADMIN_KEY:-auctav_secret_production_key_change_me}
      ALLOWED_ORIGINS: \${ALLOWED_ORIGINS:-https://www.auctav.com,https://auctav.com}
      REDIS_URL: \${REDIS_URL:-redis://redis:6379}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - auctav-net

  redis:
    image: redis:7-alpine
    container_name: auctav_redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    networks:
      - auctav-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

networks:
  auctav-net:
    driver: bridge

volumes:
  redis-data:
`,

  'nginx.conf': `upstream auctav_socket_backend {
    ip_hash;
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name socket-auctav.astucom.com;
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name socket-auctav.astucom.com;

    ssl_certificate /etc/letsencrypt/live/socket-auctav.astucom.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/socket-auctav.astucom.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /socket.io/ {
        proxy_pass http://auctav_socket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /health {
        proxy_pass http://auctav_socket_backend/health;
        access_log off;
    }
}
`,

  'ecosystem.config.js': `module.exports = {
  apps: [
    {
      name: 'auctav-socket-server',
      script: './server.js',
      instances: process.env.REDIS_URL ? 'max' : 1,
      exec_mode: process.env.REDIS_URL ? 'cluster' : 'fork',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 2000,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        ADMIN_KEY: 'METTRE_VOTRE_CLE_SECRETE_ICI',
        ALLOWED_ORIGINS: 'https://www.auctav.com,https://auctav.com',
        LOG_LEVEL: 'info',
        ALLOW_UNAUTH_UPDATELOT: 'false',
      },
    },
  ],
};
`,

  'test-client.js': `import { io } from 'socket.io-client';

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3000';
const ADMIN_KEY = process.env.ADMIN_KEY || 'auctav_secret_dev_key';
const ROOM = 'auctav12';

console.log('🐴 Démarrage du Banc de Test Auctav Socket.IO...');

const admin = io(SERVER_URL, { transports: ['websocket'] });
const bidder = io(SERVER_URL, { transports: ['websocket'] });

admin.on('connect', () => {
  admin.emit('admin', 'RegieCommissaire', ADMIN_KEY, ack => {
    console.log('1. Admin auth:', ack);
    admin.emit('joinroom', ROOM);
  });
});

bidder.on('connect', () => {
  bidder.emit('username', 'Marc Enchérisseur');
  bidder.emit('joinroom', ROOM);
});

bidder.on('userList', list => {
  console.log('2. userList reçu par Bidder:', list);
  if (list.admin) {
    bidder.emit('getMsgPrivate', {
      toid: list.admin,
      type: 'doEncheres',
      msg: { lot: 45, montant: 35000 },
      name: 'Marc'
    });
  }
});

admin.on('sendMsg', msg => {
  console.log('3. Admin a reçu sendMsg:', msg.type);
  if (msg.type === 'doEncheres') {
    admin.emit('getMsgPrivate', {
      toid: msg.from,
      type: 'confirmEnchere',
      msg: { status: 'ACCEPTED' }
    });
  }
});
`,

  'README.md': `# Auctav Realtime Socket.IO Server
Relais temps réel haute performance pour ventes aux enchères équines en direct.
Compatible clients legacy socket.io-client 2.3.0 (Engine.IO v3) et Engine.IO v4.
Consultez le fichier README.md à la racine pour la documentation complète.
`,
};
