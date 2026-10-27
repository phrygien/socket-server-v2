/**
 * @file src/core/interfaces/controllers/HttpHealthController.ts
 * @description Contrôleur HTTP pour les endpoints /health et /api/server-info.
 */

import { Request, Response } from 'express';
import { IBroadcaster } from '../../domain/ports/IBroadcaster.ts';
import { IAdminStore } from '../../domain/ports/IAdminStore.ts';

export class HttpHealthController {
  constructor(
    private readonly broadcaster: IBroadcaster,
    private readonly adminStore: IAdminStore
  ) {}

  public getHealth(req: Request, res: Response): void {
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
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }

  public async getServerInfo(req: Request, res: Response): Promise<void> {
    try {
      const activeRoomsNames = this.broadcaster.getAllActiveRooms();
      const roomsInfo: Array<{ name: string; count: number; admin: string | null }> = [];

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
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
}
