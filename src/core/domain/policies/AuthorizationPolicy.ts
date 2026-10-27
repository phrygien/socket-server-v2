/**
 * @file src/core/domain/policies/AuthorizationPolicy.ts
 * @description Politiques de sécurité et matrice des droits d'émission pour le protocole Auctav.
 */

import { SocketSession } from '../entities/SocketSession.ts';

export class AuthorizationPolicy {
  public static readonly ADMIN_ONLY_TYPES = new Set([
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

  public static readonly NON_ADMIN_ALLOWED_TYPES = new Set([
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
   */
  public static canEmitToRoom(
    session: SocketSession,
    messageType: string,
    allowUnauthUpdateLot: boolean = false
  ): { allowed: boolean; reason?: string } {
    if (session.isAdmin) {
      return { allowed: true };
    }

    // Exception temporaire pour update.php
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
   */
  public static canEmitPrivate(
    session: SocketSession,
    targetIsAdmin: boolean,
    messageType: string
  ): { allowed: boolean; reason?: string } {
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
