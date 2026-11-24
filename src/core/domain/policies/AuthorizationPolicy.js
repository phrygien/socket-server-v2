/**
 * @file src/core/domain/policies/AuthorizationPolicy.js
 * @description Politiques de sécurité et matrice des droits d'émission pour le protocole d'enchères temps réel.
 */

export class AuthorizationPolicy {
  static ADMIN_ONLY_TYPES = new Set([
    'numLot',
    'listLot',
    'updateLot',
    'closeEnchere',
    'previousLot',
    'confirmEnchere',
    'validEnchere',
    'changeDevice',
    'noActivity',
    'message',
    'online',
    'users',
  ]);

  static NON_ADMIN_ALLOWED_TYPES = new Set([
    'doEncheres',
    'reconnection',
    'getEncheresList',
    'requestRefresh',
    'connected',
    'exit',
    'follow',
    'getEncheres',
    'getScreen',
  ]);

  /**
   * Vérifie si une session a le droit d'émettre un type de message vers toute une room.
   * @param {import('../entities/SocketSession.js').SocketSession} session
   * @param {string} messageType
   * @param {boolean} [allowUnauthUpdateLot=false]
   * @returns {{ allowed: boolean, reason?: string }}
   */
  static canEmitToRoom(session, messageType, allowUnauthUpdateLot = false) {
    if (session.isAdmin) {
      return { allowed: true };
    }

    if (allowUnauthUpdateLot && messageType === 'updateLot') {
      return { allowed: true, reason: 'exception_unauth_updatelot' };
    }

    return {
      allowed: false,
      reason: 'seul un administrateur est autorisé à émettre vers une room',
    };
  }

  /**
   * Vérifie si une session a le droit d'envoyer un message privé à un destinataire donné.
   * @param {import('../entities/SocketSession.js').SocketSession} session
   * @param {boolean} targetIsAdmin
   * @param {string} messageType
   * @returns {{ allowed: boolean, reason?: string }}
   */
  static canEmitPrivate(session, targetIsAdmin, messageType) {
    if (session.isAdmin) {
      return { allowed: true };
    }

    if (!targetIsAdmin) {
      return {
        allowed: false,
        reason: 'un non-admin ne peut envoyer de message privé qu’à un administrateur enregistré',
      };
    }

    if (!AuthorizationPolicy.NON_ADMIN_ALLOWED_TYPES.has(messageType)) {
      return {
        allowed: false,
        reason: `le type de message '${messageType}' est réservé à l’administration`,
      };
    }

    return { allowed: true };
  }
}
