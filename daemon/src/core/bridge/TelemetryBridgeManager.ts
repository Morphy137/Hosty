import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../config/env';
import { DaemonError } from '../../errors';
import type {
  BridgeIncomingMessage,
  BridgeActionMessage,
  BridgeServerTelemetry,
  BridgePlayerTelemetry,
  InventorySlotItem,
  PlayerInventoryData
} from './BridgeProtocol';
import {
  BRIDGE_PROTOCOL_VERSION,
  isActionAdvertised,
  parseBridgeMessage,
  type ActionMessageV1,
  type CustomActionDeclaration,
  type HelloAckMessage,
  type HelloMessage,
  type InventoryMessage,
  type TelemetryMessage
} from './protocolV1';
import { readBridgeToken, tokensMatch } from './BridgeAuth';

export interface TelemetryBridgeEvents {
  bridge_connected: [instanceId: string, loader?: string, version?: string];
  bridge_disconnected: [instanceId: string];
  telemetry: [instanceId: string, server: BridgeServerTelemetry, players: BridgePlayerTelemetry[]];
  inventory_data: [instanceId: string, inventory: PlayerInventoryData];
  action_result: [instanceId: string, result: unknown];
  /** A bridge connection was refused (bad token, unsupported version, legacy client). */
  bridge_rejected: [instanceId: string | undefined, reason: string];
}

export interface BridgeSession {
  protocolVersion: number;
  implementation: { name: string; version: string };
  capabilities: string[];
  customActions: CustomActionDeclaration[];
}

type InstanceDirResolver = (instanceId: string) => string | null;

const asNumber = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const ARMOR_SLOTS = 4;
const HOTBAR_SLOTS = 9;
const MAIN_SLOTS = 27;

export class TelemetryBridgeManager extends EventEmitter<TelemetryBridgeEvents> {
  private readonly connections = new Map<string, WebSocket>();
  private readonly connectionInstances = new Map<WebSocket, string>();
  private readonly sessions = new Map<string, BridgeSession>();
  private readonly baseAssetsDir: string;
  private readonly bridgeJarPath: string;
  private resolveInstanceDir: InstanceDirResolver = () => null;
  private allowLegacy = false;

  constructor(assetsDir?: string) {
    super();
    this.baseAssetsDir = assetsDir || loadConfig().assetsDir;
    this.bridgeJarPath = path.join(this.baseAssetsDir, 'mc-nexus-bridge.jar');
  }

  /** Lets the manager find an instance folder to validate its bridge token. */
  public setInstanceDirResolver(resolver: InstanceDirResolver): void {
    this.resolveInstanceDir = resolver;
  }

  /** Accept pre-v1 `BRIDGE_HELLO` clients (no token). Off by default; for transitional setups only. */
  public setAllowLegacy(allow: boolean): void {
    this.allowLegacy = allow;
  }

  public isBridgeConnected(instanceId: string): boolean {
    const ws = this.connections.get(instanceId);
    return ws !== undefined && ws.readyState === 1; // 1 = OPEN
  }

  public getSession(instanceId: string): BridgeSession | undefined {
    return this.isBridgeConnected(instanceId) ? this.sessions.get(instanceId) : undefined;
  }

