export type GameAvailability = 'available' | 'beta' | 'coming_soon';

/** One input of a game's setup step, rendered by the client from data (no per-game UI code). */
export interface SetupField {
  id: string;
  type: 'select' | 'text' | 'secret' | 'number' | 'toggle' | 'custom';
  /** i18n key (client) for the label. */
  labelKey: string;
  descriptionKey?: string;
  options?: Array<{ value: string; labelKey: string }>;
  default?: string | number | boolean;
  required?: boolean;
  /** For `custom` fields: key of a client-registered component that renders the field. */
  component?: string;
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

  validateInstallation(instanceDir: string): boolean;
  buildLaunchPlan(config: {
    workingDir: string;
    javaPath?: string;
    jarFile?: string;
    minRamMb?: number;
    maxRamMb?: number;
    jvmArgs?: string[];
    port?: number;
  }): ProcessLaunchPlan;
  buildStopCommand(): string;
  buildSaveCommand(): string;
  parseLogLine(line: string): ParsedLogEvent | null;
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
