/**
 * @file src/core/infrastructure/logging/PinoLogger.js
 * @description Adaptateur de journalisation structurée basé sur Pino.
 */

import pino from 'pino';

export class PinoLogger {
  /**
   * @param {string} [logLevel='info']
   * @param {boolean} [isDev=false]
   */
  constructor(logLevel = 'info', isDev = false) {
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

  info(objOrMsg, msg) {
    if (typeof objOrMsg === 'string') {
      this.logger.info(objOrMsg);
    } else {
      this.logger.info(objOrMsg, msg);
    }
  }

  warn(objOrMsg, msg) {
    if (typeof objOrMsg === 'string') {
      this.logger.warn(objOrMsg);
    } else {
      this.logger.warn(objOrMsg, msg);
    }
  }

  error(objOrMsg, msg) {
    if (typeof objOrMsg === 'string') {
      this.logger.error(objOrMsg);
    } else {
      this.logger.error(objOrMsg, msg);
    }
  }

  debug(objOrMsg, msg) {
    if (typeof objOrMsg === 'string') {
      this.logger.debug(objOrMsg);
    } else {
      this.logger.debug(objOrMsg, msg);
    }
  }

  getRawLogger() {
    return this.logger;
  }
}