  public handleConnection(ws: WebSocket): void {
    ws.on('message', (raw) => {
      try {
        const json = JSON.parse(raw.toString()) as unknown;
        const boundInstance = this.connectionInstances.get(ws);

        if (!boundInstance) {
          this.handleFirstMessage(ws, json);
          return;
        }
        this.handleSessionMessage(boundInstance, json);
      } catch (err) {
        console.error('[TelemetryBridge] Error parsing bridge message:', err);
      }
    });

    const cleanup = () => {
      const instanceId = this.connectionInstances.get(ws);
      if (instanceId && this.connections.get(instanceId) === ws) {
        this.connections.delete(instanceId);
        this.sessions.delete(instanceId);
        this.connectionInstances.delete(ws);
        this.emit('bridge_disconnected', instanceId);
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  private reject(ws: WebSocket, instanceId: string | undefined, code: string, message: string): void {
    const ack: HelloAckMessage = { type: 'HELLO_ACK', ok: false, error: { code, message } };
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(ack));
      ws.close(1008, code);
    }
    this.emit('bridge_rejected', instanceId, `${code}: ${message}`);
  }

  private handleFirstMessage(ws: WebSocket, json: unknown): void {
    const legacy = json as Partial<Extract<BridgeIncomingMessage, { type: 'BRIDGE_HELLO' }>> | null;

    if (legacy && typeof legacy === 'object' && legacy.type === 'BRIDGE_HELLO') {
      if (!this.allowLegacy || typeof legacy.instanceId !== 'string') {
        this.reject(
          ws,
          typeof legacy.instanceId === 'string' ? legacy.instanceId : undefined,
          'UNAUTHORIZED',
          'This bridge version is outdated and cannot authenticate. Reinstall the bridge from the server panel.'
        );
        return;
      }
      // Transitional path (opt-in): same behaviour as before protocol v1, without capability negotiation.
      this.attach(ws, legacy.instanceId, {
        protocolVersion: 0,
        implementation: { name: `legacy-${legacy.loader ?? 'bridge'}`, version: legacy.version ?? '' },
        capabilities: LEGACY_CAPABILITIES,
        customActions: []
      });
      ws.send(JSON.stringify({ type: 'HELLO_ACK', ok: true, protocolVersion: 0 } satisfies HelloAckMessage));
      return;
    }

    const parsed = parseBridgeMessage(json);
    if (!parsed.ok || parsed.message.type !== 'HELLO') {
      this.reject(ws, undefined, 'INVALID_MESSAGE', 'The first message must be a valid HELLO.');
      return;
    }

    const hello: HelloMessage = parsed.message;
    if (hello.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
      this.reject(
        ws,
        hello.instanceId,
        'UNSUPPORTED_VERSION',
        `Protocol version ${hello.protocolVersion} is not supported (daemon speaks ${BRIDGE_PROTOCOL_VERSION}).`
      );
      return;
    }

    const instanceDir = this.resolveInstanceDir(hello.instanceId);
    const expected = instanceDir ? readBridgeToken(instanceDir) : null;
    if (!expected || !tokensMatch(expected, hello.token)) {
      this.reject(ws, hello.instanceId, 'UNAUTHORIZED', 'Invalid or missing bridge token.');
      return;
    }

    this.attach(ws, hello.instanceId, {
      protocolVersion: hello.protocolVersion,
      implementation: hello.implementation,
      capabilities: hello.capabilities,
      customActions: hello.customActions ?? []
    });
    const ack: HelloAckMessage = { type: 'HELLO_ACK', ok: true, protocolVersion: BRIDGE_PROTOCOL_VERSION };
    ws.send(JSON.stringify(ack));
  }

  private attach(ws: WebSocket, instanceId: string, session: BridgeSession): void {
    const previous = this.connections.get(instanceId);
    if (previous && previous !== ws) {
      this.connectionInstances.delete(previous);
      previous.close(1000, 'replaced');
    }
    this.connections.set(instanceId, ws);
    this.connectionInstances.set(ws, instanceId);
    this.sessions.set(instanceId, session);
    this.emit('bridge_connected', instanceId, session.implementation.name, session.implementation.version);
  }

  private handleSessionMessage(instanceId: string, json: unknown): void {
    const typed = json as { type?: string; server?: BridgeServerTelemetry; players?: BridgePlayerTelemetry[]; inventory?: PlayerInventoryData } | null;

    // Pre-v1 frames from an opt-in legacy bridge
    if (typed && typeof typed === 'object') {
      if (typed.type === 'TICK_TELEMETRY' && typed.server && Array.isArray(typed.players)) {
        this.emit('telemetry', instanceId, typed.server, typed.players);
        return;
      }
      if (typed.type === 'INVENTORY_DATA' && typed.inventory) {
        this.emit('inventory_data', instanceId, typed.inventory);
        return;
      }
      if (typed.type === 'ACTION_RESULT') {
        this.emit('action_result', instanceId, typed);
        return;
      }
    }

    const parsed = parseBridgeMessage(json);
    if (!parsed.ok) return;

    switch (parsed.message.type) {
      case 'TELEMETRY': {
        const { server, players } = toLegacyTelemetry(parsed.message);
        this.emit('telemetry', instanceId, server, players);
        break;
      }
      case 'INVENTORY':
        this.emit('inventory_data', instanceId, toLegacyInventory(parsed.message));
        break;
      case 'RESULT':
        this.emit('action_result', instanceId, parsed.message);
        break;
      default:
        break;
    }
  }

  /**
   * Sends an admin action. Returns false when no bridge is connected or the bridge did not advertise
   * the action, so the caller can fall back to console commands.
   */
  public sendAction(instanceId: string, action: Omit<BridgeActionMessage, 'type'>): boolean {
    const ws = this.connections.get(instanceId);
    const session = this.sessions.get(instanceId);
    if (!ws || ws.readyState !== 1 || !session) return false;

    const name = action.action.toLowerCase();
    if (!isActionAdvertised(session.capabilities, name, session.customActions)) return false;

    if (session.protocolVersion === 0) {
      const legacy: BridgeActionMessage = { type: 'ACTION', ...action };
      ws.send(JSON.stringify(legacy));
      return true;
    }

    const { action: _legacyName, username, actionId, ...params } = action;
    const message: ActionMessageV1 = {
      type: 'ACTION',
      actionId,
      action: name,
      target: { type: 'player', name: username },
      params
    };
    ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Copies the bridge artifact into the instance and returns the written file path.
   * `targets` (declared by the game) maps a loader to the folder and packaged file to use; `default`
   * is the fallback. Throws when the packaged artifact is missing (never writes a stub).
   */
  public installBridge(instanceDir: string, loader?: string, targets?: BridgeInstallTargets): string {
    const fallback = targets?.default ?? { dir: 'mods', asset: 'mc-nexus-bridge.jar' };
    let target = loader ? (targets?.[loader] ?? fallback) : fallback;
    if (!loader && targets) {
      // Imported servers may have no stored loader: prefer a target folder that already exists.
      const known = Object.values(targets);
      target = known.find((candidate) => fs.existsSync(path.join(instanceDir, candidate.dir)) && candidate !== fallback) ?? fallback;
      if (fs.existsSync(path.join(instanceDir, fallback.dir))) target = fallback;
    }

    const targetFolder = path.join(instanceDir, target.dir);
    fs.mkdirSync(targetFolder, { recursive: true });

    const targetFile = path.join(targetFolder, 'mc-nexus-bridge.jar');
    const specificPath = path.join(this.baseAssetsDir, target.asset);
    const source = [specificPath, this.bridgeJarPath].find((candidate) => fs.existsSync(candidate));
    if (!source) {
      throw new DaemonError('BRIDGE_ASSET_MISSING', 'The bridge file is missing from this Hosty installation.');
    }
    fs.copyFileSync(source, targetFile);
    return targetFile;
  }

  /** True when a bridge jar is present in any of the given folders (defaults to `mods`). */
  public static isBridgeInstalled(instanceDir: string, folders: string[] = ['mods']): boolean {
    return folders.some((folder) => fs.existsSync(path.join(instanceDir, folder, 'mc-nexus-bridge.jar')));
  }
}

export type BridgeInstallTargets = Record<string, { dir: string; asset: string }>;

const LEGACY_CAPABILITIES = [
  'telemetry.server',
  'telemetry.players',
  'inventory.view',
  'action.heal',
  'action.damage',
  'action.kill',
  'action.kick',
  'action.teleport',
  'action.freeze',
  'action.unfreeze',
  'action.smite',
  'action.give_exp',
  'action.mute',
  'action.unmute'
];

/** Adapts a generic v1 telemetry frame to the structures the supervisor already understands. */
export function toLegacyTelemetry(message: TelemetryMessage): {
  server: BridgeServerTelemetry;
  players: BridgePlayerTelemetry[];
} {
  const server: BridgeServerTelemetry = {
    tps: asNumber(message.server?.tps, 20),
    mspt: asNumber(message.server?.mspt),
    loadedChunks: asNumber(message.server?.loadedChunks),
    entitiesCount: asNumber(message.server?.entities)
  };

  const players: BridgePlayerTelemetry[] = (message.players ?? []).map((player) => {
    const stats = player.stats ?? {};
    return {
      uuid: player.id,
      username: player.name,
      dimension: player.position?.world ?? '',
      x: asNumber(player.position?.x),
      y: asNumber(player.position?.y),
      z: asNumber(player.position?.z),
      health: player.health,
      maxHealth: player.maxHealth,
      food: typeof stats.food === 'number' ? stats.food : undefined,
      ping: player.ping,
      gamemode: asString(stats.gamemode),
      isOp: asBoolean(stats.isOp),
      isFrozen: asBoolean(stats.isFrozen),
      isMuted: asBoolean(stats.isMuted)
    };
  });

  return { server, players };
}

/** Maps generic containers to the Minecraft-shaped inventory the current UI renders. */
export function toLegacyInventory(message: InventoryMessage): PlayerInventoryData {
  const containerSlots = (id: string): Array<InventorySlotItem | null> => {
    const container = message.containers.find((candidate) => candidate.id === id);
    if (!container) return [];
    return container.slots.map((slot) => {
      if (!slot) return null;
      const meta = (slot.meta ?? {}) as Record<string, unknown>;
      return {
        slot: slot.index,
        id: slot.itemId,
        count: slot.count,
        damage: typeof meta.damage === 'number' ? meta.damage : undefined,
        maxDamage: typeof meta.maxDamage === 'number' ? meta.maxDamage : undefined,
        customName: typeof meta.customName === 'string' ? meta.customName : undefined,
        enchantments: Array.isArray(meta.enchantments) ? (meta.enchantments as InventorySlotItem['enchantments']) : undefined
      };
    });
  };

  const pad = (items: Array<InventorySlotItem | null>, length: number) =>
    Array.from({ length }, (_unused, index) => items[index] ?? null);

  return {
    username: message.player.name,
    uuid: message.player.id,
    armor: pad(containerSlots('armor'), ARMOR_SLOTS),
    offhand: containerSlots('offhand')[0] ?? null,
    hotbar: pad(containerSlots('hotbar'), HOTBAR_SLOTS),
    inventory: pad(containerSlots('main'), MAIN_SLOTS)
  };
}

export const telemetryBridge = new TelemetryBridgeManager();
