import type {
  DaemonErrorPayload,
  DaemonMessage,
  DaemonMessageType,
  Metrics,
  PlayerInventoryData,
  PlayerState,
  ProvisionJobState,
  ServerStatus
} from '../types/daemon';
import { SERVER_STATUSES } from '../types/daemon';

export const MAX_CONSOLE_LINES = 1000;
export const MAX_PROVISION_LOG_LINES = 500;
const DEFAULT_MAX_RAM_MB = 4096;

export interface DaemonSocketState {
  status: ServerStatus;
  metrics: Metrics;
  players: PlayerState[];
  inventory: PlayerInventoryData | null;
  logs: string[];
  provisionLogs: string[];
  /** Latest installation job reported by the daemon (progress, phase, outcome). */
  provisionJob: ProvisionJobState | null;
  /** Latest status pushed by the daemon for each instance id. */
  instanceStatuses: Record<string, ServerStatus>;
  lastError: DaemonErrorPayload | null;
}

export type DaemonSocketEvent =
  | { kind: 'message'; message: DaemonMessage }
  | { kind: 'clearError' }
  | { kind: 'clearInventory' }
  | { kind: 'resetProvisionLogs'; lines: string[] }
  /** The viewed server changed: drop everything that belonged to the previous one. */
  | { kind: 'resetInstanceView'; lines: string[]; status: ServerStatus; keepLive?: boolean };

export const INITIAL_DAEMON_SOCKET_STATE: DaemonSocketState = {
  status: 'OFFLINE',
  metrics: { cpu: 0, ramMb: 0, maxRamMb: DEFAULT_MAX_RAM_MB, uptime: 0 },
  players: [],
  inventory: null,
  logs: [],
  provisionLogs: [],
  provisionJob: null,
  instanceStatuses: {},
  lastError: null
};

const KNOWN_MESSAGE_TYPES: ReadonlySet<DaemonMessageType> = new Set([
  'STATUS',
  'METRICS',
  'PLAYERS',
  'CONSOLE',
  'PROVISION_LOG',
  'PROVISION_PROGRESS',
  'ERROR',
  'INSTANCE_STATUS',
  'INVENTORY_DATA'
]);

/** Appends a line and drops the oldest entries so the buffer never exceeds `cap`. */
export function appendCapped(buffer: string[], line: string, cap: number): string[] {
  const next = [...buffer, line];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

function isServerStatus(value: unknown): value is ServerStatus {
  return typeof value === 'string' && (SERVER_STATUSES as readonly string[]).includes(value);
}

/** Parses a raw WebSocket frame; returns null for malformed or unknown messages. */
export function parseDaemonMessage(raw: string): DaemonMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { type } = parsed as { type?: unknown };
  if (typeof type !== 'string' || !KNOWN_MESSAGE_TYPES.has(type as DaemonMessageType)) return null;
  return parsed as DaemonMessage;
}

function applyMessage(state: DaemonSocketState, message: DaemonMessage): DaemonSocketState {
  switch (message.type) {
    case 'STATUS':
      return isServerStatus(message.payload) ? { ...state, status: message.payload } : state;
    case 'METRICS':
      return { ...state, metrics: message.payload };
    case 'PLAYERS':
      return { ...state, players: Array.isArray(message.payload) ? message.payload : [] };
    case 'CONSOLE':
      return { ...state, logs: appendCapped(state.logs, message.payload, MAX_CONSOLE_LINES) };
    case 'PROVISION_LOG':
      return {
        ...state,
        provisionLogs: appendCapped(state.provisionLogs, message.payload, MAX_PROVISION_LOG_LINES)
      };
    case 'PROVISION_PROGRESS':
      return { ...state, provisionJob: message.payload };
    case 'ERROR':
      return { ...state, lastError: message.payload };
    case 'INSTANCE_STATUS':
      return isServerStatus(message.payload.status)
        ? { ...state, instanceStatuses: { ...state.instanceStatuses, [message.payload.instanceId]: message.payload.status } }
        : state;
    case 'INVENTORY_DATA':
      return { ...state, inventory: message.payload };
  }
}

export function daemonSocketReducer(state: DaemonSocketState, event: DaemonSocketEvent): DaemonSocketState {
  switch (event.kind) {
    case 'message':
      return applyMessage(state, event.message);
    case 'clearError':
      return { ...state, lastError: null };
    case 'clearInventory':
      return { ...state, inventory: null };
    case 'resetInstanceView':
      return {
        ...state,
        logs: event.lines.slice(-MAX_CONSOLE_LINES),
        status: event.status,
        // On the first view the socket already delivered this server's live data; only a switch clears it.
        metrics: event.keepLive ? state.metrics : INITIAL_DAEMON_SOCKET_STATE.metrics,
        players: event.keepLive ? state.players : [],
        inventory: null,
        lastError: null
      };
    case 'resetProvisionLogs':
      return { ...state, provisionLogs: event.lines.slice(-MAX_PROVISION_LOG_LINES), provisionJob: null };
  }
}
