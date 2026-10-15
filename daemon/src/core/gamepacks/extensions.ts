import type { IGameDriver } from '../drivers/IGameDriver';
import { MinecraftDriver } from '../../extensions/minecraft/MinecraftDriver';
import type { GameManifest } from './manifest';

/**
 * Code that ships inside Hosty and can extend a *bundled* pack (`"extension": "<id>"` in its manifest).
 * User packs can never reach this table; they use the trust-gated `driver.js` instead.
 */
export type ExtensionFactory = (manifest: GameManifest, packDir: string) => IGameDriver;

export const BUNDLED_EXTENSIONS: Record<string, ExtensionFactory> = {
  minecraft: (manifest, packDir) => new MinecraftDriver(manifest, packDir)
};
