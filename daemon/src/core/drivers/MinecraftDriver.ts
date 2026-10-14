import fs from 'fs';
import path from 'path';
import type { IGameDriver, GameDriverSummary, ProcessLaunchPlan, ParsedLogEvent } from './IGameDriver';
import {
  isServerReadyLine,
  parseDimensionResponse,
  parsePlayerJoin,
  parsePlayerLeave,
  parsePositionResponse
} from '../LogLineParser';

const JVM_FLAGS = ['-XX:+UseG1GC'];

export class MinecraftDriver implements IGameDriver {
  public readonly id = 'minecraft';
  public readonly name = 'Minecraft: Java Edition';

  public readonly summary: GameDriverSummary = {
    id: 'minecraft',
    name: 'Minecraft: Java Edition',
    category: 'voxel',
    defaultPort: 25565,
    defaultMaxPlayers: 20,
    executableName: 'server.jar',
    supportsMods: true,
    modFormat: 'JAR (.jar)',
    supportsCustomJava: true,
    configFileName: 'server.properties',
    badge: 'MC',
    description: 'Official Mojang, Fabric, Paper, Forge and NeoForge Java servers'
  };

  public validateInstallation(instanceDir: string): boolean {
    const jarPath = path.join(instanceDir, 'server.jar');
    return fs.existsSync(jarPath);
  }

  public buildLaunchPlan(config: {
    workingDir: string;
    javaPath?: string;
    jarFile?: string;
    minRamMb?: number;
    maxRamMb?: number;
    jvmArgs?: string[];
  }): ProcessLaunchPlan {
    const minRam = config.minRamMb ?? 1024;
    const maxRam = config.maxRamMb ?? 4096;
    const jar = config.jarFile || 'server.jar';
    const customFlags = config.jvmArgs ?? [];

    const args = [
      `-Xms${minRam}M`,
      `-Xmx${maxRam}M`,
      ...JVM_FLAGS,
      ...customFlags,
      '-jar',
      jar,
      'nogui'
    ];

    return {
      executable: config.javaPath || 'java',
      args,
      cwd: path.resolve(config.workingDir)
    };
  }

  public buildStopCommand(): string {
    return 'stop\n';
  }

  public buildSaveCommand(): string {
    return 'save-all\n';
  }

  public parseLogLine(line: string): ParsedLogEvent | null {
    if (isServerReadyLine(line)) {
      return { isReady: true };
    }

    const joined = parsePlayerJoin(line);
    if (joined) {
      return { playerJoin: joined };
    }

    const simpleJoinMatch = line.match(/:\s([a-zA-Z0-9_]{3,16})\s+joined the game/i);
    if (simpleJoinMatch && simpleJoinMatch[1]) {
      return {
        playerJoin: {
          username: simpleJoinMatch[1],
          dimension: 'overworld',
          x: 0,
          y: 64,
          z: 0
        }
      };
    }

    const leftUsername = parsePlayerLeave(line);
    if (leftUsername) {
      return { playerLeave: leftUsername };
    }

    return null;
  }

  public consumeQueryResponse(
    line: string,
    pendingQueries: Set<string>
  ): { username: string; patch: Record<string, unknown> } | null {
    const position = parsePositionResponse(line);
    if (position && pendingQueries.delete(`${position.username}:Pos`)) {
      return {
        username: position.username,
        patch: { x: position.x, y: position.y, z: position.z }
      };
    }

    const dimension = parseDimensionResponse(line);
    if (dimension && pendingQueries.delete(`${dimension.username}:Dimension`)) {
      return {
        username: dimension.username,
        patch: { dimension: dimension.dimension }
      };
    }

    return null;
  }

  public pollPlayerPositions(
    stdin: NodeJS.WritableStream,
    players: string[],
    pendingQueries: Set<string>
  ): void {
    pendingQueries.clear();
    for (const username of players) {
      pendingQueries.add(`${username}:Pos`);
      stdin.write(`data get entity ${username} Pos\n`);
      pendingQueries.add(`${username}:Dimension`);
      stdin.write(`data get entity ${username} Dimension\n`);
    }
  }
}
