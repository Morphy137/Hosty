import fs from 'fs';
import path from 'path';
import { readJsonFile, writeJsonAtomic } from '../JsonStore';
import { DRIVER_FILE, MANIFEST_FILE, type PackLoader } from './PackLoader';
import { validateManifest } from './manifest';

/** Versions of the bundled packs already copied to the games folder, so a pack the user removed stays removed. */
export const SEEDED_FILE = '.seeded.json';

type SeededVersions = Record<string, string>;

const versionParts = (version: string): number[] => version.split('.').map((part) => Number.parseInt(part, 10) || 0);

/** True when `candidate` is a higher `a.b.c` version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const previous = versionParts(current);
  for (let index = 0; index < Math.max(next.length, previous.length); index += 1) {
    const difference = (next[index] ?? 0) - (previous[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/**
 * Copies the game packs that ship with Hosty into the games folder, where they load like any other pack. A pack is
 * copied the first time it is seen and replaced when the bundled one has a higher version; one the user removed or
 * that was never bundled is left alone. Bundled `driver.js` files are approved right away: they ship with the app.
 */
export function seedBundledPacks(bundledDir: string, gamesDir: string, loader: PackLoader): string[] {
  if (!fs.existsSync(bundledDir)) return [];
  fs.mkdirSync(gamesDir, { recursive: true });

  const seededPath = path.join(gamesDir, SEEDED_FILE);
  const stored = readJsonFile<SeededVersions>(seededPath);
  const seeded: SeededVersions = stored.status === 'ok' ? { ...stored.value } : {};
  const copied: string[] = [];

  for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const source = path.join(bundledDir, entry.name);
    const manifestPath = path.join(source, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) continue;

    let manifest;
    try {
      const validation = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
      manifest = validation.ok ? validation.manifest : undefined;
    } catch {
      manifest = undefined;
    }
    if (!manifest) continue;

    const installedDir = path.join(gamesDir, manifest.id);
    const previousVersion = seeded[manifest.id];
    const isFirstSeed = previousVersion === undefined && !fs.existsSync(installedDir);
    const isUpgrade = previousVersion !== undefined && fs.existsSync(installedDir) && isNewerVersion(manifest.version, previousVersion);
    if (!isFirstSeed && !isUpgrade) continue;

    loader.install(source);
    if (fs.existsSync(path.join(source, DRIVER_FILE))) loader.trust(manifest.id);
    seeded[manifest.id] = manifest.version;
    copied.push(manifest.id);
  }

  if (copied.length > 0) writeJsonAtomic(seededPath, seeded);
  return copied;
}
