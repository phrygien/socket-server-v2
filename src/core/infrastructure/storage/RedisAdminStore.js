/**
 * @file src/core/infrastructure/storage/RedisAdminStore.js
 * @description Implémentation Redis distribuée de IAdminStore via ioredis (clé auctav:admin:{room}).
 */

export class RedisAdminStore {
  /**
   * @param {any} redisClient
   * @param {import('../../domain/ports/types.js').ILogger} logger
   */
  constructor(redisClient, logger) {
    /** @type {'redis'} */
    this.type = 'redis';
    this.redisClient = redisClient;
    this.logger = logger;
  }

  async get(room) {
    try {
      return await this.redisClient.get(`auctav:admin:${room}`);
    } catch (err) {
      this.logger.error({ err: err.message, room }, 'Erreur Redis get admin');
      return null;
    }
  }

  async set(room, socketId) {
    try {
      await this.redisClient.set(`auctav:admin:${room}`, socketId);
    } catch (err) {
      this.logger.error({ err: err.message, room, socketId }, 'Erreur Redis set admin');
    }
  }

  async delete(room) {
    try {
      await this.redisClient.del(`auctav:admin:${room}`);
    } catch (err) {
      this.logger.error({ err: err.message, room }, 'Erreur Redis delete admin');
    }
  }

  async getRoomsBySocketId(socketId) {
    try {
      const keys = await this.redisClient.keys('auctav:admin:*');
      const matchingRooms = [];
      for (const key of keys) {
        const val = await this.redisClient.get(key);
        if (val === socketId) {
          matchingRooms.push(key.replace('auctav:admin:', ''));
        }
      }
      return matchingRooms;
    } catch (err) {
      this.logger.error({ err: err.message, socketId }, 'Erreur Redis getRoomsBySocketId');
      return [];
    }
  }

  async isAdminSocket(socketId) {
    try {
      const keys = await this.redisClient.keys('auctav:admin:*');
      for (const key of keys) {
        const val = await this.redisClient.get(key);
        if (val === socketId) return true;
      }
      return false;
    } catch (err) {
      this.logger.error({ err: err.message, socketId }, 'Erreur Redis isAdminSocket');
      return false;
    }
  }

  async close() {
    try {
      await this.redisClient.quit();
    } catch {
      // Ignore
    }
  }
}
