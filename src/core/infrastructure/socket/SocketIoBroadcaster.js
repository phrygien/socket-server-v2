/**
 * @file src/core/infrastructure/socket/SocketIoBroadcaster.js
 * @description Adaptateur Socket.IO implémentant le port IBroadcaster.
 */

import { Room } from '../../domain/entities/Room.js';

export class SocketIoBroadcaster {
  /**
   * @param {import('socket.io').Server} io
   * @param {string} [roomPrefix='auction']
   */
  constructor(io, roomPrefix = Room.DEFAULT_PREFIX) {
    this.io = io;
    this.roomPrefix = roomPrefix;
  }

  broadcastToRoom(room, event, payload) {
    this.io.to(room).emit(event, payload);
  }

  sendToSocket(socketId, event, payload) {
    this.io.to(socketId).emit(event, payload);
  }

  broadcastUserList(room, payload, targetSocketId = null) {
    this.io.to(room).emit('userList', payload);
    if (targetSocketId) {
      this.io.to(targetSocketId).emit('userList', payload);
    }
  }

  getRoomSocketsCount(room) {
    const sockets = this.io.sockets.adapter.rooms.get(room);
    return sockets ? sockets.size : 0;
  }

  getTotalConnectionsCount() {
    return this.io.engine ? this.io.engine.clientsCount : 0;
  }

  getAllActiveRooms() {
    const roomsMap = this.io.sockets.adapter.rooms;
    const activeRooms = [];
    for (const roomName of roomsMap.keys()) {
      if (Room.isValid(roomName, this.roomPrefix)) {
        activeRooms.push(roomName);
      }
    }
    return activeRooms;
  }
}
