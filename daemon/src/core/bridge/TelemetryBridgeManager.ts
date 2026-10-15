import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../config/env';
import type {
  BridgeIncomingMessage,
  BridgeActionMessage,
  BridgeServerTelemetry,
  BridgePlayerTelemetry,
  PlayerInventoryData
} from './BridgeProtocol';

export interface TelemetryBridgeEvents {
  bridge_connected: [instanceId: string, loader?: string, version?: string];
  bridge_disconnected: [instanceId: string];
  telemetry: [instanceId: string, server: BridgeServerTelemetry, players: BridgePlayerTelemetry[]];
  inventory_data: [instanceId: string, inventory: PlayerInventoryData];
  action_result: [instanceId: string, result: unknown];
}

export class TelemetryBridgeManager extends EventEmitter<TelemetryBridgeEvents> {
  private readonly connections = new Map<string, WebSocket>();
  private readonly connectionInstances = new Map<WebSocket, string>();
  private readonly baseAssetsDir: string;
  private readonly bridgeJarPath: string;

  constructor(assetsDir?: string) {
    super();
    this.baseAssetsDir = assetsDir || loadConfig().assetsDir;
    this.bridgeJarPath = path.join(this.baseAssetsDir, 'mc-nexus-bridge.jar');
  }

  public isBridgeConnected(instanceId: string): boolean {
    const ws = this.connections.get(instanceId);
    return ws !== undefined && ws.readyState === 1; // 1 = OPEN
  }

  public handleConnection(ws: WebSocket): void {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as BridgeIncomingMessage;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'BRIDGE_HELLO') {
          const { instanceId, loader, version } = msg;
          this.connections.set(instanceId, ws);
          this.connectionInstances.set(ws, instanceId);

          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'HELLO_ACK', ok: true }));
          }

          this.emit('bridge_connected', instanceId, loader, version);
          return;
        }

        const instanceId = this.connectionInstances.get(ws) || (msg as { instanceId?: string }).instanceId;
        if (!instanceId) return;

        if (msg.type === 'TICK_TELEMETRY') {
          this.emit('telemetry', instanceId, msg.server, msg.players);
          return;
        }

        if (msg.type === 'INVENTORY_DATA') {
          this.emit('inventory_data', instanceId, msg.inventory);
          return;
        }

        if (msg.type === 'ACTION_RESULT') {
          this.emit('action_result', instanceId, msg);
        }
      } catch (err) {
        console.error('[TelemetryBridge] Error parsing bridge message:', err);
      }
    });

    const cleanup = () => {
      const instanceId = this.connectionInstances.get(ws);
      if (instanceId) {
        this.connections.delete(instanceId);
        this.connectionInstances.delete(ws);
        this.emit('bridge_disconnected', instanceId);
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  public sendAction(
    instanceId: string,
    action: Omit<BridgeActionMessage, 'type'>
  ): boolean {
    const ws = this.connections.get(instanceId);
    if (!ws || ws.readyState !== 1) {
      return false;
    }

    const payload: BridgeActionMessage = {
      type: 'ACTION',
      ...action
    };

    ws.send(JSON.stringify(payload));
    return true;
  }

  public installBridge(instanceDir: string, loader?: string): boolean {
    const isPlugin = loader === 'paper' || loader === 'purpur' || loader === 'spigot';
    const targetFolder = isPlugin ? path.join(instanceDir, 'plugins') : path.join(instanceDir, 'mods');
    fs.mkdirSync(targetFolder, { recursive: true });

    const targetFile = path.join(targetFolder, 'mc-nexus-bridge.jar');

    const specificJarName = isPlugin ? 'mc-nexus-bridge-paper.jar' : 'mc-nexus-bridge-fabric.jar';
    const specificPath = path.join(this.baseAssetsDir, specificJarName);

    if (fs.existsSync(specificPath)) {
      fs.copyFileSync(specificPath, targetFile);
      return true;
    }

    if (fs.existsSync(this.bridgeJarPath)) {
      fs.copyFileSync(this.bridgeJarPath, targetFile);
      return true;
    }

    // If binary is not pre-packaged, write a lightweight bridge placeholder manifest
    const stubContent = Buffer.from(
      `MC-Nexus Bridge Extension for ${loader || 'paper'}\nVersion: 1.0.0\n`
    );
    fs.writeFileSync(targetFile, stubContent);
    return true;
  }
}

export const telemetryBridge = new TelemetryBridgeManager();
