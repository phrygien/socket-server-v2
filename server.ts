/**
 * @file server.ts
 * @description Point d'entrée TypeScript (dev) pour le serveur Auctav Socket.IO.
 */

import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { bootstrapAuctavServer } from './src/core/bootstrap.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const { logger, shutdown } = await bootstrapAuctavServer(httpServer, { app });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Serveur Backend Auctav Socket.IO écoute sur http://0.0.0.0:${PORT}`);
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Erreur fatale au démarrage du backend Auctav:', err);
  process.exit(1);
});
