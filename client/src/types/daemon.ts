export const SERVER_STATUSES = ['OFFLINE', 'STARTING', 'ONLINE', 'STOPPING'] as const;
export type ServerStatus = (typeof SERVER_STATUSES)[number];

export const SERVER_LOADERS = [
  'fabric',
  'paper',
  'purpur',
  'vanilla',
  'forge',
  'neoforge',
  'spigot'
] as const;
export type ServerLoader = (typeof SERVER_LOADERS)[number];

export interface LoaderInfo {
  id: ServerLoader;
  name: string;
  category: 'modded' | 'plugin' | 'vanilla';
  isAutomatic: boolean;
  officialUrl?: string;
}

export const LOADER_METADATA: Record<ServerLoader, LoaderInfo> = {
  fabric: {
    id: 'fabric',
    name: 'Fabric',
    category: 'modded',
    isAutomatic: true
  },
  paper: {
    id: 'paper',
    name: 'PaperMC',
    category: 'plugin',
    isAutomatic: true
  },
  purpur: {
    id: 'purpur',
    name: 'Purpur',
    category: 'plugin',
    isAutomatic: true
  },
  vanilla: {
    id: 'vanilla',
    name: 'Vanilla',
    category: 'vanilla',
    isAutomatic: true
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    category: 'modded',
    isAutomatic: false,
    officialUrl: 'https://files.minecraftforge.net/net/minecraftforge/forge/'
  },
  neoforge: {
    id: 'neoforge',
    name: 'NeoForge',
    category: 'modded',
    isAutomatic: false,
    officialUrl: 'https://neoforged.net/'
  },
  spigot: {
    id: 'spigot',
    name: 'SpigotMC',
    category: 'plugin',
    isAutomatic: false,
    officialUrl: 'https://www.spigotmc.org/wiki/buildtools/'
  }
};

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

export interface InstanceSettings {
  name?: string;
  motd?: string;
  port?: number;
  maxPlayers?: number;
  minRamMb?: number;
  maxRamMb?: number;
  jvmArgs?: string[];
  javaPath?: string;
  forceSaveOnStop?: boolean;
  autostart?: boolean;
  loader?: string;
  loaderVersion?: string;
}

export interface InstanceInfo {
  id: string;
  name: string;
  dir: string;
  port: number;
  motd: string;
  hasJar: boolean;
  hasIcon: boolean;
  isImported: boolean;
  createdAt: string;
  maxPlayers: number;
  minRamMb: number;
  maxRamMb: number;
  jvmArgs: string[];
  javaPath: string;
  forceSaveOnStop: boolean;
  autostart: boolean;
  status?: ServerStatus;
  onlinePlayersCount?: number;
  loader?: string;
  loaderVersion?: string;
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
  | { type: 'ERROR'; payload: DaemonErrorPayload }
  | { type: 'INSTANCE_STATUS'; payload: { instanceId: string; status: ServerStatus } };

export type DaemonMessageType = DaemonMessage['type'];

export type SocketConnectionState = 'connecting' | 'open' | 'closed';

