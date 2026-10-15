import fs from 'fs';
import path from 'path';
import type { IGameDriver, GameDriverSummary } from './IGameDriver';
import type { GameManifest } from '../gamepacks/manifest';
import { PackLoader, loadBundledPacks, type PackInfo } from '../gamepacks/PackLoader';

// Bundled single-file builds (Node SEA) have no meaningful __dirname; they pass the folder explicitly.
const moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd();
const DEFAULT_BUNDLED_GAMES_DIR = path.resolve(moduleDir, '../../../assets/games');
/** Ids of the games the user switched off (bundled or installed), kept next to the user packs. */
export const DISABLED_FILE = '.disabled.json';

export class GameDriverRegistry {
  private readonly drivers = new Map<string, IGameDriver>();
  private readonly builtinIds = new Set<string>();
  private bundledInfos: PackInfo[] = [];
  private bundledDir = '';
  private packInfos: PackInfo[] = [];
  private loader: PackLoader | null = null;
  private gamesDir = '';
  private disabledIds = new Set<string>();
  /** The bundled pack flagged `default` (else the first bundled one). */
  private defaultDriverId = '';

  constructor(bundledDir: string = DEFAULT_BUNDLED_GAMES_DIR) {
    this.loadBundled(bundledDir);
  }

  /** (Re)loads the games that ship with Hosty from their pack folders. */
  public loadBundled(bundledDir: string): void {
    const resolved = path.resolve(bundledDir);
    for (const id of this.builtinIds) this.drivers.delete(id);
    this.builtinIds.clear();
    this.bundledInfos = [];
    this.bundledDir = resolved;

    let firstId = '';
    this.defaultDriverId = '';
    for (const { info, driver } of loadBundledPacks(resolved)) {
      if (driver && info.id) {
        const id = info.id.toLowerCase();
        // Disabled built-ins still reserve their id so no pack can take it over.
        this.builtinIds.add(id);
        if (this.disabledIds.has(id)) {
          info.enabled = false;
          info.loaded = false;
          this.bundledInfos.push(info);
          continue;
        }
        this.register(driver, true);
        firstId = firstId || id;
        const manifest = this.getManifest(info.id);
        if (manifest?.default && !this.defaultDriverId) this.defaultDriverId = info.id.toLowerCase();
      }
      this.bundledInfos.push(info);
    }
    this.defaultDriverId = this.defaultDriverId || firstId;
  }

  /** Game used when an instance does not declare one (legacy instances, fallback lookups). */
  public getDefaultGameId(): string {
    return this.defaultDriverId;
  }

  public register(driver: IGameDriver, builtin = false): void {
    const id = driver.id.toLowerCase();
    this.drivers.set(id, driver);
    if (builtin) this.builtinIds.add(id);
  }

  /** Loads user game packs from `gamesDir`; built-in drivers can never be replaced by a pack. */
  public loadPacks(gamesDir: string, bundledDir?: string): PackInfo[] {
    this.gamesDir = path.resolve(gamesDir);
    this.disabledIds = this.readDisabled();
    // Always reloaded: the disabled list lives in the games folder, unknown until now.
    this.loadBundled(bundledDir ?? this.bundledDir);
    this.loader = new PackLoader(gamesDir);
    return this.reloadPacks();
  }

