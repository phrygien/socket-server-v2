/**
 * @file src/core/interfaces/controllers/HttpHealthController.js
 * @description Contrôleur HTTP pour les endpoints /health et /api/server-info.
 */

export class HttpHealthController {
  /**
   * @param {import('../../domain/ports/types.js').IBroadcaster} broadcaster
   * @param {import('../../domain/ports/types.js').IAdminStore} adminStore
   */
  constructor(broadcaster, adminStore) {
    this.broadcaster = broadcaster;
    this.adminStore = adminStore;
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  getHealth(req, res) {
    try {
      const activeRooms = this.broadcaster.getAllActiveRooms();
      res.status(200).json({
        status: 'ok',
        service: 'auctav-socket-server',
        version: '4.8.4-clean-arch',
        uptime: Math.floor(process.uptime()),
        connections: this.broadcaster.getTotalConnectionsCount(),
        rooms: activeRooms.length,
        storage: this.adminStore.type,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getServerInfo(req, res) {
    try {
      const activeRoomsNames = this.broadcaster.getAllActiveRooms();
      const roomsInfo = [];

      for (const roomName of activeRoomsNames) {
        const adminId = await this.adminStore.get(roomName);
        const count = this.broadcaster.getRoomSocketsCount(roomName);
        roomsInfo.push({
          name: roomName,
          count,
          admin: adminId,
        });
      }

      res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        connections: this.broadcaster.getTotalConnectionsCount(),
        rooms: roomsInfo,
        storage: this.adminStore.type,
        eio3Allowed: true,
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
}
