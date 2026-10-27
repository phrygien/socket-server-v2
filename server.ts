/**
 * @file server.ts
 * @description Point d'entrée Backend Node.js pour le serveur Auctav Socket.IO (Clean Architecture).
 * Exécute le serveur HTTP Express et le serveur temps réel Socket.IO sans composant frontend.
 */

import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { bootstrapAuctavServer } from './src/core/bootstrap.ts';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Initialisation du serveur Auctav Socket.IO complet via la racine de composition Clean Architecture
  const { logger } = await bootstrapAuctavServer(httpServer, { app });

  // Route racine fournissant les métadonnées et l'état du backend
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Serveur Backend Auctav Socket.IO écoute sur http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Erreur fatale au démarrage du backend Auctav:', err);
  process.exit(1);
});
