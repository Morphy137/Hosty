import fs from 'fs';
import path from 'path';
import { driverRegistry } from './drivers/GameDriverRegistry';
import { readSyncedValues } from './ConfigSync';
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
    // Specific games first: the default game's checks are the most permissive, so it goes last.
    const fallback = driverRegistry.getDefaultGameId();
    const ids = driverRegistry
      .listDrivers()
      .map((summary) => summary.id)
      .sort((a, b) => (a === fallback ? 1 : b === fallback ? -1 : 0));
    gameId = ids.find((id) => driverRegistry.getDriver(id).validateInstallation(dir)) ?? null;
  }

  let loader: string | null = settings.loader ?? null;
  let mcVersion: string | null = settings.loaderVersion ?? null;

  // Game-specific details (loader, version) come from the driver, never from a game check here.
  if (gameId) {
    const detected = driverRegistry.getDriver(gameId).inspectFolder?.(dir);
    loader = detected?.loader ?? loader;
    mcVersion = detected?.version ?? mcVersion;
  }

  const sync = gameId ? driverRegistry.getDriver(gameId).summary.configSync : undefined;
  const synced = sync ? readSyncedValues(dir, sync) : {};

  return {
    path: dir,
    suggestedName: path.basename(dir),
    gameId,
    loader,
    mcVersion,
    port: synced.port ?? null,
    motd: synced.motd ?? null,
    maxPlayers: synced.maxPlayers ?? null
  };
}
