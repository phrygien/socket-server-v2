/**
 * @file src/core/bootstrap.ts
 * @description Racine de composition (Composition Root) assemblant toutes les couches Clean Architecture.
 */

import http from 'node:http';
import express, { Express } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { ConfigService } from './infrastructure/config/ConfigService.ts';
import { PinoLogger } from './infrastructure/logging/PinoLogger.ts';
import { AdminStoreFactory } from './infrastructure/storage/AdminStoreFactory.ts';
import { TimingSafeKeyValidator } from './infrastructure/security/TimingSafeKeyValidator.ts';
import { SocketIoBroadcaster } from './infrastructure/socket/SocketIoBroadcaster.ts';
import { AuthenticateAdminUseCase } from './application/use-cases/AuthenticateAdminUseCase.ts';
import { JoinRoomUseCase } from './application/use-cases/JoinRoomUseCase.ts';
import { RelayRoomMessageUseCase } from './application/use-cases/RelayRoomMessageUseCase.ts';
import { RelayPrivateMessageUseCase } from './application/use-cases/RelayPrivateMessageUseCase.ts';
import { HandleDisconnectUseCase } from './application/use-cases/HandleDisconnectUseCase.ts';
import { SocketEventController } from './interfaces/controllers/SocketEventController.ts';
import { HttpHealthController } from './interfaces/controllers/HttpHealthController.ts';

export interface BootstrapOptions {
  app?: Express;
  redisUrl?: string | null;
}

export async function bootstrapAuctavServer(
  existingHttpServer: http.Server | null = null,
  options: BootstrapOptions = {}
) {
  // 1. Configuration & Logger
  const configService = new ConfigService();
  const isDev = configService.get('nodeEnv') !== 'production';
  const logger = new PinoLogger(configService.get('logLevel'), isDev);

  if (configService.get('adminKey') === 'auctav_secret_dev_key') {
    logger.warn('ADMIN_KEY par défaut détectée ! Définissez impérativement une clé forte en production.');
  }
  if (configService.get('allowUnauthUpdateLot')) {
    logger.warn('SÉCURITÉ: ALLOW_UNAUTH_UPDATELOT est activé.');
  }

  // 2. Serveur Express & HTTP
  const app = options.app || express();
  const httpServer = existingHttpServer || http.createServer(app);

  // 3. Magasin d'état Admin (Clean Architecture Repository)
  const redisUrl = options.redisUrl !== undefined ? options.redisUrl : configService.get('redisUrl');
  const adminStore = await AdminStoreFactory.create(redisUrl, logger);

  // 4. Configuration CORS stricte
  const allowedOrigins = configService.get('allowedOrigins');
  const corsOriginCheck = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn({ origin }, 'Origine CORS rejetée');
    return callback(new Error(`CORS non autorisé pour l'origine : ${origin}`), false);
  };

  // 5. Instanciation Socket.IO avec Engine.IO v3 (allowEIO3)
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOriginCheck,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    allowEIO3: true, // OBLIGATOIRE pour compatibilité avec socket.io-client 2.3.0
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e5, // 100 KB max
    pingInterval: 10000,
    pingTimeout: 20000,
    cookie: false,
  });

  // Adaptateur Redis si multi-serveurs / clustering
  if (redisUrl) {
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { default: Redis } = await import('ioredis');
      const pubClient = new Redis(redisUrl);
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err: any) => logger.error({ err: err.message }, 'Redis PubClient Error'));
      subClient.on('error', (err: any) => logger.error({ err: err.message }, 'Redis SubClient Error'));

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Adaptateur @socket.io/redis-adapter activé avec succès');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Échec configuration adaptateur Redis Socket.IO');
    }
  }

  // 6. Infrastructure Broadcaster
  const broadcaster = new SocketIoBroadcaster(io);

  // 7. Use Cases applicatifs
  const keyValidator = new TimingSafeKeyValidator();
  const authAdminUseCase = new AuthenticateAdminUseCase(
    adminStore,
    broadcaster,
    keyValidator,
    configService.get('adminKey'),
    logger
  );
  const joinRoomUseCase = new JoinRoomUseCase(adminStore, broadcaster, logger);
  const relayRoomUseCase = new RelayRoomMessageUseCase(
    broadcaster,
    configService.get('allowUnauthUpdateLot'),
    logger
  );
  const relayPrivateUseCase = new RelayPrivateMessageUseCase(adminStore, broadcaster, logger);
  const handleDisconnectUseCase = new HandleDisconnectUseCase(adminStore, broadcaster, logger);

  // 8. Interface Adapters
  const socketEventController = new SocketEventController({
    authAdminUseCase,
    joinRoomUseCase,
    relayRoomUseCase,
    relayPrivateUseCase,
    handleDisconnectUseCase,
    logger,
  });
  socketEventController.register(io);

  const healthController = new HttpHealthController(broadcaster, adminStore);
  app.get('/', (req, res) => {
    res.status(200).json({
      service: 'auctav-socket-server',
      description: 'Serveur de relais temps réel pour ventes aux enchères en direct (Clean Architecture)',
      status: 'online',
      architecture: 'Clean Architecture (Domain / Application / Infrastructure / Interfaces)',
      compatibility: 'Socket.IO v4 avec allowEIO3: true (compatible clients legacy 2.3.0 et v4)',
      endpoints: {
        health: '/health',
        serverInfo: '/api/server-info',
        socket: '/socket.io/',
      },
      timestamp: new Date().toISOString(),
    });
  });
  app.get('/health', (req, res) => healthController.getHealth(req, res));
  app.get('/api/server-info', (req, res) => healthController.getServerInfo(req, res));

  // 9. Arrêt propre (Graceful Shutdown)
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Signal de fermeture reçu, arrêt propre du serveur Auctav...');
    try {
      io.close(() => logger.info('Connexions Socket.IO fermées.'));
      await adminStore.close();
      httpServer.close(() => {
        logger.info('Serveur HTTP arrêté avec succès.');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    } catch (err: any) {
      logger.error({ err: err.message }, 'Erreur pendant la fermeture');
      process.exit(1);
    }
  };

  return {
    app,
    httpServer,
    io,
    adminStore,
    logger: logger.getRawLogger(),
    broadcaster,
    config: configService.getAll(),
    shutdown,
  };
}
