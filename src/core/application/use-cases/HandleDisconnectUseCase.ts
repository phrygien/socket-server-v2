/**
 * @file src/core/application/use-cases/HandleDisconnectUseCase.ts
 * @description Cas d'utilisation : Gestion de la déconnexion d'un client et resynchronisation de userList.
 */

import { SocketSession } from '../../domain/entities/SocketSession.ts';
import { IAdminStore } from '../../domain/ports/IAdminStore.ts';
import { IBroadcaster } from '../../domain/ports/IBroadcaster.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';
import { Room } from '../../domain/entities/Room.ts';

export class HandleDisconnectUseCase {
  constructor(
    private readonly adminStore: IAdminStore,
    private readonly broadcaster: IBroadcaster,
    private readonly logger: ILogger
  ) {}

  public async execute(session: SocketSession): Promise<void> {
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
