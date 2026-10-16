import fs from 'fs';
import path from 'path';
import type { GameInstaller, InstallFileInfo, ParsedLogEvent } from '../../core/drivers/IGameDriver';
import type { ProvisionHooks } from '../../provisioning/download';
import { ServerInstaller, type LoaderType } from './ServerInstaller';
import { runServerInstaller } from './JavaInstallerRunner';
import { DeclarativeGameDriver } from '../../core/gamepacks/DeclarativeDriver';
import type { GameManifest } from '../../core/gamepacks/manifest';
import { inspectJar } from './JarInspector';
import { PropertiesParser } from './PropertiesParser';
import {
  normalizeDimension,
  isServerReadyLine,
  parsePlayerJoin,
  parsePlayerLeave
} from './LogLineParser';

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
 * Minecraft is described by the pack `assets/games/minecraft` (seeded into the games folder, with this class bundled as its `driver.js`) (launch discovery, player queries, config sync,
 * presets, mod catalog). Only what data cannot express lives here: richer log parsing (positions in
 * login lines), jar inspection and the default `server.properties`.
 */
export class MinecraftDriver extends DeclarativeGameDriver {
  constructor(manifest: GameManifest, packDir: string | null) {
    super(manifest, packDir);
  }

  /** Paper / Purpur / Fabric / Vanilla / Forge / NeoForge downloads and uploaded jars (variants: manifest `installer`). */
  public readonly installer: GameInstaller = {
    listVersions: (variant) => ServerInstaller.getVersions(variant as LoaderType),
    install: (instanceDir, variant, version, hooks) =>
      ServerInstaller.provisionServer(instanceDir, variant as LoaderType, version, hooks),
    inspectFile: (filePath): InstallFileInfo => {
      const inspection = inspectJar(filePath);
      return {
        variant: inspection.loader,
        gameVersion: inspection.mcVersion,
        variantVersion: inspection.loaderVersion,
        kind: inspection.kind
      };
    },
    placeFile: (instanceDir, filePath, info) => {
      const destination = path.join(instanceDir, info.kind === 'installer' ? 'installer.jar' : 'server.jar');
      fs.copyFileSync(filePath, destination);
      if (info.kind !== 'installer') return { launchFile: 'server.jar' };
      return {
        run: async (hooks: ProvisionHooks) => {
          hooks.onPhase?.('install');
          hooks.onLog('[Provisioner] Running the uploaded installer (this can take a few minutes)...');
          try {
            await runServerInstaller({
              javaPath: hooks.javaPath || 'java',
              installerJar: destination,
              cwd: instanceDir,
              signal: hooks.signal,
              onLine: (line) => hooks.onLog(`[Installer] ${line}`)
            });
          } finally {
            fs.rmSync(destination, { force: true });
            fs.rmSync(path.join(instanceDir, 'installer.jar.log'), { force: true });
          }
          hooks.onPhase?.('configure');
        }
      };
    }
  };

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

  public inspectFolder(instanceDir: string, launchFile?: string): { variant?: string | null; version?: string | null } {
    // A file chosen by the user wins over the conventional names.
    const chosen = launchFile && fs.existsSync(path.join(instanceDir, launchFile)) ? launchFile : undefined;
    const launch = chosen
      ? ({ mode: 'jar', target: chosen } as const)
      : resolveMinecraftLaunchTarget(instanceDir);
    if (launch?.mode === 'argsFile') {
      const versionDir = launch.target.split('/').slice(-2, -1)[0] ?? '';
      return {
        variant: launch.target.includes('/neoforged/') ? 'neoforge' : 'forge',
        version: versionDir.split('-')[0] || null
      };
    }
    if (launch?.mode === 'jar') {
      const inspection = inspectJar(path.join(instanceDir, launch.target));
      return { variant: inspection.loader, version: inspection.mcVersion };
    }
    return {};
  }
}
