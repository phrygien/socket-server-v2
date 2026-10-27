/**
 * @file src/core/domain/ports/IRateLimiter.ts
 * @description Port de limitation de débit par socket.
 */

export interface IRateLimiter {
  tryConsume(type: string): boolean;
}
