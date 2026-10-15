import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import {
  TelemetryBridgeManager,
  toLegacyInventory,
  toLegacyTelemetry
} from '../src/core/bridge/TelemetryBridgeManager';
import { ensureBridgeConfig, readBridgeToken } from '../src/core/bridge/BridgeAuth';
import { isActionAdvertised, parseBridgeMessage } from '../src/core/bridge/protocolV1';
import type { WebSocket } from 'ws';

class MockWebSocket extends EventEmitter {
  public readyState = 1; // OPEN
  public sentMessages: string[] = [];
  public closeCode: number | undefined;

  public send(msg: string): void {
    this.sentMessages.push(msg);
  }

  public close(code?: number): void {
    this.closeCode = code;
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  public last(): Record<string, unknown> {
    return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
  }
}

const frame = (ws: MockWebSocket, payload: unknown) => ws.emit('message', Buffer.from(JSON.stringify(payload)));

describe('TelemetryBridgeManager (protocol v1)', () => {
  let tmpDir: string;
  let instanceDir: string;
  let token: string;
  let manager: TelemetryBridgeManager;

  const hello = (overrides: Record<string, unknown> = {}) => ({
    type: 'HELLO',
    protocolVersion: 1,
    instanceId: 'survival',
    token,
    game: 'minecraft',
    implementation: { name: 'hosty-bridge-paper', version: '1.2.0' },
    capabilities: ['telemetry.server', 'telemetry.players', 'action.heal', 'inventory.view'],
    ...overrides
  });

  const connect = (): MockWebSocket => {
    const ws = new MockWebSocket();
    manager.handleConnection(ws as unknown as WebSocket);
    return ws;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-bridge-test-'));
    instanceDir = path.join(tmpDir, 'survival');
    fs.mkdirSync(instanceDir, { recursive: true });
    token = ensureBridgeConfig(instanceDir, 'survival', 'ws://127.0.0.1:4000/telemetry/bridge').token;

    manager = new TelemetryBridgeManager(tmpDir);
    manager.setInstanceDirResolver((id) => (id === 'survival' ? instanceDir : null));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('authenticates HELLO with the per-instance token and acknowledges the version', () => {
    const connected = vi.fn();
    const disconnected = vi.fn();
    manager.on('bridge_connected', connected);
    manager.on('bridge_disconnected', disconnected);

    const ws = connect();
    frame(ws, hello());

    expect(manager.isBridgeConnected('survival')).toBe(true);
    expect(connected).toHaveBeenCalledWith('survival', 'hosty-bridge-paper', '1.2.0');
    expect(ws.last()).toEqual({ type: 'HELLO_ACK', ok: true, protocolVersion: 1 });
    expect(manager.getSession('survival')?.capabilities).toContain('action.heal');

    ws.close();
    expect(manager.isBridgeConnected('survival')).toBe(false);
    expect(disconnected).toHaveBeenCalledWith('survival');
  });

  it('rejects wrong tokens, unknown instances and unsupported versions', () => {
    const rejected = vi.fn();
    manager.on('bridge_rejected', rejected);

    const badToken = connect();
    frame(badToken, hello({ token: 'x'.repeat(64) }));
    expect(badToken.last()).toMatchObject({ type: 'HELLO_ACK', ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(badToken.closeCode).toBe(1008);

    const unknown = connect();
    frame(unknown, hello({ instanceId: 'ghost' }));
    expect(unknown.last()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });

    const future = connect();
    frame(future, hello({ protocolVersion: 2 }));
    expect(future.last()).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_VERSION' } });

    expect(manager.isBridgeConnected('survival')).toBe(false);
    expect(rejected).toHaveBeenCalledTimes(3);
  });

  it('refuses legacy unauthenticated BRIDGE_HELLO unless explicitly allowed', () => {
    const legacy = connect();
    frame(legacy, { type: 'BRIDGE_HELLO', instanceId: 'survival', loader: 'paper' });
    expect(legacy.last()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(manager.isBridgeConnected('survival')).toBe(false);

    manager.setAllowLegacy(true);
    const allowed = connect();
    frame(allowed, { type: 'BRIDGE_HELLO', instanceId: 'survival', loader: 'paper', version: '1.20.4' });
    expect(manager.isBridgeConnected('survival')).toBe(true);
    expect(manager.getSession('survival')?.protocolVersion).toBe(0);
  });

  it('normalizes generic telemetry and inventory into the shapes the supervisor uses', () => {
    const telemetry = vi.fn();
    const inventory = vi.fn();
    manager.on('telemetry', telemetry);
    manager.on('inventory_data', inventory);

    const ws = connect();
    frame(ws, hello());
    frame(ws, {
      type: 'TELEMETRY',
      server: { tps: 19.5, mspt: 12, loadedChunks: 400, entities: 90 },
      players: [
        {
          id: 'u-1',
          name: 'Morphy',
          ping: 31,
          health: 18,
          position: { x: 1, y: 64, z: -3, world: 'minecraft:the_nether' },
          stats: { food: 17, gamemode: 'creative', isOp: true }
        }
      ]
    });

    expect(telemetry).toHaveBeenCalledWith(
      'survival',
      { tps: 19.5, mspt: 12, loadedChunks: 400, entitiesCount: 90 },
      [expect.objectContaining({ username: 'Morphy', dimension: 'minecraft:the_nether', food: 17, gamemode: 'creative', isOp: true })]
    );

    frame(ws, {
      type: 'INVENTORY',
      player: { name: 'Morphy' },
      containers: [
        { id: 'hotbar', slots: [{ index: 0, itemId: 'minecraft:stone', count: 3 }, null] },
        { id: 'offhand', slots: [{ index: 40, itemId: 'minecraft:shield', count: 1 }] }
      ]
    });
    const data = inventory.mock.calls[0][1];
    expect(data.hotbar[0]).toMatchObject({ id: 'minecraft:stone', count: 3 });
    expect(data.hotbar).toHaveLength(9);
    expect(data.offhand).toMatchObject({ id: 'minecraft:shield' });
    expect(data.armor).toHaveLength(4);
  });

  it('only sends actions the bridge advertised, in the v1 envelope', () => {
    const ws = connect();
    frame(ws, hello());

    expect(manager.sendAction('survival', { action: 'HEAL', username: 'Morphy', amount: 10, feed: true })).toBe(true);
    expect(ws.last()).toMatchObject({
      type: 'ACTION',
      action: 'heal',
      target: { type: 'player', name: 'Morphy' },
      params: { amount: 10, feed: true }
    });

    // `smite` was not advertised: the caller must fall back to console commands.
    expect(manager.sendAction('survival', { action: 'SMITE', username: 'Morphy' })).toBe(false);
  });

  it('accepts custom actions declared in HELLO', () => {
    const ws = connect();
    frame(ws, hello({ customActions: [{ id: 'spawn_boss', label: 'Spawn boss' }] }));
    expect(
      isActionAdvertised(manager.getSession('survival')!.capabilities, 'spawn_boss', manager.getSession('survival')!.customActions)
    ).toBe(true);
  });

  it('installs bridge jar into plugins for Paper or mods for Fabric', () => {
    const serverDir = path.join(tmpDir, 'paper-server');
    fs.mkdirSync(serverDir, { recursive: true });
    expect(manager.installBridge(serverDir, 'paper')).toBe(true);
    expect(fs.existsSync(path.join(serverDir, 'plugins', 'mc-nexus-bridge.jar'))).toBe(true);

    const fabricDir = path.join(tmpDir, 'fabric-server');
    fs.mkdirSync(fabricDir, { recursive: true });
    expect(manager.installBridge(fabricDir, 'fabric')).toBe(true);
    expect(fs.existsSync(path.join(fabricDir, 'mods', 'mc-nexus-bridge.jar'))).toBe(true);
  });

  it('installs loader-specific jar when present in assets directory', () => {
    const target = path.join(tmpDir, 'test-instance');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'mc-nexus-bridge-fabric.jar'), 'fabric-bytes');
    fs.writeFileSync(path.join(tmpDir, 'mc-nexus-bridge-paper.jar'), 'paper-bytes');

    manager.installBridge(target, 'fabric');
    expect(fs.readFileSync(path.join(target, 'mods', 'mc-nexus-bridge.jar'), 'utf8')).toBe('fabric-bytes');
    manager.installBridge(target, 'paper');
    expect(fs.readFileSync(path.join(target, 'plugins', 'mc-nexus-bridge.jar'), 'utf8')).toBe('paper-bytes');
  });
});

describe('bridge auth config', () => {
  it('keeps the token stable but refreshes the URL when the daemon port changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-auth-'));
    try {
      const first = ensureBridgeConfig(dir, 'a', 'ws://127.0.0.1:4000/telemetry/bridge');
      const second = ensureBridgeConfig(dir, 'a', 'ws://127.0.0.1:50985/telemetry/bridge');
      expect(second.token).toBe(first.token);
      expect(second.url).toContain('50985');
      expect(readBridgeToken(dir)).toBe(first.token);
      expect(first.token).toHaveLength(64);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('protocol validation', () => {
  it('rejects malformed frames with a reason', () => {
    expect(parseBridgeMessage(null).ok).toBe(false);
    expect(parseBridgeMessage({ type: 'HELLO' }).ok).toBe(false);
    expect(parseBridgeMessage({ type: 'TELEMETRY', players: [{ noName: true }] }).ok).toBe(false);
    expect(parseBridgeMessage({ type: 'WAT' }).ok).toBe(false);
    expect(toLegacyTelemetry({ type: 'TELEMETRY' }).server.tps).toBe(20);
    expect(toLegacyInventory({ type: 'INVENTORY', player: { name: 'x' }, containers: [] }).hotbar).toHaveLength(9);
  });
});
