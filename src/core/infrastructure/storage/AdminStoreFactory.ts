/**
 * @file src/core/infrastructure/storage/AdminStoreFactory.ts
 * @description Fabrique de création du magasin Admin (Redis avec repli transparent sur Memory).
 */

import { IAdminStore } from '../../domain/ports/IAdminStore.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';
import { MemoryAdminStore } from './MemoryAdminStore.ts';
import { RedisAdminStore } from './RedisAdminStore.ts';

export class AdminStoreFactory {
  public static async create(redisUrl: string | null, logger: ILogger): Promise<IAdminStore> {
    if (redisUrl) {
      try {
        const { default: Redis } = await import('ioredis');
        const redis = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        });

        redis.on('error', (err: any) => {
          logger.error({ err: err.message }, 'Erreur client Redis adminStore');
        });

        logger.info({ redisUrl }, 'adminStore initialisé sur Redis');
        return new RedisAdminStore(redis, logger);
      } catch (err: any) {
        logger.error({ err: err.message }, 'Échec initialisation Redis, repli automatique sur mémoire interne');
      }
    }

    logger.info('adminStore initialisé en mémoire interne (MemoryAdminStore)');
    return new MemoryAdminStore();
  }
}
