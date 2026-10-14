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
