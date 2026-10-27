/**
 * @file src/core/domain/entities/Room.ts
 * @description Entité Room représentant une salle de vente aux enchères ou un canal de diffusion.
 */

export type RoomType = 'sale' | 'follow' | 'screen';

export class Room {
  private static readonly ROOM_PATTERN = /^auctav(\d+|_follow|_screen)$/;

  private constructor(
    public readonly name: string,
    public readonly type: RoomType,
    public readonly saleId?: number
  ) {}

  /**
   * Crée et valide une instance de Room à partir de son nom.
   */
  public static fromName(rawName: unknown): Room | null {
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
    return new Room(trimmed, 'sale', isNaN(saleId) ? undefined : saleId);
  }

  public static isValid(name: unknown): boolean {
    return Room.fromName(name) !== null;
  }
}
