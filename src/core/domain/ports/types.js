/**
 * @file src/core/domain/ports/types.js
 * @description Contrats d'interfaces (Ports Hexagonaux) documentés via JSDoc pour JavaScript ESM.
 */

/**
 * @typedef {Object} IAdminStore
 * @property {'memory' | 'redis'} type
 * @property {(room: string) => Promise<string | null>} get
 * @property {(room: string, socketId: string) => Promise<void>} set
 * @property {(room: string) => Promise<void>} delete
 * @property {(socketId: string) => Promise<string[]>} getRoomsBySocketId
 * @property {(socketId: string) => Promise<boolean>} isAdminSocket
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {Object} UserListPayload
 * @property {string | null} admin
 * @property {number} count
 */

/**
 * @typedef {Object} IBroadcaster
 * @property {(room: string, event: string, payload: any) => void} broadcastToRoom
 * @property {(socketId: string, event: string, payload: any) => void} sendToSocket
 * @property {(room: string, payload: UserListPayload, targetSocketId?: string | null) => void} broadcastUserList
 * @property {(room: string) => number} getRoomSocketsCount
 * @property {() => number} getTotalConnectionsCount
 * @property {() => string[]} getAllActiveRooms
 */

/**
 * @typedef {Object} ILogger
 * @property {(objOrMsg: any, msg?: string) => void} info
 * @property {(objOrMsg: any, msg?: string) => void} warn
 * @property {(objOrMsg: any, msg?: string) => void} error
 * @property {(objOrMsg: any, msg?: string) => void} debug
 */

/**
 * @typedef {Object} IRateLimiter
 * @property {(type: string) => boolean} tryConsume
 */

/**
 * @typedef {Object} IKeyValidator
 * @property {(providedKey: unknown, expectedKey: string) => boolean} isValid
 */

export {};
