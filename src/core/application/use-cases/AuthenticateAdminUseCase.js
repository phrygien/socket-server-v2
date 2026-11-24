/**
 * @file src/core/application/use-cases/AuthenticateAdminUseCase.js
 * @description Cas d'utilisation : Authentification d'un administrateur régie avec vérification sécurisée.
 */

import { Room } from '../../domain/entities/Room.js';

export class AuthenticateAdminUseCase {
  /**
   * @param {import('../../domain/ports/types.js').IAdminStore} adminStore
   * @param {import('../../domain/ports/types.js').IBroadcaster} broadcaster
   * @param {import('../../domain/ports/types.js').IKeyValidator} keyValidator
   * @param {string} expectedAdminKey
   * @param {import('../../domain/ports/types.js').ILogger} logger
   */
  constructor(adminStore, broadcaster, keyValidator, expectedAdminKey, logger) {
    this.adminStore = adminStore;
    this.broadcaster = broadcaster;
    this.keyValidator = keyValidator;
    this.expectedAdminKey = expectedAdminKey;
    this.logger = logger;
  }

  /**
   * @param {{ session: import('../../domain/entities/SocketSession.js').SocketSession, pseudo: unknown, providedKey: unknown }} params
   * @returns {Promise<{ ok: boolean }>}
   */
  async execute(params) {
    const { session, pseudo, providedKey } = params;

    if (!providedKey || typeof providedKey !== 'string') {
      this.logger.warn({ socketId: session.socketId, ip: session.clientIp }, 'Tentative admin sans clé fournie');
      return { ok: false };
    }

    const isValid = this.keyValidator.isValid(providedKey, this.expectedAdminKey);
    if (!isValid) {
      this.logger.warn({ socketId: session.socketId, ip: session.clientIp }, 'Échec authentification admin : clé invalide');
      return { ok: false };
    }

    const adminName = typeof pseudo === 'string' && pseudo.trim().length > 0 ? pseudo : 'Admin';
    session.setAuthenticatedAdmin(adminName);

    this.logger.info(
      { socketId: session.socketId, name: session.name, ip: session.clientIp },
      'Admin régie authentifié avec succès'
    );

    // Si l'admin était déjà inscrit dans des rooms avant de s'authentifier,
    // enregistrer son id comme autorité de ces rooms et diffuser userList
    for (const roomName of session.rooms) {
      if (Room.isValid(roomName)) {
        await this.adminStore.set(roomName, session.socketId);
        const count = this.broadcaster.getRoomSocketsCount(roomName);
        this.broadcaster.broadcastUserList(roomName, {
          admin: session.socketId,
          count,
        });
      }
    }

    return { ok: true };
  }
}
