/**
 * @file server.ts
 * @description Point d'entrée full-stack pour l'environnement de développement et de démonstration.
 * Monte le serveur Socket.IO Auctav (Clean Architecture) et intègre les middlewares Vite en mode dev.
 */

import http from 'node:http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { bootstrapAuctavServer } from './src/core/bootstrap.ts';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Initialisation du serveur Auctav Socket.IO via Clean Architecture
  const { logger } = await bootstrapAuctavServer(httpServer, { app });

  // En mode développement, brancher les middlewares Vite
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`✨ Serveur Auctav Clean Architecture opérationnel sur le port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Erreur au démarrage du serveur:', err);
  process.exit(1);
});
