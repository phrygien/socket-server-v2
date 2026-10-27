/**
 * @file src/core/infrastructure/security/TimingSafeKeyValidator.ts
 * @description Implémentation du validateur de clé en temps constant avec hachage SHA-256.
 */

import crypto from 'node:crypto';
import { IKeyValidator } from '../../application/use-cases/AuthenticateAdminUseCase.ts';

export class TimingSafeKeyValidator implements IKeyValidator {
  public isValid(providedKey: unknown, expectedKey: string): boolean {
    if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') {
      return false;
    }
    const hashProvided = crypto.createHash('sha256').update(providedKey).digest();
    const hashExpected = crypto.createHash('sha256').update(expectedKey).digest();
    return crypto.timingSafeEqual(hashProvided, hashExpected);
  }
}
