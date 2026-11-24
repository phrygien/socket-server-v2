/**
 * @file src/core/infrastructure/security/TokenBucketRateLimiter.js
 * @description Implémentation du limiteur de débit par Token Bucket (20 msg/s total, 5 doEncheres/s).
 */

export class TokenBucketRateLimiter {
  constructor() {
    this.globalCapacity = 20;
    this.globalTokens = 20;
    this.bidCapacity = 5;
    this.bidTokens = 5;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.globalTokens = Math.min(
        this.globalCapacity,
        this.globalTokens + elapsedSeconds * this.globalCapacity
      );
      this.bidTokens = Math.min(
        this.bidCapacity,
        this.bidTokens + elapsedSeconds * this.bidCapacity
      );
      this.lastRefill = now;
    }
  }

  /**
   * @param {string} type
   * @returns {boolean}
   */
  tryConsume(type) {
    this.refill();

    if (this.globalTokens < 1) {
      return false;
    }

    if (type === 'doEncheres') {
      if (this.bidTokens < 1) {
        return false;
      }
      this.bidTokens -= 1;
    }

    this.globalTokens -= 1;
    return true;
  }
}
