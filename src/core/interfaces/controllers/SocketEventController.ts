/**
 * @file src/core/interfaces/controllers/SocketEventController.ts
 * @description Contrôleur Socket.IO mappant les événements du protocole Auctav vers les Use Cases applicatifs.
 */

import { Server, Socket } from 'socket.io';
import { SocketSession } from '../../domain/entities/SocketSession.ts';
import { TokenBucketRateLimiter } from '../../infrastructure/security/TokenBucketRateLimiter.ts';
import { AuthenticateAdminUseCase } from '../../application/use-cases/AuthenticateAdminUseCase.ts';
import { JoinRoomUseCase } from '../../application/use-cases/JoinRoomUseCase.ts';
import { RelayRoomMessageUseCase } from '../../application/use-cases/RelayRoomMessageUseCase.ts';
import { RelayPrivateMessageUseCase } from '../../application/use-cases/RelayPrivateMessageUseCase.ts';
import { HandleDisconnectUseCase } from '../../application/use-cases/HandleDisconnectUseCase.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';

export interface SocketControllerDependencies {
  authAdminUseCase: AuthenticateAdminUseCase;
  joinRoomUseCase: JoinRoomUseCase;
  relayRoomUseCase: RelayRoomMessageUseCase;
  relayPrivateUseCase: RelayPrivateMessageUseCase;
  handleDisconnectUseCase: HandleDisconnectUseCase;
  logger: ILogger;
}

export class SocketEventController {
  constructor(private readonly deps: SocketControllerDependencies) {}

  public register(io: Server): void {
    io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    const rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (rawIp || 'unknown');

    const session = new SocketSession(socket.id, String(clientIp));
    const rateLimiter = new TokenBucketRateLimiter();

    // Attachement de session au socket
    socket.data = { session, rateLimiter };
    this.deps.logger.debug({ socketId: socket.id, ip: clientIp }, 'Client Socket.IO connecté');

    // 1. Événement 'admin' : socket.emit('admin', pseudo, key, ack)
    socket.on('admin', async (pseudo: unknown, key: unknown, ack: unknown) => {
      try {
        const hasAck = typeof ack === 'function';
        const result = await this.deps.authAdminUseCase.execute({
          session,
          pseudo,
          providedKey: key,
        });
        if (hasAck) {
          (ack as Function)(result);
        }
      } catch (err: any) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler admin');
        if (typeof ack === 'function') (ack as Function)({ ok: false });
      }
    });

    // 2. Événement 'joinroom' : socket.emit('joinroom', room)
    socket.on('joinroom', async (room: unknown) => {
      try {
        await this.deps.joinRoomUseCase.execute({
          session,
          rawRoom: room,
          onJoinSocketRoom: roomName => socket.join(roomName),
        });
      } catch (err: any) {
        this.deps.logger.error({ err: err.message, socketId: socket.id, room }, 'Erreur handler joinroom');
      }
    });

    // 3. Événement 'username' : socket.emit('username', pseudo)
    socket.on('username', (pseudo: unknown) => {
      try {
        if (typeof pseudo === 'string') {
          session.setBidderName(pseudo);
        }
      } catch (err: any) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler username');
      }
    });

    // 4. Événement 'getMsgRoom' : socket.emit('getMsgRoom', { room, type, msg, name })
    socket.on('getMsgRoom', (payload: unknown) => {
      try {
        this.deps.relayRoomUseCase.execute({
          session,
          rateLimiter,
          payload,
        });
      } catch (err: any) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler getMsgRoom');
      }
    });

    // 5. Événement 'getMsgPrivate' : socket.emit('getMsgPrivate', { toid, type, msg, name })
    socket.on('getMsgPrivate', async (payload: unknown) => {
      try {
        await this.deps.relayPrivateUseCase.execute({
          session,
          rateLimiter,
          payload,
        });
      } catch (err: any) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler getMsgPrivate');
      }
    });

    // 6. Déconnexion
    socket.on('disconnecting', async (reason: string) => {
      try {
        this.deps.logger.debug({ socketId: socket.id, reason }, 'Socket en cours de déconnexion');
        await this.deps.handleDisconnectUseCase.execute(session);
      } catch (err: any) {
        this.deps.logger.error({ err: err.message, socketId: socket.id }, 'Erreur handler disconnecting');
      }
    });
  }
}
