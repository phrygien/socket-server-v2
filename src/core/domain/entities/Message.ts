/**
 * @file src/core/domain/entities/Message.ts
 * @description Value Object et validation des messages relayés dans le protocole Auctav.
 */

export class Message {
  private static readonly TYPE_PATTERN = /^[a-zA-Z0-9_]{1,40}$/;

  private constructor(
    public readonly type: string,
    public readonly msg: Record<string, any>,
    public readonly name: string,
    public readonly from: string
  ) {}

  public static create(params: {
    rawType: unknown;
    rawMsg: unknown;
    rawName: unknown;
    verifiedFrom: string;
    fallbackName?: string;
  }): Message | null {
    if (typeof params.rawType !== 'string' || !Message.TYPE_PATTERN.test(params.rawType)) {
      return null;
    }

    if (!params.verifiedFrom || typeof params.verifiedFrom !== 'string') {
      return null;
    }

    // Normalisation de msg (doit être un objet)
    let sanitizedMsg: Record<string, any>;
    if (typeof params.rawMsg === 'object' && params.rawMsg !== null) {
      sanitizedMsg = params.rawMsg as Record<string, any>;
    } else {
      sanitizedMsg = { value: params.rawMsg };
    }

    // Normalisation du nom (tronqué à 100 caractères max)
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

  public toPayload() {
    return {
      type: this.type,
      msg: this.msg,
      name: this.name,
      from: this.from,
    };
  }
}
