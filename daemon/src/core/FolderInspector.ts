import fs from 'fs';
import path from 'path';
import { driverRegistry } from './drivers/GameDriverRegistry';
import { readSyncedValues } from './ConfigSync';
import { DaemonError } from '../errors';

export interface FolderInspection {
  /** Server folder (the parent folder when a file was chosen). */
  path: string;
  /** File the user picked to start the server, relative to `path`; null when a folder was chosen. */
  launchFile: string | null;
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
/**
 * `expectedGameId` (the game chosen in the wizard) lets a user-picked file with an unconventional name be
 * validated by that game; without it only conventional layouts are recognised.
 */
export function inspectServerFolder(folderOrFile: string, expectedGameId?: string): FolderInspection {
  const target = path.resolve(folderOrFile);
  if (!fs.existsSync(target)) {
    throw new DaemonError('CONFIG_NOT_FOUND', `"${target}" does not exist.`);
  }
  // Choosing the server file (e.g. a renamed .jar) is allowed: its folder is the server and the file
  // name is kept so it can be launched as-is.
  const isFile = fs.statSync(target).isFile();
  const dir = isFile ? path.dirname(target) : target;
  const launchFile = isFile ? path.basename(target) : undefined;

  const settings = readInstanceSettings(dir);
  let gameId: string | null = settings.gameId && driverRegistry.hasDriver(settings.gameId) ? settings.gameId : null;

  if (!gameId) {
    // Specific games first: the default game's checks are the most permissive, so it goes last.
    const fallback = driverRegistry.getDefaultGameId();
    const ids = driverRegistry
      .listDrivers()
      .map((summary) => summary.id)
      .sort((a, b) => (a === fallback ? 1 : b === fallback ? -1 : 0));
    gameId = ids.find((id) => driverRegistry.getDriver(id).validateInstallation(dir)) ?? null;
    // A chosen file is only trusted by the game the user said this server is.
    if (!gameId && launchFile && expectedGameId && driverRegistry.hasDriver(expectedGameId)) {
      if (driverRegistry.getDriver(expectedGameId).validateInstallation(dir, launchFile)) gameId = expectedGameId;
    }
  }

  let loader: string | null = settings.loader ?? null;
  let mcVersion: string | null = settings.loaderVersion ?? null;

  // Game-specific details (loader, version) come from the driver, never from a game check here.
  if (gameId) {
    const detected = driverRegistry.getDriver(gameId).inspectFolder?.(dir, launchFile);
    loader = detected?.loader ?? loader;
    mcVersion = detected?.version ?? mcVersion;
  }

  const sync = gameId ? driverRegistry.getDriver(gameId).summary.configSync : undefined;
  const synced = sync ? readSyncedValues(dir, sync) : {};

  return {
    path: dir,
    launchFile: launchFile ?? null,
    suggestedName: path.basename(dir),
    gameId,
    loader,
    mcVersion,
    port: synced.port ?? null,
    motd: synced.motd ?? null,
    maxPlayers: synced.maxPlayers ?? null
  };
}
