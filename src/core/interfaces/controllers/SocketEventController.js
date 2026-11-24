/**
 * @file src/core/interfaces/controllers/SocketEventController.js
 * @description Contrôleur Socket.IO mappant les événements du protocole vers les Use Cases applicatifs.
 */

import { SocketSession } from '../../domain/entities/SocketSession.js';
import { TokenBucketRateLimiter } from '../../infrastructure/security/TokenBucketRateLimiter.js';

export class SocketEventController {
  /**
   * @param {{
   *   authAdminUseCase: import('../../application/use-cases/AuthenticateAdminUseCase.js').AuthenticateAdminUseCase,
   *   joinRoomUseCase: import('../../application/use-cases/JoinRoomUseCase.js').JoinRoomUseCase,
   *   relayRoomUseCase: import('../../application/use-cases/RelayRoomMessageUseCase.js').RelayRoomMessageUseCase,
   *   relayPrivateUseCase: import('../../application/use-cases/RelayPrivateMessageUseCase.js').RelayPrivateMessageUseCase,
   *   handleDisconnectUseCase: import('../../application/use-cases/HandleDisconnectUseCase.js').HandleDisconnectUseCase,
   *   logger: import('../../domain/ports/types.js').ILogger
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {import('socket.io').Server} io
   */
  register(io) {
    io.on('connection', socket => {
      this.handleConnection(socket);
    });
  }

  /**
   * @param {import('socket.io').Socket} socket
   */
  handleConnection(socket) {
    const rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (rawIp || 'unknown');

    const session = new SocketSession(socket.id, String(clientIp));
    const rateLimiter = new TokenBucketRateLimiter();

    socket.data = { session, rateLimiter };
    this.deps.logger.debug({ socketId: socket.id, ip: clientIp }, 'Client Socket.IO connecté');

    // 1. Événement 'admin' : socket.emit('admin', pseudo, key, ack)
    socket.on('admin', async (pseudo, key, ack) => {
      try {
        const hasAck = typeof ack === 'function';
        const result = await this.deps.authAdminUseCase.execute({
          session,
          pseudo,
          providedKey: key,
        });
        if (hasAck) {
          ack(result);
        }
      } catch (err) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler admin');
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    // 2. Événement 'joinroom' : socket.emit('joinroom', room)
    socket.on('joinroom', async room => {
      try {
        await this.deps.joinRoomUseCase.execute({
          session,
          rawRoom: room,
          onJoinSocketRoom: roomName => socket.join(roomName),
        });
      } catch (err) {
        this.deps.logger.error({ err: err.message, socketId: socket.id, room }, 'Erreur handler joinroom');
      }
    });

    // 3. Événement 'username' : socket.emit('username', pseudo)
    socket.on('username', pseudo => {
      try {
        if (typeof pseudo === 'string') {
          session.setBidderName(pseudo);
        }
      } catch (err) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler username');
      }
    });

    // 4. Événement 'getMsgRoom' : socket.emit('getMsgRoom', { room, type, msg, name })
    socket.on('getMsgRoom', payload => {
      try {
        this.deps.relayRoomUseCase.execute({
          session,
          rateLimiter,
          payload,
        });
      } catch (err) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler getMsgRoom');
      }
    });

    // 5. Événement 'getMsgPrivate' : socket.emit('getMsgPrivate', { toid, type, msg, name })
    socket.on('getMsgPrivate', async payload => {
      try {
        await this.deps.relayPrivateUseCase.execute({
          session,
          rateLimiter,
          payload,
        });
      } catch (err) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler getMsgPrivate');
      }
    });

    // 6. Déconnexion
    socket.on('disconnecting', async reason => {
      try {
        this.deps.logger.debug({ socketId: socket.id, reason }, 'Socket en cours de déconnexion');
        await this.deps.handleDisconnectUseCase.execute(session);
      } catch (err) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler disconnecting');
      }
    });
  }
}
