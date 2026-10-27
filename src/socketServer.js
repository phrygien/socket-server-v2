/**
 * @file src/socketServer.js
 * @description Moteur Socket.IO haute performance pour la plateforme de ventes aux enchères équines Auctav.
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

// ==============================================================================
// 1. CONFIGURATION & LOGGER STRUCTURÉ
// ==============================================================================

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_KEY = process.env.ADMIN_KEY || 'auctav_secret_dev_key';
const REDIS_URL = process.env.REDIS_URL || null;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const ALLOW_UNAUTH_UPDATELOT = process.env.ALLOW_UNAUTH_UPDATELOT === 'true';

// Liste blanche des origines autorisées pour CORS
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || 'https://www.auctav.com,https://auctav.com';
const ALLOWED_ORIGINS = rawAllowedOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Logger Pino structuré
const isDev = process.env.NODE_ENV !== 'production';
export const logger = pino({
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

// Avertissement de sécurité si la clé est la clé de développement
if (ADMIN_KEY === 'auctav_secret_dev_key') {
  logger.warn('ADMIN_KEY par défaut détectée ! Définissez impérativement une clé forte en production.');
}
if (ALLOW_UNAUTH_UPDATELOT) {
  logger.warn('SÉCURITÉ: ALLOW_UNAUTH_UPDATELOT est activé. update.php peut émettre sans authentification.');
}

// Regex stricte de validation des rooms
export const ROOM_REGEX = /^auctav(\d+|_follow|_screen)$/;

// Catalogue des types de messages autorisés
export const ADMIN_ONLY_TYPES = new Set([
  'numLot',
  'listLot',
  'updateLot',
  'closeEnchere',
  'previousLot',
  'confirmEnchere',
  'validEnchere',
  'changeDevice',
  'noActivity',
  'message',
  'online',
  'users',
]);

export const NON_ADMIN_ALLOWED_TYPES = new Set([
  'doEncheres',
  'reconnection',
  'getEncheresList',
  'requestRefresh',
  'connected',
  'exit',
  'follow',
  'getEncheres',
  'getScreen',
]);

// ==============================================================================
// 2. ABSTRACTION DU STOCKAGE ADMIN (adminStore)
// ==============================================================================

/**
 * Crée le gestionnaire d'état de l'administrateur par room (Redis ou mémoire).
 * Clé Redis : auctav:admin:{room} -> socketId
 */
export async function createAdminStore(redisUrl = null) {
  if (redisUrl) {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      redis.on('error', err => {
        logger.error({ err: err.message }, 'Erreur client Redis adminStore');
      });

      logger.info({ redisUrl }, 'adminStore configuré sur Redis');

      return {
        type: 'redis',
        client: redis,
        async get(room) {
          return await redis.get(`auctav:admin:${room}`);
        },
        async set(room, socketId) {
          await redis.set(`auctav:admin:${room}`, socketId);
        },
        async delete(room) {
          await redis.del(`auctav:admin:${room}`);
        },
        async getRoomsBySocketId(socketId) {
          const keys = await redis.keys('auctav:admin:*');
          const matchingRooms = [];
          for (const key of keys) {
            const val = await redis.get(key);
            if (val === socketId) {
              matchingRooms.push(key.replace('auctav:admin:', ''));
            }
          }
          return matchingRooms;
        },
        async isAdminSocket(socketId) {
          const keys = await redis.keys('auctav:admin:*');
          for (const key of keys) {
            const val = await redis.get(key);
            if (val === socketId) return true;
          }
          return false;
        },
        async close() {
          await redis.quit();
        },
      };
    } catch (e) {
      logger.error({ err: e.message }, 'Échec initialisation Redis pour adminStore, repli sur mémoire');
    }
  }

  // Stockage en mémoire par défaut
  const memoryMap = new Map(); // room -> socketId
  logger.info('adminStore configuré en mémoire (Map interne)');

  return {
    type: 'memory',
    async get(room) {
      return memoryMap.get(room) || null;
    },
    async set(room, socketId) {
      memoryMap.set(room, socketId);
    },
    async delete(room) {
      memoryMap.delete(room);
    },
    async getRoomsBySocketId(socketId) {
      const rooms = [];
      for (const [room, adminId] of memoryMap.entries()) {
        if (adminId === socketId) rooms.push(room);
      }
      return rooms;
    },
    async isAdminSocket(socketId) {
      for (const adminId of memoryMap.values()) {
        if (adminId === socketId) return true;
      }
      return false;
    },
    async close() {
      memoryMap.clear();
    },
  };
}

