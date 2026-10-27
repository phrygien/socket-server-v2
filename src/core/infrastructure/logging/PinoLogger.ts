/**
 * @file src/core/infrastructure/logging/PinoLogger.ts
 * @description Adaptateur de journalisation structurée basé sur Pino.
 */

import pino from 'pino';
import { ILogger } from '../../domain/ports/ILogger.ts';

export class PinoLogger implements ILogger {
  private readonly logger: pino.Logger;

  constructor(logLevel: string = 'info', isDev: boolean = false) {
    this.logger = pino({
      level: logLevel,
      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
    });
  }

  public info(objOrMsg: any, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.info(objOrMsg);
    } else {
      this.logger.info(objOrMsg, msg);
    }
  }

  public warn(objOrMsg: any, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.warn(objOrMsg);
    } else {
      this.logger.warn(objOrMsg, msg);
    }
  }

  public error(objOrMsg: any, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.error(objOrMsg);
    } else {
      this.logger.error(objOrMsg, msg);
    }
  }

  public debug(objOrMsg: any, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.debug(objOrMsg);
    } else {
      this.logger.debug(objOrMsg, msg);
    }
  }

  public getRawLogger(): pino.Logger {
    return this.logger;
  }
}
