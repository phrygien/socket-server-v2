/**
 * @file src/core/infrastructure/storage/MemoryAdminStore.js
 * @description Implémentation en mémoire de IAdminStore via Map.
 */

export class MemoryAdminStore {
  constructor() {
    /** @type {'memory'} */
    this.type = 'memory';
    /** @type {Map<string, string>} */
    this.memoryMap = new Map();
  }

  async get(room) {
    return this.memoryMap.get(room) || null;
  }

  async set(room, socketId) {
    this.memoryMap.set(room, socketId);
  }

  async delete(room) {
    this.memoryMap.delete(room);
  }

  async getRoomsBySocketId(socketId) {
    const rooms = [];
    for (const [room, adminId] of this.memoryMap.entries()) {
      if (adminId === socketId) rooms.push(room);
    }
    return rooms;
  }

  async isAdminSocket(socketId) {
    for (const adminId of this.memoryMap.values()) {
      if (adminId === socketId) return true;
    }
    return false;
  }

  async close() {
    this.memoryMap.clear();
  }
}
