/**
 * @file src/core/infrastructure/config/ConfigService.ts
 * @description Service de configuration fortement typé avec valeurs par défaut sécurisées.
 */

import dotenv from 'dotenv';

dotenv.config();

export interface AuctavConfig {
  port: number;
  adminKey: string;
  allowedOrigins: string[];
  redisUrl: string | null;
  logLevel: string;
  allowUnauthUpdateLot: boolean;
  nodeEnv: string;
}

export class ConfigService {
  private readonly config: AuctavConfig;

  constructor() {
    const rawOrigins = process.env.ALLOWED_ORIGINS || 'https://www.auctav.com,https://auctav.com';
    const origins = rawOrigins
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    this.config = {
      port: parseInt(process.env.PORT || '3000', 10),
      adminKey: process.env.ADMIN_KEY || 'auctav_secret_dev_key',
      allowedOrigins: origins,
      redisUrl: process.env.REDIS_URL || null,
      logLevel: process.env.LOG_LEVEL || 'info',
      allowUnauthUpdateLot: process.env.ALLOW_UNAUTH_UPDATELOT === 'true',
      nodeEnv: process.env.NODE_ENV || 'development',
    };
  }

  public get<K extends keyof AuctavConfig>(key: K): AuctavConfig[K] {
    return this.config[key];
  }

  public getAll(): AuctavConfig {
    return { ...this.config };
  }
}
