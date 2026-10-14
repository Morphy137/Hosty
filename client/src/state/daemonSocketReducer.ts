import type {
  DaemonErrorPayload,
  DaemonMessage,
  DaemonMessageType,
  Metrics,
  PlayerState,
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
  logs: string[];
  provisionLogs: string[];
  lastError: DaemonErrorPayload | null;
}

export type DaemonSocketEvent =
  | { kind: 'message'; message: DaemonMessage }
  | { kind: 'clearError' }
  | { kind: 'resetProvisionLogs'; lines: string[] };

export const INITIAL_DAEMON_SOCKET_STATE: DaemonSocketState = {
  status: 'OFFLINE',
  metrics: { cpu: 0, ramMb: 0, maxRamMb: DEFAULT_MAX_RAM_MB, uptime: 0 },
  players: [],
  logs: [],
  provisionLogs: [],
  lastError: null
};

const KNOWN_MESSAGE_TYPES: ReadonlySet<DaemonMessageType> = new Set([
  'STATUS',
  'METRICS',
  'PLAYERS',
  'CONSOLE',
  'PROVISION_LOG',
  'ERROR',
  'INSTANCE_STATUS'
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
    case 'ERROR':
      return { ...state, lastError: message.payload };
    case 'INSTANCE_STATUS':
      return state;
  }
}

export function daemonSocketReducer(state: DaemonSocketState, event: DaemonSocketEvent): DaemonSocketState {
  switch (event.kind) {
    case 'message':
      return applyMessage(state, event.message);
    case 'clearError':
      return { ...state, lastError: null };
    case 'resetProvisionLogs':
      return { ...state, provisionLogs: event.lines.slice(-MAX_PROVISION_LOG_LINES) };
  }
}
