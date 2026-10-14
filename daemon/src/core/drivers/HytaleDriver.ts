import fs from 'fs';
import path from 'path';
import type { IGameDriver, GameDriverSummary, ProcessLaunchPlan, ParsedLogEvent } from './IGameDriver';

const HY_READY_PATTERNS = [
  /Hytale Server started successfully/i,
  /Ready for connections/i,
  /Server listening on/i,
  /Server started in \d+(\.\d+)?s/i
];

const HY_JOIN_PATTERNS = [
  /Player\s+"?([^"\s]+)"?\s+joined the world/i,
  /Player\s+"?([^"\s]+)"?\s+connected/i,
  /\*\*\*\s+Player\s+([^\s]+)\s+joined/i
];

const HY_LEAVE_PATTERNS = [
  /Player\s+"?([^"\s]+)"?\s+left the world/i,
  /Player\s+"?([^"\s]+)"?\s+disconnected/i,
  /\*\*\*\s+Player\s+([^\s]+)\s+left/i
];

export class HytaleDriver implements IGameDriver {
  public readonly id = 'hytale';
  public readonly name = 'Hytale';

  public readonly summary: GameDriverSummary = {
    id: 'hytale',
    name: 'Hytale',
    category: 'voxel',
    defaultPort: 25565,
    defaultMaxPlayers: 40,
    executableName: 'HytaleServer.jar',
    supportsMods: true,
    modFormat: 'Hytale Mod Package / Script',
    supportsCustomJava: true,
    configFileName: 'config.json',
    badge: 'HY',
    description: 'Hytale Dedicated Server (Engine Spec & Preview)'
  };

  public validateInstallation(instanceDir: string): boolean {
    const candidates = [
      'HytaleServer.jar',
      'hytale-server.exe',
      'hytale-server',
      'config.json'
    ];
    return candidates.some((file) => fs.existsSync(path.join(instanceDir, file)));
  }

  public buildLaunchPlan(config: {
    workingDir: string;
    javaPath?: string;
    jarFile?: string;
    minRamMb?: number;
    maxRamMb?: number;
    jvmArgs?: string[];
    port?: number;
  }): ProcessLaunchPlan {
    const cwd = path.resolve(config.workingDir);
    const minRam = config.minRamMb ?? 2048;
    const maxRam = config.maxRamMb ?? 6144;
    const jar = config.jarFile || 'HytaleServer.jar';
    const customFlags = config.jvmArgs ?? [];

    const args = [
      `-Xms${minRam}M`,
      `-Xmx${maxRam}M`,
      ...customFlags,
      '-jar',
      jar
    ];

    if (config.port) {
      args.push('--port', String(config.port));
    }

    return {
      executable: config.javaPath || 'java',
      args,
      cwd
    };
  }

  public buildStopCommand(): string {
    return 'stop\n';
  }

  public buildSaveCommand(): string {
    return 'save\n';
  }

  public parseLogLine(line: string): ParsedLogEvent | null {
    for (const pattern of HY_READY_PATTERNS) {
      if (pattern.test(line)) {
        return { isReady: true };
      }
    }

    for (const pattern of HY_JOIN_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return {
          playerJoin: {
            username: match[1],
            dimension: 'orbis',
            x: 0,
            y: 70,
            z: 0
          }
        };
      }
    }

    for (const pattern of HY_LEAVE_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return { playerLeave: match[1] };
      }
    }

    return null;
  }
}
