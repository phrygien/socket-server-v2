/**
 * @file src/core/application/use-cases/JoinRoomUseCase.js
 * @description Cas d'utilisation : Inscription d'un socket à une room et diffusion de l'état userList.
 */

import { Room } from '../../domain/entities/Room.js';

export class JoinRoomUseCase {
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
   * @param {{ session: import('../../domain/entities/SocketSession.js').SocketSession, rawRoom: unknown, onJoinSocketRoom: (roomName: string) => void }} params
   * @returns {Promise<boolean>}
   */
  async execute(params) {
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
      count,
    };

    // Diffusion à toute la room ET au socket qui vient de rejoindre
    this.broadcaster.broadcastUserList(room.name, userListPayload, session.socketId);

    return true;
  }
}
