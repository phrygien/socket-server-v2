/**
 * @file src/core/application/use-cases/AuthenticateAdminUseCase.ts
 * @description Cas d'utilisation : Authentification d'un administrateur régie avec vérification sécurisée.
 */

import { SocketSession } from '../../domain/entities/SocketSession.ts';
import { IAdminStore } from '../../domain/ports/IAdminStore.ts';
import { IBroadcaster } from '../../domain/ports/IBroadcaster.ts';
import { ILogger } from '../../domain/ports/ILogger.ts';
import { Room } from '../../domain/entities/Room.ts';

export interface IKeyValidator {
  isValid(providedKey: unknown, expectedKey: string): boolean;
}

export class AuthenticateAdminUseCase {
  constructor(
    private readonly adminStore: IAdminStore,
    private readonly broadcaster: IBroadcaster,
    private readonly keyValidator: IKeyValidator,
    private readonly expectedAdminKey: string,
    private readonly logger: ILogger
  ) {}

  public async execute(params: {
    session: SocketSession;
    pseudo: unknown;
    providedKey: unknown;
  }): Promise<{ ok: boolean }> {
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
