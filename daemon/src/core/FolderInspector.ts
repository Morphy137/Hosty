import fs from 'fs';
import path from 'path';
import { driverRegistry } from './drivers/GameDriverRegistry';
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
  const properties = sync ? readProperties(path.join(dir, sync.file)) : {};
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
    port: toNumber(sync?.map.port ? properties[sync.map.port] : undefined),
    motd: (sync?.map.motd ? properties[sync.map.motd] : undefined) ?? null,
    maxPlayers: toNumber(sync?.map.maxPlayers ? properties[sync.map.maxPlayers] : undefined)
  };
}
