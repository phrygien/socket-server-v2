/**
 * @file src/core/infrastructure/config/ConfigService.js
 * @description Service de configuration avec valeurs par défaut sécurisées.
 */

import dotenv from 'dotenv';

dotenv.config();

export class ConfigService {
  constructor() {
    const rawOrigins = process.env.ALLOWED_ORIGINS || 'https://www.example.com,https://example.com';
    const origins = rawOrigins
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const rawPrefix = process.env.ROOM_PREFIX || 'auction';
    const roomPrefix = /^[a-zA-Z0-9_-]{1,30}$/.test(rawPrefix) ? rawPrefix : 'auction';

    this.config = {
      port: parseInt(process.env.PORT || '3000', 10),
      adminKey: process.env.ADMIN_KEY || 'auction_secret_dev_key',
      allowedOrigins: origins,
      roomPrefix,
      redisUrl: process.env.REDIS_URL || null,
      logLevel: process.env.LOG_LEVEL || 'info',
      allowUnauthUpdateLot: process.env.ALLOW_UNAUTH_UPDATELOT === 'true',
      nodeEnv: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * @param {'port' | 'adminKey' | 'allowedOrigins' | 'roomPrefix' | 'redisUrl' | 'logLevel' | 'allowUnauthUpdateLot' | 'nodeEnv'} key
   */
  get(key) {
    return this.config[key];
  }

  getAll() {
    return { ...this.config };
  }
}
