/**
 * @file src/core/infrastructure/storage/MemoryAdminStore.ts
 * @description Implémentation en mémoire de IAdminStore via Map.
 */

import { IAdminStore } from '../../domain/ports/IAdminStore.ts';

export class MemoryAdminStore implements IAdminStore {
  public readonly type = 'memory' as const;
  private readonly memoryMap: Map<string, string> = new Map();

  public async get(room: string): Promise<string | null> {
    return this.memoryMap.get(room) || null;
  }

  public async set(room: string, socketId: string): Promise<void> {
    this.memoryMap.set(room, socketId);
  }

  public async delete(room: string): Promise<void> {
    this.memoryMap.delete(room);
  }

  public async getRoomsBySocketId(socketId: string): Promise<string[]> {
    const rooms: string[] = [];
    for (const [room, adminId] of this.memoryMap.entries()) {
      if (adminId === socketId) rooms.push(room);
    }
    return rooms;
  }

  public async isAdminSocket(socketId: string): Promise<boolean> {
    for (const adminId of this.memoryMap.values()) {
      if (adminId === socketId) return true;
    }
    return false;
  }

  public async close(): Promise<void> {
    this.memoryMap.clear();
  }
}
