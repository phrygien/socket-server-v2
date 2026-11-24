/**
 * @file src/core/infrastructure/storage/AdminStoreFactory.js
 * @description Fabrique de création du magasin Admin (Redis avec repli transparent sur Memory).
 */

import { MemoryAdminStore } from './MemoryAdminStore.js';
import { RedisAdminStore } from './RedisAdminStore.js';

export class AdminStoreFactory {
  /**
   * @param {string | null} redisUrl
   * @param {import('../../domain/ports/types.js').ILogger} logger
   * @returns {Promise<import('../../domain/ports/types.js').IAdminStore>}
   */
  static async create(redisUrl, logger) {
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

        logger.info({ redisUrl }, 'adminStore initialisé sur Redis');
        return new RedisAdminStore(redis, logger);
      } catch (err) {
        logger.error({ err: err.message }, 'Échec initialisation Redis, repli automatique sur mémoire interne');
      }
    }

    logger.info('adminStore initialisé en mémoire interne (MemoryAdminStore)');
    return new MemoryAdminStore();
  }
}
