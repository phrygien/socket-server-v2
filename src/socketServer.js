/**
 * @file src/socketServer.js
 * @description Point d'entrée du moteur Socket.IO utilisant la Clean Architecture (ESM pur Node.js 20+).
 */

import { bootstrapAuctionServer } from './core/bootstrap.js';
import { AdminStoreFactory } from './core/infrastructure/storage/AdminStoreFactory.js';
import { TimingSafeKeyValidator } from './core/infrastructure/security/TimingSafeKeyValidator.js';
import { TokenBucketRateLimiter } from './core/infrastructure/security/TokenBucketRateLimiter.js';
import { AuthorizationPolicy } from './core/domain/policies/AuthorizationPolicy.js';
import { Room } from './core/domain/entities/Room.js';
import { PinoLogger } from './core/infrastructure/logging/PinoLogger.js';

const defaultLogger = new PinoLogger('info', process.env.NODE_ENV !== 'production');
const defaultKeyValidator = new TimingSafeKeyValidator();

export const ROOM_REGEX = Room.buildPattern(process.env.ROOM_PREFIX || Room.DEFAULT_PREFIX);
export const ADMIN_ONLY_TYPES = AuthorizationPolicy.ADMIN_ONLY_TYPES;
export const NON_ADMIN_ALLOWED_TYPES = AuthorizationPolicy.NON_ADMIN_ALLOWED_TYPES;
export const logger = defaultLogger.getRawLogger();

export async function createAdminStore(redisUrl = null) {
  return await AdminStoreFactory.create(redisUrl, defaultLogger);
}

export function verifyAdminKey(providedKey, expectedKey) {
  return defaultKeyValidator.isValid(providedKey, expectedKey);
}

export function isValidMessageType(type) {
  return typeof type === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(type);
}

export const SocketRateLimiter = TokenBucketRateLimiter;

/**
 * @param {import('node:http').Server | null} [existingHttpServer=null]
 * @param {Record<string, any>} [options={}]
 */
export async function createAuctionServer(existingHttpServer = null, options = {}) {
  return await bootstrapAuctionServer(existingHttpServer, options);
}