  private readDisabled(): Set<string> {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(this.gamesDir, DISABLED_FILE), 'utf-8')) as unknown;
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').map((id) => id.toLowerCase()) : []);
    } catch {
      return new Set();
    }
  }

  private writeDisabled(): void {
    fs.mkdirSync(this.gamesDir, { recursive: true });
    fs.writeFileSync(path.join(this.gamesDir, DISABLED_FILE), JSON.stringify([...this.disabledIds].sort(), null, 2), 'utf-8');
  }

  /**
   * Switches a game (bundled or installed) on or off. A disabled game is not registered, so it disappears from
   * the game list; every game may be off. Throws a readable message for unknown games.
   */
  public setPackEnabled(packId: string, enabled: boolean): PackInfo[] {
    if (!this.gamesDir) throw new Error('Game packs are not enabled.');
    const id = packId.toLowerCase();
    const known = this.getPackInfos().some((info) => info.id?.toLowerCase() === id);
    if (!known) throw new Error(`Game "${packId}" is not installed.`);
    if (enabled) this.disabledIds.delete(id);
    else this.disabledIds.add(id);
    this.writeDisabled();
    this.loadBundled(this.bundledDir);
    return this.reloadAll();
  }

  public isPackEnabled(packId: string): boolean {
    return !this.disabledIds.has(packId.toLowerCase());
  }

  public reloadPacks(): PackInfo[] {
    if (!this.loader) return [];

    for (const id of this.drivers.keys()) {
      if (!this.builtinIds.has(id)) this.drivers.delete(id);
    }

    const infos: PackInfo[] = [];
    for (const { info, driver } of this.loader.load()) {
      if (driver && info.id) {
        if (this.builtinIds.has(info.id.toLowerCase())) {
          info.loaded = false;
          info.errors.push(`"${info.id}" is a built-in game and cannot be replaced by a pack`);
        } else if (this.disabledIds.has(info.id.toLowerCase())) {
          info.enabled = false;
          info.loaded = false;
        } else {
          this.register(driver);
        }
      }
      infos.push(info);
    }
    this.packInfos = infos;
    return infos;
  }

  /** Bundled games first (read-only, shown as reference), then the packs found on disk. */
  public getPackInfos(): PackInfo[] {
    return [...this.bundledInfos, ...this.packInfos];
  }

  /** Rescans the user packs folder and returns the complete list (bundled games included). */
  public reloadAll(): PackInfo[] {
    this.reloadPacks();
    return this.getPackInfos();
  }

  /** Installs a pack folder into the games folder and reloads. Throws a readable message on failure. */
  public installPack(sourceDir: string): PackInfo[] {
    if (!this.loader) throw new Error('Game packs are not enabled.');
    const { id } = this.loader.install(sourceDir);
    if (this.builtinIds.has(id.toLowerCase())) {
      this.loader.uninstall(id);
      throw new Error(`"${id}" is a built-in game and cannot be replaced by a pack.`);
    }
    return this.reloadAll();
  }

  public uninstallPack(packId: string): boolean {
    if (!this.loader || this.builtinIds.has(packId.toLowerCase())) return false;
    const ok = this.loader.uninstall(packId);
    if (ok) {
      if (this.disabledIds.delete(packId.toLowerCase())) this.writeDisabled();
      this.reloadPacks();
    }
    return ok;
  }

  public trustPack(packId: string): boolean {
    const ok = this.loader?.trust(packId) ?? false;
    if (ok) this.reloadPacks();
    return ok;
  }

  public getDriver(gameId?: string): IGameDriver {
    const found = gameId ? this.drivers.get(gameId.toLowerCase()) : undefined;
    const driver = found ?? this.drivers.get(this.defaultDriverId);
    if (!driver) {
      throw new Error(
        `No game drivers are loaded (bundled games folder: ${this.bundledDir || 'unset'}). Check MC_NEXUS_BUNDLED_GAMES_DIR.`
      );
    }
    return driver;
  }

  public hasDriver(gameId: string): boolean {
    return this.drivers.has(gameId.toLowerCase());
  }

  /** Absolute path of a pack file (e.g. its logo), or null for built-in or unknown games. */
  public resolvePackFile(gameId: string, relative: string): string | null {
    const driver = this.drivers.get(gameId.toLowerCase()) as unknown as { packDir?: string | null } | undefined;
    return driver?.packDir ? path.join(driver.packDir, relative) : null;
  }

  public getManifest(gameId: string): GameManifest | null {
    const driver = this.drivers.get(gameId.toLowerCase());
    const base = driver as unknown as { manifest?: GameManifest } | undefined;
    return base?.manifest ?? null;
  }

  public listDrivers(): GameDriverSummary[] {
    return Array.from(this.drivers.values()).map((d) => d.summary);
  }
}

export const driverRegistry = new GameDriverRegistry();
