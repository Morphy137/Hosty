import fs from 'fs';
import path from 'path';
import type { ParsedLogEvent } from './IGameDriver';
import { DeclarativeGameDriver } from '../gamepacks/DeclarativeDriver';
import type { GameManifest } from '../gamepacks/manifest';
import { inspectJar } from '../../provisioning/JarInspector';
import { PropertiesParser } from '../../parsers/PropertiesParser';
import {
  normalizeDimension,
  isServerReadyLine,
  parsePlayerJoin,
  parsePlayerLeave
} from '../LogLineParser';

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

/**
 * Minecraft is described by the bundled pack `assets/games/minecraft` (launch discovery, player queries, config sync,
 * presets, mod catalog). Only what data cannot express lives here: richer log parsing (positions in
 * login lines), jar inspection and the default `server.properties`.
 */
export class MinecraftDriver extends DeclarativeGameDriver {
  constructor(manifest: GameManifest, packDir: string | null) {
    super(manifest, packDir, 'builtin');
  }

  public override parseLogLine(line: string): ParsedLogEvent | null {
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
        playerJoin: { username: simpleJoinMatch[1], dimension: 'overworld', x: 0, y: 64, z: 0 }
      };
    }

    const leftUsername = parsePlayerLeave(line);
    if (leftUsername) {
      return { playerLeave: leftUsername };
    }

    return null;
  }

  public override consumeQueryResponse(
    line: string,
    pendingQueries: Set<string>
  ): { username: string; patch: Record<string, unknown> } | null {
    const result = super.consumeQueryResponse(line, pendingQueries);
    if (result && typeof result.patch.dimension === 'string') {
      // Bukkit world folders (world_nether...) map to vanilla dimension ids.
      result.patch.dimension = normalizeDimension(result.patch.dimension);
    }
    return result;
  }

  public scaffoldInstance(instanceDir: string, options: { port: number; motd: string; maxPlayers: number }): void {
    const propsPath = path.join(instanceDir, 'server.properties');
    if (!fs.existsSync(propsPath)) PropertiesParser.createDefaultProperties(propsPath, options);
    const eulaPath = path.join(instanceDir, 'eula.txt');
    if (!fs.existsSync(eulaPath)) fs.writeFileSync(eulaPath, 'eula=true\n', 'utf-8');
  }

  public inspectFolder(instanceDir: string): { loader?: string | null; version?: string | null } {
    const launch = resolveMinecraftLaunchTarget(instanceDir);
    if (launch?.mode === 'argsFile') {
      const versionDir = launch.target.split('/').slice(-2, -1)[0] ?? '';
      return {
        loader: launch.target.includes('/neoforged/') ? 'neoforge' : 'forge',
        version: versionDir.split('-')[0] || null
      };
    }
    if (launch?.mode === 'jar') {
      const inspection = inspectJar(path.join(instanceDir, launch.target));
      return { loader: inspection.loader, version: inspection.mcVersion };
    }
    return {};
  }
}
