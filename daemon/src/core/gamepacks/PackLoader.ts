import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import type { IGameDriver } from '../drivers/IGameDriver';
import { DeclarativeGameDriver } from './DeclarativeDriver';
import { validateManifest, type GameManifest } from './manifest';

export const MANIFEST_FILE = 'hosty-game.json';
export const DRIVER_FILE = 'driver.js';
const TRUST_FILE = '.trusted.json';

export interface PackInfo {
  id: string | null;
  name: string | null;
  version: string | null;
  dir: string;
  source: 'builtin' | 'external';
  /** The pack ships a `driver.js` that runs with full permissions. */
  hasCode: boolean;
  /** Code packs only run after the user approved this exact `driver.js` (by hash). */
  trusted: boolean;
  loaded: boolean;
  errors: string[];
}

/** Context handed to a pack's `createDriver()` so it can extend the declarative base. */
export interface PackDriverContext {
  manifest: GameManifest;
  packDir: string;
  base: IGameDriver;
}

export type PackDriverFactory = (context: PackDriverContext) => Partial<IGameDriver> | void;

interface TrustStore {
  [packId: string]: string;
}

const sha256 = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Scans a folder of game packs, validates them and turns them into drivers. */
export class PackLoader {
  constructor(private readonly gamesDir: string) {}

  private trustFile(): string {
    return path.join(this.gamesDir, TRUST_FILE);
  }

  private readTrust(): TrustStore {
    try {
      return JSON.parse(fs.readFileSync(this.trustFile(), 'utf-8')) as TrustStore;
    } catch {
      return {};
    }
  }

  /** Records approval of the current `driver.js` of a pack. Returns false when there is nothing to trust. */
  public trust(packId: string): boolean {
    const dir = this.findPackDir(packId);
    if (!dir) return false;
    const driverFile = path.join(dir, DRIVER_FILE);
    if (!fs.existsSync(driverFile)) return false;

    const store = this.readTrust();
    store[packId] = sha256(driverFile);
    fs.mkdirSync(this.gamesDir, { recursive: true });
    fs.writeFileSync(this.trustFile(), JSON.stringify(store, null, 2), 'utf-8');
    return true;
  }

  public revoke(packId: string): void {
    const store = this.readTrust();
    delete store[packId];
    if (fs.existsSync(this.gamesDir)) fs.writeFileSync(this.trustFile(), JSON.stringify(store, null, 2), 'utf-8');
  }

  private findPackDir(packId: string): string | null {
    if (!fs.existsSync(this.gamesDir)) return null;
    for (const entry of fs.readdirSync(this.gamesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this.gamesDir, entry.name, MANIFEST_FILE);
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { id?: string };
        if (parsed.id === packId) return path.join(this.gamesDir, entry.name);
      } catch {
        // Not a readable pack folder
      }
    }
    return null;
  }

  /** Loads every pack under the games folder. Invalid or untrusted packs are reported, never executed. */
  public load(): Array<{ info: PackInfo; driver: IGameDriver | null }> {
    if (!fs.existsSync(this.gamesDir)) return [];

    const trust = this.readTrust();
    const results: Array<{ info: PackInfo; driver: IGameDriver | null }> = [];

    for (const entry of fs.readdirSync(this.gamesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dir = path.join(this.gamesDir, entry.name);
      const manifestPath = path.join(dir, MANIFEST_FILE);
      if (!fs.existsSync(manifestPath)) continue;

      const info: PackInfo = {
        id: null,
        name: null,
        version: null,
        dir,
        source: 'external',
        hasCode: fs.existsSync(path.join(dir, DRIVER_FILE)),
        trusted: false,
        loaded: false,
        errors: []
      };

      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (error) {
        info.errors.push(`${MANIFEST_FILE} is not valid JSON: ${(error as Error).message}`);
        results.push({ info, driver: null });
        continue;
      }

      const validation = validateManifest(raw);
      if (!validation.ok || !validation.manifest) {
        info.errors.push(...validation.errors);
        results.push({ info, driver: null });
        continue;
      }

      const manifest = validation.manifest;
      info.id = manifest.id;
      info.name = manifest.name;
      info.version = manifest.version;

      const base = new DeclarativeGameDriver(manifest, dir, 'pack');
      let driver: IGameDriver = base;

      if (info.hasCode) {
        const driverFile = path.join(dir, DRIVER_FILE);
        info.trusted = trust[manifest.id] === sha256(driverFile);
        if (info.trusted) {
          try {
            const required = createRequire(driverFile)(driverFile) as
              | { createDriver?: PackDriverFactory; default?: PackDriverFactory }
              | PackDriverFactory;
            const factory = typeof required === 'function' ? required : (required.createDriver ?? required.default);
            const overrides = factory?.({ manifest, packDir: dir, base });
            if (overrides) driver = mergeDriver(base, overrides);
          } catch (error) {
            info.errors.push(`${DRIVER_FILE} failed to load: ${(error as Error).message}`);
            results.push({ info, driver: null });
            continue;
          }
        }
        // Untrusted code is skipped, but the declarative part still works on its own.
      }

      info.loaded = true;
      results.push({ info, driver });
    }

    return results;
  }
}

/** Lets a pack override individual driver methods while inheriting the declarative behaviour. */
function mergeDriver(base: DeclarativeGameDriver, overrides: Partial<IGameDriver>): IGameDriver {
  const merged = Object.create(base) as IGameDriver;
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'id' || key === 'summary') continue; // identity comes from the manifest
    (merged as unknown as Record<string, unknown>)[key] =
      typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(merged) : value;
  }
  return merged;
}
