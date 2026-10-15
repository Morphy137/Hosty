import type { DimensionSpec, PlayerActionSpec, PlayerView } from '../gamepacks/manifest';

export type GameAvailability = 'available' | 'beta' | 'coming_soon';

/** One input of a game's setup step, rendered by the client from data (no per-game UI code). */
export interface SetupField {
  id: string;
  type: 'select' | 'text' | 'secret' | 'number' | 'toggle' | 'custom';
  /** i18n key (client) for the label; `label` (a language map) wins when present. */
  labelKey?: string;
  label?: string | Record<string, string>;
  descriptionKey?: string;
  description?: string | Record<string, string>;
  options?: Array<{ value: string; labelKey?: string; label?: string | Record<string, string> }>;
  default?: string | number | boolean;
  required?: boolean;
  /** For `custom` fields: key of a client-registered component that renders the field. */
  component?: string;
}

export interface GameCapabilitiesSummary {
  players: boolean;
  mods: boolean;
  configEditor: boolean;
  bridge: boolean;
}

export interface ConfigFileSummary {
  path: string;
  format: 'properties' | 'ini' | 'json' | 'toml' | 'lines';
  label?: string | Record<string, string>;
}

/** A named set of JVM flags a driver recommends (shown in the server editor). */
export interface JvmFlagPreset {
  id: string;
  /** English label/description; clients may override through `edit_server.preset.<id>.*` keys. */
  label: string;
  description: string;
  flags: string[];
  /** Loaders (or game variants) this preset is tuned for; it is badged "recommended" for them. */
  recommendedFor?: string[];
}

/**
 * Where a game's mods/plugins can be searched and downloaded from. The core only speaks the
 * declared API dialect, so any game pack can expose its own catalog.
 */
export interface ModSourceSummary {
  id: string;
  name: string;
  /** API dialect. `modrinth` = Modrinth/Labrinth v2 compatible. */
  type: 'modrinth';
  /** API base URL, e.g. https://api.modrinth.com/v2 */
  baseUrl: string;
  /** Optional link template for a project page; `{slug}` is replaced. */
  projectUrl?: string;
  /** Instance loader -> catalog category names used as the compatibility filter. */
  loaderCategories?: Record<string, string[]>;
  /** Restrict results to these catalog project types. */
  projectTypes?: string[];
  /** Instance loader -> folder (relative to the instance) the file is placed in. */
  installDir?: Record<string, string>;
  defaultInstallDir?: string;
}

export interface LaunchDefaults {
  /** Default heap size in MB offered when creating a server. */
  memoryMb?: number;
}

export interface GameDriverSummary {
  id: string;
  name: string;
  category: 'voxel' | 'survival' | 'sandbox';
  defaultPort: number;
  defaultMaxPlayers: number;
  executableName: string;
  supportsMods: boolean;
  modFormat: string;
  supportsCustomJava: boolean;
  configFileName: string;
  badge: string;
  description: string;
  status: GameAvailability;
  setupSchema: SetupField[];
  capabilities: GameCapabilitiesSummary;
  configFiles: ConfigFileSummary[];
  launchDefaults?: LaunchDefaults;
  playerActions?: PlayerActionSpec[];
  instanceFolders?: string[];
  modLayout?: { modsDir?: string; configDir?: string };
  bridgeTargets?: Record<string, { dir: string; asset: string }>;
  creationSettings?: Array<{
    id: string;
    label: string | Record<string, string>;
    type: 'select' | 'text' | 'number';
    options?: Array<{ value: string; label: string | Record<string, string> }>;
    default?: string | number;
    file: string;
    key: string;
  }>;
  quickCommands?: Array<{ label: string; command: string }>;
  playerView?: PlayerView;
  dimensions?: DimensionSpec[];
  performance?: { tickRate: number };
  /** Console command that prints the online players (manifest `commands.listPlayers`). */
  listPlayersCommand?: string;
  /** Config file kept in sync with the instance's port / motd / player limit. */
  configSync?: { file: string; format: 'properties' | 'ini' | 'json' | 'toml'; map: { port?: string; motd?: string; maxPlayers?: string } };
  /** Loaders a Telemetry Bridge exists for (empty/absent = no bridge). */
  bridgeLoaders?: string[];
  modSources?: ModSourceSummary[];
  /** Icon the game itself shows (square PNG of `size` px at `file`); absent = only shown inside Hosty. */
  serverIcon?: { file: string; size: number };
  jvmFlagPresets?: JvmFlagPreset[];
  /** Where the driver comes from: shipped with Hosty or loaded from a user pack folder. */
  source: 'builtin' | 'pack';
  hasLogo: boolean;
  /** Extra UI translations contributed by the pack, keyed by language. */
  i18n?: Record<string, Record<string, string>>;
  provision?: { type: 'none' } | { type: 'steamcmd'; appId: number; branchField?: string } | { type: 'download'; url: string; filename?: string; sha256?: string };
  /** Localized description from the pack manifest (overrides `description`). */
  descriptionI18n?: Record<string, string>;
}

export interface ParsedLogEvent {
  isReady?: boolean;
  playerJoin?: {
    username: string;
    dimension?: string;
    x?: number;
    y?: number;
    z?: number;
  };
  playerLeave?: string;
}

export interface ProcessLaunchPlan {
  executable: string;
  args: string[];
  cwd: string;
}

export interface IGameDriver {
  readonly id: string;
  readonly name: string;
  readonly summary: GameDriverSummary;

  /** `launchFile`: the file the user picked to start the server, when it is not the conventional name. */
  validateInstallation(instanceDir: string, launchFile?: string): boolean;
  buildLaunchPlan(config: {
    workingDir: string;
    javaPath?: string;
    jarFile?: string;
    minRamMb?: number;
    maxRamMb?: number;
    jvmArgs?: string[];
    port?: number;
    maxPlayers?: number;
    name?: string;
    id?: string;
    /** Values of the game's setup fields; exposed to launch templates as `{{fieldId}}`. */
    gameConfig?: Record<string, string | number | boolean>;
  }): ProcessLaunchPlan;
  buildStopCommand(): string;
  buildSaveCommand(): string;
  parseLogLine(line: string): ParsedLogEvent | null;
  /** Creates the game's initial files for a new instance (e.g. a default config). */
  scaffoldInstance?(instanceDir: string, options: { port: number; motd: string; maxPlayers: number }): void;
  /** Identifies what an existing folder contains (loader / version) so importing needs no user input. */
  inspectFolder?(instanceDir: string, launchFile?: string): { loader?: string | null; version?: string | null };
  consumeQueryResponse?(
    line: string,
    pendingQueries: Set<string>
  ): { username: string; patch: Record<string, unknown> } | null;
  pollPlayerPositions?(
    stdin: NodeJS.WritableStream,
    players: string[],
    pendingQueries: Set<string>
  ): void;
}
