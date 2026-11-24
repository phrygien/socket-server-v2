/**
 * @file src/core/domain/entities/SocketSession.js
 * @description Représentation métier d'une session de socket connectée.
 */

export class SocketSession {
  /**
   * @param {string} socketId
   * @param {string} clientIp
   * @param {string} [initialName='Anonyme']
   */
  constructor(socketId, clientIp, initialName = 'Anonyme') {
    this.socketId = socketId;
    this.clientIp = clientIp;
    this.isAdmin = false;
    this.name = initialName;
    /** @type {Set<string>} */
    this.rooms = new Set();
    this.connectedAt = new Date();
  }

  /**
   * @param {string} adminPseudo
   */
  setAuthenticatedAdmin(adminPseudo) {
    this.isAdmin = true;
    this.name = adminPseudo.trim() ? adminPseudo.slice(0, 100) : 'Admin';
  }

  /**
   * @param {string} pseudo
   */
  setBidderName(pseudo) {
    if (!this.isAdmin && typeof pseudo === 'string' && pseudo.trim().length > 0) {
      this.name = pseudo.trim().slice(0, 100);
    }
  }

  /**
   * @param {string} roomName
   */
  joinRoom(roomName) {
    this.rooms.add(roomName);
  }

  /**
   * @param {string} roomName
   */
  leaveRoom(roomName) {
    this.rooms.delete(roomName);
  }
}
