/**
 * @file src/core/domain/ports/IAdminStore.ts
 * @description Port secondaire abstrayant le stockage et l'identification des administrateurs de rooms.
 */

export interface IAdminStore {
  readonly type: 'memory' | 'redis';
  get(room: string): Promise<string | null>;
  set(room: string, socketId: string): Promise<void>;
  delete(room: string): Promise<void>;
  getRoomsBySocketId(socketId: string): Promise<string[]>;
  isAdminSocket(socketId: string): Promise<boolean>;
  close(): Promise<void>;
}
