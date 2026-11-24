/**
 * @file server.js
 * @description Serveur Socket.IO haute performance pour plateforme de ventes aux enchères en direct.
 * Conçu pour fonctionner comme relais temps réel entre l'Admin régie, les enchérisseurs (bidders),
 * les écrans salle et les pages de suivi des logs.
 * Compatible Engine.IO v3 (socket.io-client 2.3.0) et Engine.IO v4.
 */

import { createAuctionServer, logger } from './src/socketServer.js';

export * from './src/socketServer.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || 'https://www.example.com,https://example.com';
const ALLOWED_ORIGINS = rawAllowedOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
if (isDirectRun) {
  createAuctionServer().then(({ httpServer, shutdown }) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(
        { port: PORT, origins: ALLOWED_ORIGINS },
        `🚀 Serveur Socket.IO v4 (allowEIO3) démarré sur http://0.0.0.0:${PORT}`
      );
    });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}
