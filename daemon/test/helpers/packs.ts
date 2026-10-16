import fs from 'fs';
import os from 'os';
import path from 'path';
import { GameDriverRegistry } from '../../src/core/drivers/GameDriverRegistry';

/** The packs that ship with Hosty; the registry copies them into its games folder on first load. */
export const BUNDLED_GAMES_DIR = path.resolve(__dirname, '../../assets/games');

/** A registry whose own temporary games folder was seeded with the bundled packs, like a first app run. */
export function createSeededRegistry(): GameDriverRegistry {
  const gamesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-games-'));
  const registry = new GameDriverRegistry();
  registry.loadPacks(gamesDir, BUNDLED_GAMES_DIR);
  return registry;
}
