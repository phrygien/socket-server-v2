/**
 * @file server.ts
 * @description Point d'entrée TypeScript (dev) pour le serveur Socket.IO d'enchères en direct.
 */

import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { bootstrapAuctionServer } from './src/core/bootstrap.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const { logger, shutdown } = await bootstrapAuctionServer(httpServer, { app });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Serveur Backend Socket.IO écoute sur http://0.0.0.0:${PORT}`);
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Erreur fatale au démarrage du backend:', err);
  process.exit(1);
});
