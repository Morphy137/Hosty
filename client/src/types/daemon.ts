export const SERVER_STATUSES = ['OFFLINE', 'STARTING', 'ONLINE', 'STOPPING'] as const;
export type ServerStatus = (typeof SERVER_STATUSES)[number];

export type DaemonAction = 'START' | 'STOP' | 'KILL' | 'COMMAND' | 'MOCK' | 'PLAYER_ACTION' | 'INVENTORY_VIEW';

export interface PlayerState {
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  uuid?: string;
  health?: number;
  maxHealth?: number;
  food?: number;
  ping?: number;
  gamemode?: string;
  isOp?: boolean;
  isFrozen?: boolean;
  isMuted?: boolean;
}

export interface InventorySlotItem {
  slot: number;
  id: string; // e.g. "minecraft:netherite_sword", "create:wrench"
  count: number;
  damage?: number;
  maxDamage?: number;
  customName?: string;
  enchantments?: Array<{ id: string; level: number }>;
}

export interface PlayerInventoryData {
  username: string;
  uuid?: string;
  armor: (InventorySlotItem | null)[];
  offhand: InventorySlotItem | null;
  hotbar: (InventorySlotItem | null)[];
  inventory: (InventorySlotItem | null)[];
}

export interface Metrics {
  cpu: number;
  ramMb: number;
  maxRamMb: number;
  uptime: number;
  tps?: number;
  mspt?: number;
  loadedChunks?: number;
  entitiesCount?: number;
  bridgeConnected?: boolean;
  bridgeInstalled?: boolean;
  bridgeSupported?: boolean;
  /** Capabilities advertised by the connected bridge (`action.heal`, `inventory.view`, ...). */
  bridgeCapabilities?: string[];
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
  autoRestart?: boolean;
  scheduledRestartHours?: number;
  backupsKept?: number;
  favorite?: boolean;
  loader?: string;
  loaderVersion?: string;
  gameId?: string;
  /** File the server is launched from when it is not the game's default executable. */
  launchFile?: string;
  /** Values of the game's setup schema fields chosen at creation. */
  gameConfig?: Record<string, string | number | boolean>;
}

export type GameAvailability = 'available' | 'beta' | 'coming_soon';

/** One input of a game's setup step, rendered from data. */
export type LocalizedText = string | Record<string, string>;

export interface SetupField {
  id: string;
  type: 'select' | 'text' | 'secret' | 'number' | 'toggle' | 'custom';
  /** i18n key; `label` (language map from a game pack) wins when present. */
  labelKey?: string;
  label?: LocalizedText;
  descriptionKey?: string;
  description?: LocalizedText;
  options?: Array<{ value: string; labelKey?: string; label?: LocalizedText }>;
  default?: string | number | boolean;
  required?: boolean;
  /** For `custom` fields: key of a client-registered component. */
  component?: string;
}

export interface ModSourceInfo {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
}

export interface ModSearchHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  categories: string[];
  iconUrl: string | null;
  url: string | null;
  updatedAt: string | null;
}

export interface ModVersionInfo {
  id: string;
  name: string;
  versionNumber: string;
  type: 'release' | 'beta' | 'alpha';
  gameVersions: string[];
  loaders: string[];
  publishedAt: string;
  downloads: number;
  filename: string | null;
  size: number | null;
}

export interface ModFacets {
  sorts: Array<'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'>;
  categories: Array<{ id: string; name: string }>;
  environments: Array<'client' | 'server'>;
  gameVersions: string[];
  loaders: string[];
}

/** Catalog filters; `loader` / `gameVersion` use 'instance' (server's own) or 'any'. */
export interface CatalogFilters {
  sort: '' | 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
  loader: string;
  gameVersion: string;
  environment: '' | 'client' | 'server';
  categories: string[];
}

export interface PlayerActionParam {
  id: string;
  label: LocalizedText;
  type: 'text' | 'number' | 'select';
  default?: string | number;
  options?: Array<{ value: string; label: LocalizedText }>;
}

/** Run by the daemon (bridge or console commands); the UI only sends the action id and parameter values. */
export interface PlayerActionSpec {
  id: string;
  label: LocalizedText;
  command?: string | string[];
  bridgeAction?: string;
  params?: PlayerActionParam[];
  danger?: boolean;
  /** Shown on each player card and in the Overview; the rest live in the player's menu. */
  quick?: boolean;
  icon?: string;
}

