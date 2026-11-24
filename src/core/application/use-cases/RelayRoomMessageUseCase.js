/**
 * @file src/core/application/use-cases/RelayRoomMessageUseCase.js
 * @description Cas d'utilisation : Relais d'un message vers tous les membres d'une room avec contrôle d'autorisation.
 */

import { Room } from '../../domain/entities/Room.js';
import { Message } from '../../domain/entities/Message.js';
import { AuthorizationPolicy } from '../../domain/policies/AuthorizationPolicy.js';

export class RelayRoomMessageUseCase {
  /**
   * @param {import('../../domain/ports/types.js').IBroadcaster} broadcaster
   * @param {boolean} allowUnauthUpdateLot
   * @param {import('../../domain/ports/types.js').ILogger} logger
   */
  constructor(broadcaster, allowUnauthUpdateLot, logger) {
    this.broadcaster = broadcaster;
    this.allowUnauthUpdateLot = allowUnauthUpdateLot;
    this.logger = logger;
  }

  /**
   * @param {{ session: import('../../domain/entities/SocketSession.js').SocketSession, rateLimiter: import('../../domain/ports/types.js').IRateLimiter, payload: any }} params
   * @returns {boolean}
   */
  execute(params) {
    const { session, rateLimiter, payload } = params;

    if (!payload || typeof payload !== 'object') return false;

    const room = Room.fromName(payload.room);
    if (!room) return false;

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
        'Rate limit dépassé sur getMsgRoom'
      );
      return false;
    }

    const authCheck = AuthorizationPolicy.canEmitToRoom(
      session,
      message.type,
      this.allowUnauthUpdateLot
    );

    if (!authCheck.allowed) {
      this.logger.warn(
        { socketId: session.socketId, type: message.type, room: room.name, reason: authCheck.reason },
        'Émission getMsgRoom rejetée : permissions insuffisantes'
      );
      return false;
    }

    if (authCheck.reason === 'exception_unauth_updatelot') {
      this.logger.warn(
        { socketId: session.socketId, type: message.type, room: room.name },
        'Émission updateLot non authentifiée autorisée via ALLOW_UNAUTH_UPDATELOT'
      );
    }

    this.broadcaster.broadcastToRoom(room.name, 'sendMsg', message.toPayload());
    return true;
  }
}