// ==============================================================================
// 3. UTILITAIRES DE SÉCURITÉ & RATE LIMITING
// ==============================================================================

/**
 * Compare la clé fournie avec la clé secrète en temps constant (anti-timing attacks).
 * Utilise SHA-256 pour éviter les exceptions de tailles de buffer inégales dans timingSafeEqual.
 */
export function verifyAdminKey(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') {
    return false;
  }
  const hashProvided = crypto.createHash('sha256').update(providedKey).digest();
  const hashExpected = crypto.createHash('sha256').update(expectedKey).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

/**
 * Valide le format d'un type de message (1 à 40 caractères alphanumériques ou underscore).
 */
export function isValidMessageType(type) {
  return typeof type === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(type);
}

/**
 * Implémentation d'un Token Bucket par socket.
 * - Max 20 messages / seconde (global)
 * - Max 5 messages 'doEncheres' / seconde
 */
export class SocketRateLimiter {
  constructor() {
    this.globalCapacity = 20;
    this.globalTokens = 20;
    this.bidCapacity = 5;
    this.bidTokens = 5;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.globalTokens = Math.min(this.globalCapacity, this.globalTokens + elapsedSeconds * this.globalCapacity);
      this.bidTokens = Math.min(this.bidCapacity, this.bidTokens + elapsedSeconds * this.bidCapacity);
      this.lastRefill = now;
    }
  }

  tryConsume(type) {
    this.refill();

    // Vérification quota global
    if (this.globalTokens < 1) {
      return false;
    }

    // Vérification quota spécialisé enchères
    if (type === 'doEncheres') {
      if (this.bidTokens < 1) {
        return false;
      }
      this.bidTokens -= 1;
    }

    this.globalTokens -= 1;
    return true;
  }
}

// ==============================================================================
// 4. CRÉATION DU SERVEUR SOCKET.IO ET CONFIGURATION
// ==============================================================================

/**
 * @param {import('node:http').Server | any} [existingHttpServer]
 * @param {Record<string, any>} [options]
 */
