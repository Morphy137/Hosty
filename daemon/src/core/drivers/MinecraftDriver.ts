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

export type MinecraftLaunchMode = 'jar' | 'argsFile';

export interface MinecraftLaunchTarget {
  mode: MinecraftLaunchMode;
  /** Jar file name (jar mode) or args-file path relative to the instance dir (argsFile mode). */
  target: string;
}

const ARGS_FILE_LOADER_DIRS = [
  ['libraries', 'net', 'neoforged', 'neoforge'],
  ['libraries', 'net', 'minecraftforge', 'forge']
];

/**
 * Resolves how an instance is launched. Forge / NeoForge (1.17+) installers generate
 * `libraries/.../<platform>_args.txt` and no runnable server.jar; everything else uses `-jar`.
 */
export function resolveMinecraftLaunchTarget(instanceDir: string, preferredJar = 'server.jar'): MinecraftLaunchTarget | null {
  const argsName = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  for (const segments of ARGS_FILE_LOADER_DIRS) {
    const base = path.join(instanceDir, ...segments);
    if (!fs.existsSync(base)) continue;
    const versions = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const version of versions) {
      if (fs.existsSync(path.join(base, version.name, argsName))) {
        return { mode: 'argsFile', target: [...segments, version.name, argsName].join('/') };
      }
    }
  }

  if (fs.existsSync(path.join(instanceDir, preferredJar))) {
    return { mode: 'jar', target: preferredJar };
  }

  // Legacy Forge (<= 1.16) leaves a runnable forge-<version>.jar next to the libraries folder.
  const legacy = fs
    .readdirSync(instanceDir)
    .find((name) => /^forge-.+\.jar$/i.test(name) && !/installer/i.test(name));
  return legacy ? { mode: 'jar', target: legacy } : null;
}

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
    description: 'Official Mojang, Fabric, Paper, Forge and NeoForge Java servers',
    status: 'available',
    setupSchema: [
      { id: 'install', type: 'custom', labelKey: 'create_server.steps.installation', component: 'minecraft-install' }
    ]
  };

  public validateInstallation(instanceDir: string): boolean {
    return resolveMinecraftLaunchTarget(instanceDir) !== null;
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
    const cwd = path.resolve(config.workingDir);
    const customFlags = config.jvmArgs ?? [];
    const launch = resolveMinecraftLaunchTarget(cwd, config.jarFile || 'server.jar');

    const baseArgs = [`-Xms${minRam}M`, `-Xmx${maxRam}M`, ...JVM_FLAGS, ...customFlags];
    let args: string[];
    if (launch?.mode === 'argsFile') {
      const userArgs = fs.existsSync(path.join(cwd, 'user_jvm_args.txt')) ? ['@user_jvm_args.txt'] : [];
      args = [...baseArgs, ...userArgs, `@${launch.target}`, 'nogui'];
    } else {
      args = [...baseArgs, '-jar', launch?.target ?? (config.jarFile || 'server.jar'), 'nogui'];
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
