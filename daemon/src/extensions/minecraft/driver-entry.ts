import type { GameManifest } from '../../core/gamepacks/manifest';
import { MinecraftDriver } from './MinecraftDriver';

/**
 * Entry point of the Minecraft pack's `driver.js` (bundled by `scripts/build-games.mjs`). The pack loader hands the
 * manifest and the pack folder over and uses the returned driver as is.
 */
export function createDriver(context: { manifest: GameManifest; packDir: string }): MinecraftDriver {
  return new MinecraftDriver(context.manifest, context.packDir, 'pack');
}
