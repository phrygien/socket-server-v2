/**
 * @file src/core/application/use-cases/HandleDisconnectUseCase.js
 * @description Cas d'utilisation : Gestion de la déconnexion d'un client et resynchronisation de userList.
 */

import { Room } from '../../domain/entities/Room.js';

export class HandleDisconnectUseCase {
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
   * @param {import('../../domain/entities/SocketSession.js').SocketSession} session
   * @returns {Promise<void>}
   */
  async execute(session) {
    if (session.isAdmin) {
      const ownedRooms = await this.adminStore.getRoomsBySocketId(session.socketId);

      for (const roomName of ownedRooms) {
        await this.adminStore.delete(roomName);
        this.logger.info(
          { room: roomName, adminSocketId: session.socketId },
          'Admin déconnecté : diffusion userList { admin: null }'
        );

        const currentCount = Math.max(0, this.broadcaster.getRoomSocketsCount(roomName) - 1);
        this.broadcaster.broadcastUserList(roomName, {
          admin: null,
          count: currentCount,
        });
      }
    } else {
      for (const roomName of session.rooms) {
        if (Room.isValid(roomName)) {
          const currentCount = Math.max(0, this.broadcaster.getRoomSocketsCount(roomName) - 1);
          const adminId = await this.adminStore.get(roomName);
          this.broadcaster.broadcastUserList(roomName, {
            admin: adminId || null,
            count: currentCount,
          });
        }
      }
    }
  }
}
