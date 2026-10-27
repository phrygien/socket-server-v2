/**
 * @file src/core/domain/ports/ILogger.ts
 * @description Port pour la journalisation structurée du système.
 */

export interface ILogger {
  info(objOrMsg: any, msg?: string): void;
  warn(objOrMsg: any, msg?: string): void;
  error(objOrMsg: any, msg?: string): void;
  debug(objOrMsg: any, msg?: string): void;
}
