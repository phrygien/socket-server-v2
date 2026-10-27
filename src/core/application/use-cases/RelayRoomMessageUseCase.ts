/**
 * @file src/core/application/use-cases/RelayRoomMessageUseCase.ts
 * @description Cas d'utilisation : Relais d'un message vers tous les membres d'une room avec contrôle d'autorisation.
 */

import { SocketSession } from '../../domain/entities/SocketSession.ts';
import { Room } from '../../domain/entities/Room.ts';
import { Message } from '../../domain/entities/Message.ts';
import { AuthorizationPolicy } from '../../domain/policies/AuthorizationPolicy.ts';
import { IBroadcaster } from '../../domain/ports/IBroadcaster.ts';
import { IRateLimiter } from '../../domain/ports/IRateLimiter.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';

export class RelayRoomMessageUseCase {
  constructor(
    private readonly broadcaster: IBroadcaster,
    private readonly allowUnauthUpdateLot: boolean,
    private readonly logger: ILogger
  ) {}

  public execute(params: {
    session: SocketSession;
    rateLimiter: IRateLimiter;
    payload: any;
  }): boolean {
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

    // Rate Limiting
    if (!rateLimiter.tryConsume(message.type)) {
      this.logger.warn(
        { socketId: session.socketId, type: message.type, ip: session.clientIp },
        'Rate limit dépassé sur getMsgRoom'
      );
      return false;
    }

    // Vérification des droits d'émission
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

    // Relais sous l'événement unique sendMsg
    this.broadcaster.broadcastToRoom(room.name, 'sendMsg', message.toPayload());
    return true;
  }
}