export interface DimensionSpec {
  id: string;
  label: LocalizedText;
  aliases?: string[];
  /** Image inside the pack folder (served by the daemon). */
  icon?: string;
  primary?: boolean;
}

export interface CreationSetting {
  id: string;
  label: LocalizedText;
  type: 'select' | 'text' | 'number';
  options?: Array<{ value: string; label: LocalizedText }>;
  default?: string | number;
  file: string;
  key: string;
}

export interface PlayerView {
  dimensions?: boolean;
  coordinates?: boolean;
  vitals?: boolean;
  avatarUrl?: string;
  /** Inventory item image URL templates (`{{item}}`, `{{namespace}}`), tried in order. */
  itemIconUrls?: string[];
  itemNamespaces?: string[];
  /** Id of the player action that empties an inventory. */
  inventoryClearAction?: string;
}

export interface JvmFlagPreset {
  id: string;
  label: string;
  description: string;
  flags: string[];
  recommendedFor?: string[];
}

export interface GameDriverSummary {
  id: string;
  name: string;
  category: 'voxel' | 'survival' | 'sandbox';
  defaultPort: number;
  /** Consecutive ports a server of this game uses, starting at its port (default 1). */
  portStride?: number;
  defaultMaxPlayers: number;
  executableName: string;
  /** Launch arguments as declared (placeholders unrendered). */
  launchArgs?: string[];
  supportsMods: boolean;
  modFormat: string;
  supportsCustomJava: boolean;
  configFileName: string;
  badge: string;
  description: string;
  status: GameAvailability;
  setupSchema: SetupField[];
  capabilities: GameCapabilities;
  configFiles: ConfigFileInfo[];
  launchDefaults?: { memoryMb?: number };
  playerActions?: PlayerActionSpec[];
  creationSettings?: CreationSetting[];
  quickCommands?: Array<{ label: string; command: string }>;
  /** Whitelist, operators, bans... the server keeps in JSON files. */
  playerLists?: PlayerListSpec[];
  playerView?: PlayerView;
  dimensions?: DimensionSpec[];
  listPlayersCommand?: string;
  /** Ticks per second the server targets (enables the TPS card). */
  performance?: { tickRate: number };
  /** How the message of the day is shown: formatting codes and a server-list style preview. */
  motd?: { colorCodes?: boolean; preview?: boolean };
  /** Present when the game's extension can install its server software (variants, versions, own file). */
  installer?: InstallerSpec;
  /** Config file kept in sync with port / motd / player limit (also marks games with those settings). */
  configSync?: { file: string; format: 'properties' | 'ini' | 'json' | 'toml'; map: { port?: string; motd?: string; maxPlayers?: string } };
  bridgeLoaders?: string[];
  jvmFlagPresets?: JvmFlagPreset[];
  modSources?: ModSourceInfo[];
  /** Icon the game itself shows (square PNG of `size` px at `file`); absent = only shown inside Hosty. */
  serverIcon?: { file: string; size: number };
  hasLogo: boolean;
  /** Extra UI translations contributed by the pack, keyed by language. */
  i18n?: Record<string, Record<string, string>>;
  descriptionI18n?: Record<string, string>;
  provision?: { type: 'none' } | { type: 'steamcmd'; appId: number; branchField?: string } | { type: 'download'; url: string; filename?: string; sha256?: string };
}

export interface GameCapabilities {
  players: boolean;
  mods: boolean;
  configEditor: boolean;
  bridge: boolean;
}

export interface ConfigFileInfo {
  path: string;
  format: 'properties' | 'ini' | 'json' | 'toml' | 'lines';
  label?: LocalizedText;
  exists?: boolean;
}

export interface GamePackInfo {
  id: string | null;
  name: string | null;
  version: string | null;
  dir: string;
  hasCode: boolean;
  trusted: boolean;
  loaded: boolean;
  /** False when the user switched the game off (hidden from the game list). */
  enabled: boolean;
  errors: string[];
}

