/**
 * @file src/core/domain/entities/SocketSession.ts
 * @description Représentation métier d'une session de socket connectée.
 */

export class SocketSession {
  public isAdmin: boolean = false;
  public name: string;
  public readonly rooms: Set<string> = new Set();
  public readonly connectedAt: Date;

  constructor(
    public readonly socketId: string,
    public readonly clientIp: string,
    initialName: string = 'Anonyme'
  ) {
    this.name = initialName;
    this.connectedAt = new Date();
  }

  public setAuthenticatedAdmin(adminPseudo: string): void {
    this.isAdmin = true;
    this.name = adminPseudo.trim() ? adminPseudo.slice(0, 100) : 'Admin';
  }

  public setBidderName(pseudo: string): void {
    if (!this.isAdmin && typeof pseudo === 'string' && pseudo.trim().length > 0) {
      this.name = pseudo.trim().slice(0, 100);
    }
  }

  public joinRoom(roomName: string): void {
    this.rooms.add(roomName);
  }

  public leaveRoom(roomName: string): void {
    this.rooms.delete(roomName);
  }
}
