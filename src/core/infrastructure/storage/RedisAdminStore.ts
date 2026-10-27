/**
 * @file src/core/infrastructure/storage/RedisAdminStore.ts
 * @description Implémentation Redis distribuée de IAdminStore via ioredis (clé auctav:admin:{room}).
 */

import { IAdminStore } from '../../domain/ports/IAdminStore.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';

export class RedisAdminStore implements IAdminStore {
  public readonly type = 'redis' as const;

  constructor(
    private readonly redisClient: any,
    private readonly logger: ILogger
  ) {}

  public async get(room: string): Promise<string | null> {
    try {
      return await this.redisClient.get(`auctav:admin:${room}`);
    } catch (err: any) {
      this.logger.error({ err: err.message, room }, 'Erreur Redis get admin');
      return null;
    }
  }

  public async set(room: string, socketId: string): Promise<void> {
    try {
      await this.redisClient.set(`auctav:admin:${room}`, socketId);
    } catch (err: any) {
      this.logger.error({ err: err.message, room, socketId }, 'Erreur Redis set admin');
    }
  }

  public async delete(room: string): Promise<void> {
    try {
      await this.redisClient.del(`auctav:admin:${room}`);
    } catch (err: any) {
      this.logger.error({ err: err.message, room }, 'Erreur Redis delete admin');
    }
  }

  public async getRoomsBySocketId(socketId: string): Promise<string[]> {
    try {
      const keys: string[] = await this.redisClient.keys('auctav:admin:*');
      const matchingRooms: string[] = [];
      for (const key of keys) {
        const val = await this.redisClient.get(key);
        if (val === socketId) {
          matchingRooms.push(key.replace('auctav:admin:', ''));
        }
      }
      return matchingRooms;
    } catch (err: any) {
      this.logger.error({ err: err.message, socketId }, 'Erreur Redis getRoomsBySocketId');
      return [];
    }
  }

  public async isAdminSocket(socketId: string): Promise<boolean> {
    try {
      const keys: string[] = await this.redisClient.keys('auctav:admin:*');
      for (const key of keys) {
        const val = await this.redisClient.get(key);
        if (val === socketId) return true;
      }
      return false;
    } catch (err: any) {
      this.logger.error({ err: err.message, socketId }, 'Erreur Redis isAdminSocket');
      return false;
    }
  }

  public async close(): Promise<void> {
    try {
      await this.redisClient.quit();
    } catch {
      // Ignore
    }
  }
}
