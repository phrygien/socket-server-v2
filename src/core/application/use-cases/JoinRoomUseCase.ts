/**
 * @file src/core/application/use-cases/JoinRoomUseCase.ts
 * @description Cas d'utilisation : Inscription d'un socket à une room et diffusion de l'état userList.
 */

import { SocketSession } from '../../domain/entities/SocketSession.ts';
import { Room } from '../../domain/entities/Room.ts';
import { IAdminStore } from '../../domain/ports/IAdminStore.ts';
import { IBroadcaster } from '../../domain/ports/IBroadcaster.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';

export class JoinRoomUseCase {
  constructor(
    private readonly adminStore: IAdminStore,
    private readonly broadcaster: IBroadcaster,
    private readonly logger: ILogger
  ) {}

  public async execute(params: {
    session: SocketSession;
    rawRoom: unknown;
    onJoinSocketRoom: (roomName: string) => void;
  }): Promise<boolean> {
    const { session, rawRoom, onJoinSocketRoom } = params;

    const room = Room.fromName(rawRoom);
    if (!room) {
      this.logger.debug({ socketId: session.socketId, rawRoom }, 'joinroom ignoré : format de room invalide');
      return false;
    }

    onJoinSocketRoom(room.name);
    session.joinRoom(room.name);

    if (session.isAdmin) {
      await this.adminStore.set(room.name, session.socketId);
    }

    const currentAdminId = await this.adminStore.get(room.name);
    const count = this.broadcaster.getRoomSocketsCount(room.name);

    const userListPayload = {
      admin: currentAdminId || null,
      count: count,
    };

    // Diffusion à toute la room ET au socket qui vient de rejoindre
    this.broadcaster.broadcastUserList(room.name, userListPayload, session.socketId);

    return true;
  }
}
