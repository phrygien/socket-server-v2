/**
 * @file src/core/application/use-cases/RelayPrivateMessageUseCase.js
 * @description Cas d'utilisation : Relais d'un message privé vers un socket cible.
 */

import { Message } from '../../domain/entities/Message.js';
import { AuthorizationPolicy } from '../../domain/policies/AuthorizationPolicy.js';

export class RelayPrivateMessageUseCase {
  /**
   * @param {import('../../domain/ports/types.js').IAdminStore} adminStore
   * @param {import('../../domain/ports/types.js').IBroadcaster} broadcaster
   * @param {import('../../domain/ports/types.js').ILogger} logger
   */
  constructor(adminStore, broadcaster, logger) {
    this.adminStore = adminStore;
    this.broadcaster = broadcaster;
    this.logger = logger;
  }

  /**
   * @param {{ session: import('../../domain/entities/SocketSession.js').SocketSession, rateLimiter: import('../../domain/ports/types.js').IRateLimiter, payload: any }} params
   * @returns {Promise<boolean>}
   */
  async execute(params) {
    const { session, rateLimiter, payload } = params;

    if (!payload || typeof payload !== 'object') return false;

    const toid = payload.toid;
    if (!toid || typeof toid !== 'string') return false;

    const message = Message.create({
      rawType: payload.type,
      rawMsg: payload.msg,
      rawName: payload.name,
      verifiedFrom: session.socketId,
      fallbackName: session.name,
    });

    if (!message) return false;

    if (!rateLimiter.tryConsume(message.type)) {
      this.logger.warn(
        { socketId: session.socketId, type: message.type, ip: session.clientIp },
        'Rate limit dépassé sur getMsgPrivate'
      );
      return false;
    }

    if (!session.isAdmin) {
      const isTargetAdmin = await this.adminStore.isAdminSocket(toid);
      const authCheck = AuthorizationPolicy.canEmitPrivate(
        session,
        isTargetAdmin,
        message.type
      );

      if (!authCheck.allowed) {
        this.logger.warn(
          { from: session.socketId, toid, type: message.type, reason: authCheck.reason },
          'Émission getMsgPrivate rejetée : violation des règles de sécurité'
        );
        return false;
      }
    }

    this.broadcaster.sendToSocket(toid, 'sendMsg', message.toPayload());
    return true;
  }
}
