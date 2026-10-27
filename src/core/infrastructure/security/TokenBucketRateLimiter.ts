/**
 * @file src/core/infrastructure/security/TokenBucketRateLimiter.ts
 * @description Implémentation du limiteur de débit par Token Bucket (20 msg/s total, 5 doEncheres/s).
 */

import { IRateLimiter } from '../../domain/ports/IRateLimiter.ts';

export class TokenBucketRateLimiter implements IRateLimiter {
  private globalCapacity: number = 20;
  private globalTokens: number = 20;
  private bidCapacity: number = 5;
  private bidTokens: number = 5;
  private lastRefill: number = Date.now();

  private refill(): void {
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

  public tryConsume(type: string): boolean {
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
