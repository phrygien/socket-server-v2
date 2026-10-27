/**
 * @file src/core/domain/ports/IBroadcaster.ts
 * @description Port de diffusion temps réel vers les rooms et sockets individuels.
 */

export interface UserListPayload {
  admin: string | null;
  count: number;
}

export interface IBroadcaster {
  broadcastToRoom(room: string, event: string, payload: any): void;
  sendToSocket(socketId: string, event: string, payload: any): void;
  broadcastUserList(room: string, payload: UserListPayload, targetSocketId?: string | null): void;
  getRoomSocketsCount(room: string): number;
  getTotalConnectionsCount(): number;
  getAllActiveRooms(): string[];
}
