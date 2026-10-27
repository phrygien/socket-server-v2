/**
 * @file src/core/application/use-cases/RelayPrivateMessageUseCase.ts
 * @description Cas d'utilisation : Relais d'un message privé vers un socket cible.
 */

import { SocketSession } from '../../domain/entities/SocketSession.ts';
import { Message } from '../../domain/entities/Message.ts';
import { AuthorizationPolicy } from '../../domain/policies/AuthorizationPolicy.ts';
import { IAdminStore } from '../../domain/ports/IAdminStore.ts';
import { IBroadcaster } from '../../domain/ports/IBroadcaster.ts';
import { IRateLimiter } from '../../domain/ports/IRateLimiter.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';

export class RelayPrivateMessageUseCase {
  constructor(
    private readonly adminStore: IAdminStore,
    private readonly broadcaster: IBroadcaster,
    private readonly logger: ILogger
  ) {}

  public async execute(params: {
    session: SocketSession;
    rateLimiter: IRateLimiter;
    payload: any;
  }): Promise<boolean> {
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

    // Rate Limiting
    if (!rateLimiter.tryConsume(message.type)) {
      this.logger.warn(
        { socketId: session.socketId, type: message.type, ip: session.clientIp },
        'Rate limit dépassé sur getMsgPrivate'
      );
      return false;
    }

    // Contrôle strict des autorisations
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

    // Relais privé sous sendMsg vers toid
    this.broadcaster.sendToSocket(toid, 'sendMsg', message.toPayload());
    return true;
  }
}
