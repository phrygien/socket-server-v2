/**
 * @file src/core/infrastructure/socket/SocketIoBroadcaster.ts
 * @description Adaptateur Socket.IO implémentant le port IBroadcaster.
 */

import { Server } from 'socket.io';
import { IBroadcaster, UserListPayload } from '../../domain/ports/IBroadcaster.ts';
import { Room } from '../../domain/entities/Room.ts';

export class SocketIoBroadcaster implements IBroadcaster {
  constructor(private readonly io: Server) {}

  public broadcastToRoom(room: string, event: string, payload: any): void {
    this.io.to(room).emit(event, payload);
  }

  public sendToSocket(socketId: string, event: string, payload: any): void {
    this.io.to(socketId).emit(event, payload);
  }

  public broadcastUserList(room: string, payload: UserListPayload, targetSocketId: string | null = null): void {
    this.io.to(room).emit('userList', payload);
    if (targetSocketId) {
      this.io.to(targetSocketId).emit('userList', payload);
    }
  }

  public getRoomSocketsCount(room: string): number {
    const sockets = this.io.sockets.adapter.rooms.get(room);
    return sockets ? sockets.size : 0;
  }

  public getTotalConnectionsCount(): number {
    return this.io.engine ? this.io.engine.clientsCount : 0;
  }

  public getAllActiveRooms(): string[] {
    const roomsMap = this.io.sockets.adapter.rooms;
    const activeRooms: string[] = [];
    for (const roomName of roomsMap.keys()) {
      if (Room.isValid(roomName)) {
        activeRooms.push(roomName);
      }
    }
    return activeRooms;
  }
}
