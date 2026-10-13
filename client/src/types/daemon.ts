export const SERVER_STATUSES = ['OFFLINE', 'STARTING', 'ONLINE', 'STOPPING'] as const;
export type ServerStatus = (typeof SERVER_STATUSES)[number];

export const SERVER_LOADERS = ['fabric', 'paper', 'vanilla'] as const;
export type ServerLoader = (typeof SERVER_LOADERS)[number];

export type DaemonAction = 'START' | 'STOP' | 'KILL' | 'COMMAND' | 'MOCK';

export interface PlayerState {
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export interface Metrics {
  cpu: number;
  ramMb: number;
  maxRamMb: number;
  uptime: number;
}

export type ConfigValue = string | number | boolean;
export type ConfigValueType = 'boolean' | 'number' | 'string';

/** A single editable key/value pair from server.properties or a mod config file. */
export interface ConfigEntry {
  key: string;
  value: ConfigValue;
  type: ConfigValueType;
}

export type ConfigPayload = Record<string, ConfigValue>;

export interface DaemonErrorPayload {
  code: string;
  message: string;
}

export interface HealthResponse {
  status: 'ok';
  mockEnabled: boolean;
  serverStatus: ServerStatus;
  activeInstance?: string;
}

export interface InstanceInfo {
  id: string;
  name: string;
  dir: string;
  port: number;
  motd: string;
  hasJar: boolean;
  isImported: boolean;
  createdAt: string;
}

export interface InstancesResponse {
  instances: InstanceInfo[];
  activeId: string;
}

export interface ModFileInfo {
  filename: string;
  originalName: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
  enabled: boolean;
  hasConfig: boolean;
}

export type DaemonMessage =
  | { type: 'STATUS'; payload: ServerStatus }
  | { type: 'METRICS'; payload: Metrics }
  | { type: 'PLAYERS'; payload: PlayerState[] }
  | { type: 'CONSOLE'; payload: string }
  | { type: 'PROVISION_LOG'; payload: string }
  | { type: 'ERROR'; payload: DaemonErrorPayload };

export type DaemonMessageType = DaemonMessage['type'];

export type SocketConnectionState = 'connecting' | 'open' | 'closed';