export interface InstanceInfo {
  id: string;
  name: string;
  dir: string;
  port: number;
  motd: string;
  hasJar: boolean;
  hasIcon: boolean;
  /** Changes with the icon file; part of the icon URL so a replaced icon is not served from cache. */
  iconVersion?: number;
  isImported: boolean;
  createdAt: string;
  maxPlayers: number;
  minRamMb: number;
  maxRamMb: number;
  jvmArgs: string[];
  javaPath: string;
  forceSaveOnStop: boolean;
  autostart: boolean;
  autoRestart?: boolean;
  scheduledRestartHours?: number;
  backupsKept?: number;
  favorite?: boolean;
  status?: ServerStatus;
  onlinePlayersCount?: number;
  loader?: string;
  loaderVersion?: string;
  gameId?: string;
  launchFile?: string;
  bridgeConnected?: boolean;
  bridgeInstalled?: boolean;
  bridgeSupported?: boolean;
  /** False when the server's game is not loaded or its settings are damaged: it cannot be started. */
  gameAvailable?: boolean;
}

export interface InstancesResponse {
  instances: InstanceInfo[];
  activeId: string;
}

/** A list of players or addresses declared by the game (`playerLists` in its manifest). */
export interface PlayerListSpec {
  id: string;
  label: LocalizedText;
  description?: LocalizedText;
  icon?: string;
  file: string;
  key: string;
  details?: string[];
  valueType?: 'player' | 'ip';
  add: string;
  remove: string;
  reason?: boolean;
  toggle?: { configFile: string; key: string; on: string; off: string };
}

export interface PlayerListEntry {
  value: string;
  details: Record<string, string | number | boolean>;
}

export interface PlayerListState {
  id: string;
  entries: PlayerListEntry[];
  /** Enforcement switch for lists with a `toggle`; null when unknown. */
  enabled: boolean | null;
  unreadable: boolean;
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
  | { type: 'PROVISION_PROGRESS'; payload: ProvisionJobState }
  | { type: 'ERROR'; payload: DaemonErrorPayload }
  | { type: 'INSTANCE_STATUS'; payload: { instanceId: string; status: ServerStatus } }
  | { type: 'INVENTORY_DATA'; payload: PlayerInventoryData };

export type DaemonMessageType = DaemonMessage['type'];

export type SocketConnectionState = 'connecting' | 'open' | 'closed';

export interface JavaEnvironmentInfo {
  detected: boolean;
  majorVersion: number | null;
  versionString: string | null;
  path: string;
  recommended: boolean;
  downloadUrl: string;
}

export interface SystemEnvironmentResponse {
  java: JavaEnvironmentInfo;
  platform: string;
  arch: string;
  nodeVersion: string;
  totalMemMb?: number;
  freeMemMb?: number;
}


export type ProvisionPhase = 'queued' | 'resolve' | 'download' | 'install' | 'configure';
export type ProvisionJobStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface ProvisionJobState {
  id: string;
  instanceId: string;
  loader: string;
  version: string;
  status: ProvisionJobStatus;
  phase: ProvisionPhase;
  bytesReceived: number;
  bytesTotal: number | null;
  percent: number | null;
  error: DaemonErrorPayload | null;
}

/** One flavour of server software the game's installer offers (e.g. a mod loader). */
export interface InstallerVariant {
  id: string;
  name: string;
  group?: LocalizedText;
  /** Downloaded by Hosty; otherwise the user brings the server file (`url` says where to get it). */
  automatic: boolean;
  url?: string;
}

export interface InstallerSpec {
  variants: InstallerVariant[];
  defaultVariant?: string;
  /** File extensions accepted for the user's own server file. */
  fileTypes?: string[];
  /** Java major per game version: the last entry whose `from` <= version wins. */
  javaRequirements?: { default: number; versions: Array<{ from: string; java: number }> };
}

/** What a server file the user brought turned out to be (detected by the game's installer). */
export interface InstallFileInfo {
  variant: string | null;
  gameVersion: string | null;
  variantVersion: string | null;
  kind: 'server' | 'installer' | 'unknown';
}

export interface FolderInspection {
  path: string;
  /** File picked to start the server (relative to `path`), null when a folder was chosen. */
  launchFile?: string | null;
  suggestedName: string;
  gameId: string | null;
  /** Server variant the game's driver detected (e.g. a mod loader). */
  variant: string | null;
  gameVersion: string | null;
  port: number | null;
  motd: string | null;
  maxPlayers: number | null;
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface NetworkInfo {
  lanAddresses: string[];
  publicIp: string | null;
}
