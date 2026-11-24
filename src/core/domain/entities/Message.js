/**
 * @file src/core/domain/entities/Message.js
 * @description Value Object et validation des messages relayés dans le protocole d'enchères temps réel.
 */

export class Message {
  static TYPE_PATTERN = /^[a-zA-Z0-9_]{1,40}$/;

  /**
   * @param {string} type
   * @param {Record<string, any>} msg
   * @param {string} name
   * @param {string} from
   */
  constructor(type, msg, name, from) {
    this.type = type;
    this.msg = msg;
    this.name = name;
    this.from = from;
  }

  /**
   * @param {{ rawType: unknown, rawMsg: unknown, rawName: unknown, verifiedFrom: string, fallbackName?: string }} params
   * @returns {Message | null}
   */
  static create(params) {
    if (typeof params.rawType !== 'string' || !Message.TYPE_PATTERN.test(params.rawType)) {
      return null;
    }

    if (!params.verifiedFrom || typeof params.verifiedFrom !== 'string') {
      return null;
    }

    let sanitizedMsg;
    if (typeof params.rawMsg === 'object' && params.rawMsg !== null) {
      sanitizedMsg = params.rawMsg;
    } else {
      sanitizedMsg = { value: params.rawMsg };
    }

    let sanitizedName = params.fallbackName || 'Anonyme';
    if (typeof params.rawName === 'string' && params.rawName.trim().length > 0) {
      sanitizedName = params.rawName.trim().slice(0, 100);
    }

    return new Message(
      params.rawType,
      sanitizedMsg,
      sanitizedName,
      params.verifiedFrom
    );
  }

  toPayload() {
    return {
      type: this.type,
      msg: this.msg,
      name: this.name,
      from: this.from,
    };
  }
}
