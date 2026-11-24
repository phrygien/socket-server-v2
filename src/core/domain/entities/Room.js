/**
 * @file src/core/domain/entities/Room.js
 * @description Entité Room représentant une salle de vente aux enchères ou un canal de diffusion.
 */

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class Room {
  static DEFAULT_PREFIX = 'auction';

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
   * Construit la regex de validation pour un préfixe donné.
   * @param {string} [prefix='auction']
   * @returns {RegExp}
   */
  static buildPattern(prefix = Room.DEFAULT_PREFIX) {
    const safePrefix = typeof prefix === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(prefix)
      ? prefix
      : Room.DEFAULT_PREFIX;
    return new RegExp(`^${escapeRegExp(safePrefix)}(\\d+|_follow|_screen)$`);
  }

  /**
   * Crée et valide une instance de Room à partir de son nom.
   * @param {unknown} rawName
   * @param {string} [prefix='auction']
   * @returns {Room | null}
   */
  static fromName(rawName, prefix = Room.DEFAULT_PREFIX) {
    if (typeof rawName !== 'string') return null;
    const trimmed = rawName.trim();
    const pattern = Room.buildPattern(prefix);
    const match = trimmed.match(pattern);
    if (!match) return null;

    if (trimmed === `${prefix}_follow`) {
      return new Room(trimmed, 'follow');
    }
    if (trimmed === `${prefix}_screen`) {
      return new Room(trimmed, 'screen');
    }

    const saleId = parseInt(match[1], 10);
    return new Room(trimmed, 'sale', Number.isNaN(saleId) ? undefined : saleId);
  }

  /**
   * @param {unknown} name
   * @param {string} [prefix='auction']
   * @returns {boolean}
   */
  static isValid(name, prefix = Room.DEFAULT_PREFIX) {
    return Room.fromName(name, prefix) !== null;
  }
}
