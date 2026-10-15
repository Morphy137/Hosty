import fs from 'fs';
import path from 'path';
import { driverRegistry } from './drivers/GameDriverRegistry';
import { resolveMinecraftLaunchTarget } from './drivers/MinecraftDriver';
import { inspectJar } from '../provisioning/JarInspector';
import { DaemonError } from '../errors';

export interface FolderInspection {
  path: string;
  /** Folder name, used as the suggested display name. */
  suggestedName: string;
  /** Matching game driver id, or null when nothing recognisable was found. */
  gameId: string | null;
  loader: string | null;
  mcVersion: string | null;
  port: number | null;
  motd: string | null;
  maxPlayers: number | null;
}

const readProperties = (file: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index > 0) result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return result;
};

const readInstanceSettings = (dir: string): { gameId?: string; loader?: string; loaderVersion?: string } => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'instance.json'), 'utf-8'));
  } catch {
    return {};
  }
};

/**
 * Identifies the game and (for Minecraft) the loader of an existing server folder, reusing the jar
 * detector, so importing does not require the user to know what they have.
 */
export function inspectServerFolder(folderPath: string): FolderInspection {
  const dir = path.resolve(folderPath);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new DaemonError('CONFIG_NOT_FOUND', `Directory "${dir}" does not exist.`);
  }

  const settings = readInstanceSettings(dir);
  let gameId: string | null = settings.gameId && driverRegistry.hasDriver(settings.gameId) ? settings.gameId : null;

  if (!gameId) {
    // Specific games first: Minecraft's launch-target check is the most permissive fallback.
    const ids = driverRegistry
      .listDrivers()
      .map((summary) => summary.id)
      .sort((a, b) => (a === 'minecraft' ? 1 : b === 'minecraft' ? -1 : 0));
    gameId = ids.find((id) => driverRegistry.getDriver(id).validateInstallation(dir)) ?? null;
  }
  if (!gameId && fs.existsSync(path.join(dir, 'server.properties'))) gameId = 'minecraft';

  let loader: string | null = settings.loader ?? null;
  let mcVersion: string | null = settings.loaderVersion ?? null;

  if (gameId === 'minecraft') {
    const launch = resolveMinecraftLaunchTarget(dir);
    if (launch?.mode === 'argsFile') {
      loader = launch.target.includes('/neoforged/') ? 'neoforge' : 'forge';
      const versionDir = launch.target.split('/').slice(-2, -1)[0] ?? '';
      mcVersion = mcVersion ?? versionDir.split('-')[0] ?? null;
    } else if (launch?.mode === 'jar') {
      const inspection = inspectJar(path.join(dir, launch.target));
      loader = inspection.loader ?? loader;
      mcVersion = inspection.mcVersion ?? mcVersion;
    }
  }

  const properties = readProperties(path.join(dir, 'server.properties'));
  const toNumber = (value: string | undefined) => {
    const parsed = Number(value);
    return value !== undefined && Number.isFinite(parsed) ? parsed : null;
  };

  return {
    path: dir,
    suggestedName: path.basename(dir),
    gameId,
    loader,
    mcVersion,
    port: toNumber(properties['server-port']),
    motd: properties['motd'] ?? null,
    maxPlayers: toNumber(properties['max-players'])
  };
}
