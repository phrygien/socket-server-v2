/**
 * @file src/core/infrastructure/security/TimingSafeKeyValidator.js
 * @description Implémentation du validateur de clé en temps constant avec hachage SHA-256.
 */

import crypto from 'node:crypto';

export class TimingSafeKeyValidator {
  /**
   * @param {unknown} providedKey
   * @param {string} expectedKey
   * @returns {boolean}
   */
  isValid(providedKey, expectedKey) {
    if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') {
      return false;
    }
    const hashProvided = crypto.createHash('sha256').update(providedKey).digest();
    const hashExpected = crypto.createHash('sha256').update(expectedKey).digest();
    return crypto.timingSafeEqual(hashProvided, hashExpected);
  }
}
