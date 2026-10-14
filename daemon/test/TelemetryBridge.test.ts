import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { TelemetryBridgeManager } from '../src/core/bridge/TelemetryBridgeManager';
import type { WebSocket } from 'ws';

class MockWebSocket extends EventEmitter {
  public readyState = 1; // OPEN
  public sentMessages: string[] = [];

  public send(msg: string): void {
    this.sentMessages.push(msg);
  }

  public close(): void {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
}

describe('TelemetryBridgeManager', () => {
  let tmpDir: string;
  let manager: TelemetryBridgeManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-bridge-test-'));
    manager = new TelemetryBridgeManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('manages bridge connection lifecycle with hello handshake and disconnection', () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    const connectedSpy = vi.fn();
    const disconnectedSpy = vi.fn();

    manager.on('bridge_connected', connectedSpy);
    manager.on('bridge_disconnected', disconnectedSpy);

    manager.handleConnection(ws);

    expect(manager.isBridgeConnected('server-1')).toBe(false);

    // Simulate BRIDGE_HELLO message
    (ws as unknown as MockWebSocket).emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'BRIDGE_HELLO',
          instanceId: 'server-1',
          loader: 'paper',
          version: '1.20.4'
        })
      )
    );

    expect(manager.isBridgeConnected('server-1')).toBe(true);
    expect(connectedSpy).toHaveBeenCalledWith('server-1', 'paper', '1.20.4');
    expect((ws as unknown as MockWebSocket).sentMessages).toContain(
      JSON.stringify({ type: 'HELLO_ACK', ok: true })
    );

    // Simulate close
    (ws as unknown as MockWebSocket).close();
    expect(manager.isBridgeConnected('server-1')).toBe(false);
    expect(disconnectedSpy).toHaveBeenCalledWith('server-1');
  });

  it('emits telemetry events on incoming TICK_TELEMETRY payloads', () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    const telemetrySpy = vi.fn();

    manager.on('telemetry', telemetrySpy);
    manager.handleConnection(ws);

    (ws as unknown as MockWebSocket).emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'BRIDGE_HELLO',
          instanceId: 'survival',
          loader: 'fabric'
        })
      )
    );

    const tickPayload = {
      type: 'TICK_TELEMETRY',
      instanceId: 'survival',
      server: {
        tps: 19.8,
        mspt: 14.2,
        loadedChunks: 800,
        entitiesCount: 250
      },
      players: [
        {
          username: 'MorphyCD',
          dimension: 'minecraft:the_nether',
          x: 100,
          y: 65,
          z: -50,
          health: 18,
          food: 20,
          ping: 25
        }
      ]
    };

    (ws as unknown as MockWebSocket).emit('message', Buffer.from(JSON.stringify(tickPayload)));

    expect(telemetrySpy).toHaveBeenCalledWith('survival', tickPayload.server, tickPayload.players);
  });

  it('sends action messages over bridge WebSocket', () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    manager.handleConnection(ws);

    (ws as unknown as MockWebSocket).emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'BRIDGE_HELLO',
          instanceId: 'server-alpha'
        })
      )
    );

    const sent = manager.sendAction('server-alpha', {
      action: 'HEAL',
      username: 'MorphyCD',
      amount: 20,
      feed: true
    });

    expect(sent).toBe(true);
    const lastMsg = JSON.parse(
      (ws as unknown as MockWebSocket).sentMessages[
        (ws as unknown as MockWebSocket).sentMessages.length - 1
      ]
    );
    expect(lastMsg.type).toBe('ACTION');
    expect(lastMsg.action).toBe('HEAL');
    expect(lastMsg.username).toBe('MorphyCD');
  });

  it('installs bridge jar into plugins for Paper or mods for Fabric', () => {
    const serverDir = path.join(tmpDir, 'paper-server');
    fs.mkdirSync(serverDir, { recursive: true });

    const installedPaper = manager.installBridge(serverDir, 'paper');
    expect(installedPaper).toBe(true);
    expect(fs.existsSync(path.join(serverDir, 'plugins', 'mc-nexus-bridge.jar'))).toBe(true);

    const fabricDir = path.join(tmpDir, 'fabric-server');
    fs.mkdirSync(fabricDir, { recursive: true });

    const installedFabric = manager.installBridge(fabricDir, 'fabric');
    expect(installedFabric).toBe(true);
    expect(fs.existsSync(path.join(fabricDir, 'mods', 'mc-nexus-bridge.jar'))).toBe(true);
  });

  it('emits inventory_data events when bridge responds with INVENTORY_DATA message', () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    const invSpy = vi.fn();
    manager.on('inventory_data', invSpy);
    manager.handleConnection(ws);

    (ws as unknown as MockWebSocket).emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'BRIDGE_HELLO',
          instanceId: 'server-beta'
        })
      )
    );

    const mockInvPayload = {
      type: 'INVENTORY_DATA',
      instanceId: 'server-beta',
      inventory: {
        username: 'MorphyCD',
        armor: [],
        offhand: null,
        hotbar: [],
        inventory: []
      }
    };

    (ws as unknown as MockWebSocket).emit('message', Buffer.from(JSON.stringify(mockInvPayload)));
    expect(invSpy).toHaveBeenCalledWith('server-beta', mockInvPayload.inventory);
  });

  it('sends FREEZE, UNFREEZE, and SMITE actions over bridge', () => {
    const ws = new MockWebSocket() as unknown as WebSocket;
    manager.handleConnection(ws);

    (ws as unknown as MockWebSocket).emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'BRIDGE_HELLO', instanceId: 'server-gamma' }))
    );

    const freezeSent = manager.sendAction('server-gamma', {
      action: 'FREEZE',
      username: 'TargetUser',
      frostEffect: true
    });
    expect(freezeSent).toBe(true);

    const smiteSent = manager.sendAction('server-gamma', {
      action: 'SMITE',
      username: 'TargetUser'
    });
    expect(smiteSent).toBe(true);
  });
});