export async function createAuctavServer(existingHttpServer = null, options = {}) {
  const app = options.app || express();
  const httpServer = existingHttpServer || http.createServer(app);

  const adminStore = await createAdminStore(options.redisUrl || REDIS_URL);

  // Configuration CORS stricte (jamais de '*')
  const corsOriginCheck = (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (
      isDev &&
      (origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.includes('run.app') ||
        origin.includes('webcontainer'))
    ) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    logger.warn({ origin }, 'Origine CORS rejetée');
    return callback(new Error(`CORS non autorisé pour l'origine : ${origin}`), false);
  };

  // Instanciation de Socket.IO avec compatibilité Engine.IO v3 (allowEIO3)
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOriginCheck,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    allowEIO3: true, // OBLIGATOIRE pour compatibilité avec socket.io-client 2.3.0
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e5, // 100 KB max pour prévenir les abus
    pingInterval: 10000,
    pingTimeout: 20000,
    cookie: false,
  });

  // Branchement de l'adaptateur Redis multi-serveurs si REDIS_URL est fourni
  if (options.redisUrl || REDIS_URL) {
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { default: Redis } = await import('ioredis');
      const url = options.redisUrl || REDIS_URL;
      const pubClient = new Redis(url);
      const subClient = pubClient.duplicate();

      pubClient.on('error', err => logger.error({ err: err.message }, 'Redis PubClient Error'));
      subClient.on('error', err => logger.error({ err: err.message }, 'Redis SubClient Error'));

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Adaptateur @socket.io/redis-adapter activé avec succès');
    } catch (err) {
      logger.error({ err: err.message }, 'Échec configuration adaptateur Redis Socket.IO');
    }
  }

  // ============================================================================
  // 5. ENDPOINT HTTP HEALTHCHECK
  // ============================================================================

  app.get('/health', async (req, res) => {
    try {
      const totalConnections = io.engine ? io.engine.clientsCount : 0;
      const rooms = io.sockets.adapter.rooms;
      let auctavRoomsCount = 0;
      for (const roomName of rooms.keys()) {
        if (ROOM_REGEX.test(roomName)) auctavRoomsCount++;
      }

      res.status(200).json({
        status: 'ok',
        service: 'auctav-socket-server',
        version: '4.8.4-eio3',
        uptime: Math.floor(process.uptime()),
        connections: totalConnections,
        rooms: auctavRoomsCount,
        storage: adminStore.type,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // ============================================================================
  // 6. GESTION DU CYCLE DE VIE DES SOCKETS
  // ============================================================================

  async function broadcastUserList(room, targetSocketId = null) {
    try {
      const adminId = await adminStore.get(room);
      const roomSockets = io.sockets.adapter.rooms.get(room);
      const count = roomSockets ? roomSockets.size : 0;

      const payload = {
        admin: adminId || null,
        count: count,
      };

      io.to(room).emit('userList', payload);

      if (targetSocketId) {
        io.to(targetSocketId).emit('userList', payload);
      }

      logger.debug({ room, payload }, 'userList diffusé');
    } catch (err) {
      logger.error({ err: err.message, room }, 'Erreur lors de la diffusion de userList');
    }
  }

  io.on('connection', socket => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    socket.data = {
      isAdmin: false,
      name: 'Anonyme',
      rooms: new Set(),
      rateLimiter: new SocketRateLimiter(),
    };

    logger.debug({ socketId: socket.id, ip: clientIp }, 'Client connecté');

    socket.on('admin', async (pseudo, key, ack) => {
      try {
        const hasAck = typeof ack === 'function';

        if (!key || typeof key !== 'string') {
          logger.warn({ socketId: socket.id, ip: clientIp }, 'Tentative admin sans clé fournie');
          if (hasAck) ack({ ok: false });
          return;
        }

        const isValid = verifyAdminKey(key, ADMIN_KEY);

        if (!isValid) {
          logger.warn({ socketId: socket.id, ip: clientIp }, 'Échec authentification admin : clé invalide');
          if (hasAck) ack({ ok: false });
          return;
        }

        socket.data.isAdmin = true;
        socket.data.name = typeof pseudo === 'string' && pseudo.trim() ? pseudo.slice(0, 100) : 'Admin';

        logger.info({ socketId: socket.id, name: socket.data.name, ip: clientIp }, 'Admin authentifié avec succès');

        if (hasAck) {
          ack({ ok: true });
        }

        for (const room of socket.data.rooms) {
          if (ROOM_REGEX.test(room)) {
            await adminStore.set(room, socket.id);
            await broadcastUserList(room);
          }
        }
      } catch (err) {
        logger.error({ err: err.message, socketId: socket.id }, 'Erreur dans le handler admin');
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    socket.on('joinroom', async room => {
      try {
        if (typeof room !== 'string' || !ROOM_REGEX.test(room)) {
          logger.debug({ socketId: socket.id, room }, 'joinroom ignoré : nom de room invalide');
          return;
        }

        socket.join(room);
        socket.data.rooms.add(room);

        logger.debug({ socketId: socket.id, room, isAdmin: socket.data.isAdmin }, 'Socket a rejoint la room');

        if (socket.data.isAdmin) {
          await adminStore.set(room, socket.id);
        }

        await broadcastUserList(room, socket.id);
      } catch (err) {
        logger.error({ err: err.message, socketId: socket.id, room }, 'Erreur dans le handler joinroom');
      }
    });

    socket.on('username', pseudo => {
      try {
        if (!socket.data.isAdmin) {
          socket.data.name = typeof pseudo === 'string' ? pseudo.slice(0, 100) : 'Enchérisseur';
        }
      } catch (err) {
        logger.error({ err: err.message, socketId: socket.id }, 'Erreur dans le handler username');
      }
    });

    socket.on('getMsgRoom', async payload => {
      try {
        if (!payload || typeof payload !== 'object') return;

        const { room, type, msg, name } = payload;

        if (!room || typeof room !== 'string' || !ROOM_REGEX.test(room)) return;
        if (!isValidMessageType(type)) return;

        if (!socket.data.rateLimiter.tryConsume(type)) {
          logger.warn({ socketId: socket.id, type, ip: clientIp }, 'Rate limit dépassé sur getMsgRoom');
          return;
        }

        const isAdmin = socket.data.isAdmin;

        if (!isAdmin) {
          const isAllowedUnauthUpdate = ALLOW_UNAUTH_UPDATELOT && type === 'updateLot';
          if (!isAllowedUnauthUpdate) {
            logger.warn(
              { socketId: socket.id, type, room },
              'Rejet getMsgRoom : émission non autorisée pour un non-admin'
            );
            return;
          }
          logger.warn({ socketId: socket.id, type, room }, 'Émission updateLot non authentifiée autorisée via ALLOW_UNAUTH_UPDATELOT');
        }

        const outboundMsg = {
          type,
          msg: typeof msg === 'object' && msg !== null ? msg : { value: msg },
          name: typeof name === 'string' && name.trim() ? name.slice(0, 100) : socket.data.name,
          from: socket.id,
        };

        io.to(room).emit('sendMsg', outboundMsg);
      } catch (err) {
        logger.error({ err: err.message, socketId: socket.id }, 'Erreur dans getMsgRoom');
      }
    });

    socket.on('getMsgPrivate', async payload => {
      try {
        if (!payload || typeof payload !== 'object') return;

        const { toid, type, msg, name } = payload;

        if (!toid || typeof toid !== 'string') return;
        if (!isValidMessageType(type)) return;

        if (!socket.data.rateLimiter.tryConsume(type)) {
          logger.warn({ socketId: socket.id, type, ip: clientIp }, 'Rate limit dépassé sur getMsgPrivate');
          return;
        }

        const isAdmin = socket.data.isAdmin;

        if (!isAdmin) {
          const isTargetAdmin = await adminStore.isAdminSocket(toid);
          if (!isTargetAdmin) {
            logger.warn(
              { from: socket.id, toid, type },
              'Rejet getMsgPrivate : un non-admin a tenté d’écrire à une cible non-admin'
            );
            return;
          }

          if (!NON_ADMIN_ALLOWED_TYPES.has(type)) {
            logger.warn(
              { from: socket.id, toid, type },
              'Rejet getMsgPrivate : type interdit pour un non-admin'
            );
            return;
          }
        }

        const outboundMsg = {
          type,
          msg: typeof msg === 'object' && msg !== null ? msg : { value: msg },
          name: typeof name === 'string' && name.trim() ? name.slice(0, 100) : socket.data.name,
          from: socket.id,
        };

        io.to(toid).emit('sendMsg', outboundMsg);
      } catch (err) {
        logger.error({ err: err.message, socketId: socket.id }, 'Erreur dans getMsgPrivate');
      }
    });

    socket.on('disconnecting', async reason => {
      try {
        logger.debug({ socketId: socket.id, reason }, 'Socket en cours de déconnexion');

        if (socket.data.isAdmin) {
          const ownedRooms = await adminStore.getRoomsBySocketId(socket.id);

          for (const room of ownedRooms) {
            await adminStore.delete(room);
            logger.info({ room, adminSocketId: socket.id }, 'Admin déconnecté, room orpheline');

            const roomSockets = io.sockets.adapter.rooms.get(room);
            const currentCount = roomSockets ? Math.max(0, roomSockets.size - 1) : 0;

            io.to(room).emit('userList', {
              admin: null,
              count: currentCount,
            });
          }
        } else {
          for (const room of socket.data.rooms) {
            if (ROOM_REGEX.test(room)) {
              const roomSockets = io.sockets.adapter.rooms.get(room);
              const count = roomSockets ? Math.max(0, roomSockets.size - 1) : 0;
              const adminId = await adminStore.get(room);
              io.to(room).emit('userList', {
                admin: adminId || null,
                count: count,
              });
            }
          }
        }
      } catch (err) {
        logger.error({ err: err.message, socketId: socket.id }, 'Erreur lors de la déconnexion');
      }
    });
  });

  const shutdown = async signal => {
    logger.info({ signal }, 'Signal de fermeture reçu, arrêt propre du serveur Auctav...');
    try {
      io.close(() => {
        logger.info('Toutes les connexions Socket.IO fermées.');
      });

      if (adminStore && typeof adminStore.close === 'function') {
        await adminStore.close();
      }

      httpServer.close(() => {
        logger.info('Serveur HTTP arrêté avec succès.');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Délai d’arrêt dépassé (10s), fermeture forcée');
        process.exit(1);
      }, 10000).unref();
    } catch (err) {
      logger.error({ err: err.message }, 'Erreur pendant la procédure d’arrêt');
      process.exit(1);
    }
  };

  return {
    app,
    httpServer,
    io,
    adminStore,
    logger,
    shutdown,
  };
}
