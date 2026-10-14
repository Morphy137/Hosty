import fs from 'fs';
import path from 'path';
import type { IGameDriver, GameDriverSummary, ProcessLaunchPlan, ParsedLogEvent } from './IGameDriver';

const PZ_READY_PATTERNS = [
  /SERVER STARTED/i,
  /\*\*\* SERVER STARTED \*\*\*/i,
  /Server is now listening on port/i,
  /Steam game server initialized/i
];

const PZ_JOIN_PATTERNS = [
  /user\s+"?([^"\s]+)"?\s+is connected/i,
  /Player\s+"?([^"\s]+)"?\s+connected/i,
  /\*\*\*\s+Player\s+([^\s]+)\s+connected/i
];

const PZ_LEAVE_PATTERNS = [
  /user\s+"?([^"\s]+)"?\s+disconnected/i,
  /Player\s+"?([^"\s]+)"?\s+disconnected/i,
  /\*\*\*\s+Player\s+([^\s]+)\s+disconnected/i
];

export class ProjectZomboidDriver implements IGameDriver {
  public readonly id = 'project-zomboid';
  public readonly name = 'Project Zomboid';

  public readonly summary: GameDriverSummary = {
    id: 'project-zomboid',
    name: 'Project Zomboid',
    category: 'survival',
    defaultPort: 16261,
    defaultMaxPlayers: 32,
    executableName: process.platform === 'win32' ? 'ProjectZomboid64.exe' : 'start-server.sh',
    supportsMods: true,
    modFormat: 'Steam Workshop / Lua',
    supportsCustomJava: false,
    configFileName: 'servertest.ini',
    badge: 'PZ',
    description: 'Project Zomboid Dedicated Server (SteamCMD AppID 380870)'
  };

  public validateInstallation(instanceDir: string): boolean {
    const candidates = [
      'ProjectZomboid64.exe',
      'StartServer64.bat',
      'start-server.sh',
      'ProjectZomboid64.json',
      'servertest.ini'
    ];
    return candidates.some((file) => fs.existsSync(path.join(instanceDir, file)));
  }

  public buildLaunchPlan(config: {
    workingDir: string;
    maxRamMb?: number;
    port?: number;
  }): ProcessLaunchPlan {
    const cwd = path.resolve(config.workingDir);
    const maxRam = config.maxRamMb ?? 4096;
    const isWindows = process.platform === 'win32';

    let executable = isWindows
      ? path.join(cwd, 'ProjectZomboid64.exe')
      : path.join(cwd, 'start-server.sh');

    if (isWindows && !fs.existsSync(executable) && fs.existsSync(path.join(cwd, 'StartServer64.bat'))) {
      executable = path.join(cwd, 'StartServer64.bat');
    }

    const args = [
      '-servername',
      'servertest',
      `-memory`,
      `${maxRam}m`
    ];

    if (config.port) {
      args.push('-port', String(config.port));
    }

    return {
      executable,
      args,
      cwd
    };
  }

  public buildStopCommand(): string {
    return 'quit\n';
  }

  public buildSaveCommand(): string {
    return 'save\n';
  }

  public parseLogLine(line: string): ParsedLogEvent | null {
    for (const pattern of PZ_READY_PATTERNS) {
      if (pattern.test(line)) {
        return { isReady: true };
      }
    }

    for (const pattern of PZ_JOIN_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return {
          playerJoin: {
            username: match[1],
            dimension: 'knox_county',
            x: 0,
            y: 0,
            z: 0
          }
        };
      }
    }

    for (const pattern of PZ_LEAVE_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return { playerLeave: match[1] };
      }
    }

    return null;
  }
}
