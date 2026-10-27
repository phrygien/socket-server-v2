/**
 * @file server.ts
 * @description Point d'entrée full-stack pour l'environnement de développement et de démonstration.
 * Monte le serveur Socket.IO Auctav et intègre les middlewares Vite en mode développement.
 */

import http from 'node:http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createAuctavServer } from './src/socketServer.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Initialisation du serveur Auctav Socket.IO complet
  const { io, adminStore, logger } = await createAuctavServer(httpServer as any, { app });

  // API helper pour exécuter le test client automatisé depuis l'interface UI
  app.get('/api/server-info', async (req, res) => {
    try {
      const roomsMap = io.sockets.adapter.rooms;
      const activeRooms: Array<{ name: string; count: number; admin: string | null }> = [];
      
      for (const [roomName, socketsSet] of roomsMap.entries()) {
        if (/^auctav(\d+|_follow|_screen)$/.test(roomName)) {
          const adminId = await adminStore.get(roomName);
          activeRooms.push({
            name: roomName,
            count: socketsSet.size,
            admin: adminId,
          });
        }
      }

      res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        connections: io.engine ? io.engine.clientsCount : 0,
        rooms: activeRooms,
        storage: adminStore.type,
        eio3Allowed: true,
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // En mode développement, brancher les middlewares Vite
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // En production pour l'applet, servir les fichiers statiques construits
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`✨ Serveur Full-Stack & UI de test Auctav écoute sur le port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Erreur au démarrage du serveur:', err);
  process.exit(1);
});
