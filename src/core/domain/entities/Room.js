/**
 * @file src/core/domain/entities/Room.js
 * @description Entité Room représentant une salle de vente aux enchères ou un canal de diffusion.
 */

export class Room {
  static ROOM_PATTERN = /^auctav(\d+|_follow|_screen)$/;

  /**
   * @param {string} name
   * @param {'sale' | 'follow' | 'screen'} type
   * @param {number} [saleId]
   */
  constructor(name, type, saleId) {
    this.name = name;
    this.type = type;
    this.saleId = saleId;
  }

  /**
   * Crée et valide une instance de Room à partir de son nom.
   * @param {unknown} rawName
   * @returns {Room | null}
   */
  static fromName(rawName) {
    if (typeof rawName !== 'string') return null;
    const trimmed = rawName.trim();
    const match = trimmed.match(Room.ROOM_PATTERN);
    if (!match) return null;

    if (trimmed === 'auctav_follow') {
      return new Room(trimmed, 'follow');
    }
    if (trimmed === 'auctav_screen') {
      return new Room(trimmed, 'screen');
    }

    const saleId = parseInt(match[1], 10);
    return new Room(trimmed, 'sale', Number.isNaN(saleId) ? undefined : saleId);
  }

  /**
   * @param {unknown} name
   * @returns {boolean}
   */
  static isValid(name) {
    return Room.fromName(name) !== null;
  }
}
