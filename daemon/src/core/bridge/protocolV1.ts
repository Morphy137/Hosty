/**
 * Hosty bridge protocol, version 1.
 * Canonical spec: docs/bridge-protocol.md. JSON Schemas and the CLI tester live in packages/bridge-protocol.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/** Names of the standard player actions; a bridge may also declare `customActions`. */
export const STANDARD_ACTIONS = [
  'heal',
  'damage',
  'kill',
  'kick',
  'teleport',
  'freeze',
  'unfreeze',
  'smite',
  'give_exp',
  'mute',
  'unmute',
  'inventory_view'
] as const;
export type StandardAction = (typeof STANDARD_ACTIONS)[number];

/** Capability string a bridge advertises for an action (`inventory_view` -> `inventory.view`). */
export const capabilityForAction = (action: string): string =>
  action === 'inventory_view' ? 'inventory.view' : `action.${action}`;

export interface BridgeImplementation {
  name: string;
  version: string;
}

export interface CustomActionDeclaration {
  id: string;
  /** Language map or plain text used as the button label. */
  label: string | Record<string, string>;
  /** Parameters the UI should collect before sending the action. */
  params?: Array<{ id: string; type: 'string' | 'number' | 'boolean'; label?: string | Record<string, string> }>;
}

export interface HelloMessage {
  type: 'HELLO';
  protocolVersion: number;
  instanceId: string;
  token: string;
  game: string;
  implementation: BridgeImplementation;
  capabilities: string[];
  customActions?: CustomActionDeclaration[];
}

export interface HelloAckMessage {
  type: 'HELLO_ACK';
  ok: boolean;
  protocolVersion?: number;
  /** Present when `ok` is false: `UNSUPPORTED_VERSION`, `UNAUTHORIZED`, `INVALID_MESSAGE`. */
  error?: { code: string; message: string };
}

export interface GenericPosition {
  x: number;
  y: number;
  z: number;
  /** World / dimension / map identifier. */
  world?: string;
}

export interface GenericPlayer {
  id?: string;
  name: string;
  ping?: number;
  health?: number;
  maxHealth?: number;
  position?: GenericPosition;
  /** Free-form per-game values (food, gamemode, isOp, ...). */
  stats?: Record<string, string | number | boolean>;
}

export interface TelemetryMessage {
  type: 'TELEMETRY';
  server?: {
    tps?: number;
    mspt?: number;
    loadedChunks?: number;
    entities?: number;
    stats?: Record<string, string | number | boolean>;
  };
  players?: GenericPlayer[];
}

export interface InventorySlotV1 {
  index: number;
  itemId: string;
  count: number;
  /** Optional absolute or data URL of an icon; clients fall back to a generic image. */
  icon?: string;
  meta?: Record<string, unknown>;
}

export interface InventoryContainerV1 {
  /** Semantic role the UI may map to a layout (`armor`, `hotbar`, `main`, `offhand`, ...). */
  id: string;
  label?: string;
  slots: Array<InventorySlotV1 | null>;
}

export interface InventoryMessage {
  type: 'INVENTORY';
  player: { id?: string; name: string };
  containers: InventoryContainerV1[];
}

export interface ResultMessage {
  type: 'RESULT';
  actionId?: string;
  success: boolean;
  message?: string;
  data?: unknown;
}

export type BridgeV1Message = HelloMessage | TelemetryMessage | InventoryMessage | ResultMessage;

export interface ActionMessageV1 {
  type: 'ACTION';
  actionId?: string;
  /** Standard action name or the id of a declared custom action. */
  action: string;
  target?: { type: 'player'; name: string };
  params?: Record<string, unknown>;
}

export type ParseResult =
  | { ok: true; message: BridgeV1Message }
  | { ok: false; code: 'INVALID_MESSAGE'; message: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const fail = (message: string): ParseResult => ({ ok: false, code: 'INVALID_MESSAGE', message });

/** Structural validation of an incoming bridge frame (never trusts its shape). */
export function parseBridgeMessage(raw: unknown): ParseResult {
  if (!isObject(raw) || typeof raw.type !== 'string') return fail('Message must be an object with a string "type"');

  switch (raw.type) {
    case 'HELLO': {
      if (!Number.isInteger(raw.protocolVersion)) return fail('HELLO.protocolVersion must be an integer');
      if (typeof raw.instanceId !== 'string' || raw.instanceId === '') return fail('HELLO.instanceId is required');
      if (typeof raw.token !== 'string') return fail('HELLO.token is required');
      if (typeof raw.game !== 'string') return fail('HELLO.game is required');
      if (
        !isObject(raw.implementation) ||
        typeof raw.implementation.name !== 'string' ||
        typeof raw.implementation.version !== 'string'
      ) {
        return fail('HELLO.implementation must be { name, version }');
      }
      if (!isStringArray(raw.capabilities)) return fail('HELLO.capabilities must be a list of strings');
      return { ok: true, message: raw as unknown as HelloMessage };
    }

    case 'TELEMETRY': {
      if (raw.players !== undefined) {
        if (!Array.isArray(raw.players) || !raw.players.every((p) => isObject(p) && typeof p.name === 'string')) {
          return fail('TELEMETRY.players must be a list of objects with a "name"');
        }
      }
      if (raw.server !== undefined && !isObject(raw.server)) return fail('TELEMETRY.server must be an object');
      return { ok: true, message: raw as unknown as TelemetryMessage };
    }

    case 'INVENTORY': {
      if (!isObject(raw.player) || typeof raw.player.name !== 'string') return fail('INVENTORY.player.name is required');
      if (!Array.isArray(raw.containers) || !raw.containers.every((c) => isObject(c) && typeof c.id === 'string' && Array.isArray(c.slots))) {
        return fail('INVENTORY.containers must be a list of { id, slots }');
      }
      return { ok: true, message: raw as unknown as InventoryMessage };
    }

    case 'RESULT': {
      if (typeof raw.success !== 'boolean') return fail('RESULT.success must be a boolean');
      return { ok: true, message: raw as unknown as ResultMessage };
    }

    default:
      return fail(`Unknown message type "${raw.type}"`);
  }
}

/** Server-side capability check: may the daemon send this action to a bridge that advertised `capabilities`? */
export function isActionAdvertised(
  capabilities: readonly string[],
  action: string,
  customActions: readonly CustomActionDeclaration[] = []
): boolean {
  if (customActions.some((custom) => custom.id === action)) return true;
  return capabilities.includes(capabilityForAction(action));
}
