import path from 'path';
import { DaemonError } from '../../errors';
import { readJsonFile, writeJsonAtomic } from '../JsonStore';
import type { IGameDriver, GameDriverSummary } from './IGameDriver';
import type { GameManifest } from '../gamepacks/manifest';
import { PackLoader, type PackInfo } from '../gamepacks/PackLoader';
import { seedBundledPacks } from '../gamepacks/PackSeeder';

/** Ids of the games the user switched off, kept next to the packs in the games folder. */
export const DISABLED_FILE = '.disabled.json';

/** Every game is a pack in the games folder; the ones that ship with Hosty are copied there on first run. */
export class GameDriverRegistry {
  private readonly drivers = new Map<string, IGameDriver>();
  private packInfos: PackInfo[] = [];
  private loader: PackLoader | null = null;
  private gamesDir = '';
  private disabledIds = new Set<string>();
  /** The pack flagged `default` (else the first one loaded). */
  private defaultDriverId = '';

  /** Game used when an instance does not declare one (legacy instances, fallback lookups). */
  public getDefaultGameId(): string {
    return this.defaultDriverId;
  }

  public register(driver: IGameDriver): void {
    this.drivers.set(driver.id.toLowerCase(), driver);
  }

  /**
   * Loads the games from `gamesDir`. When `bundledDir` is given, the packs that ship with Hosty are copied into
   * `gamesDir` first (see `seedBundledPacks`).
   */
  public loadPacks(gamesDir: string, bundledDir?: string): PackInfo[] {
    this.gamesDir = path.resolve(gamesDir);
    this.disabledIds = this.readDisabled();
    this.loader = new PackLoader(this.gamesDir);
    if (bundledDir) seedBundledPacks(path.resolve(bundledDir), this.gamesDir, this.loader);
    return this.reloadPacks();
  }

  private readDisabled(): Set<string> {
    const stored = readJsonFile<unknown>(path.join(this.gamesDir, DISABLED_FILE));
    const parsed = stored.status === 'ok' ? stored.value : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').map((id) => id.toLowerCase()) : []);
  }

  private writeDisabled(): void {
    writeJsonAtomic(path.join(this.gamesDir, DISABLED_FILE), [...this.disabledIds].sort());
  }

  /**
   * Switches a game on or off. A disabled game is not registered, so it disappears from the game list; every
   * game may be off. Throws a readable message for unknown games.
   */
  public setPackEnabled(packId: string, enabled: boolean): PackInfo[] {
    if (!this.gamesDir) throw new Error('Game packs are not enabled.');
    const id = packId.toLowerCase();
    const known = this.getPackInfos().some((info) => info.id?.toLowerCase() === id);
    if (!known) throw new Error(`Game "${packId}" is not installed.`);
    if (enabled) this.disabledIds.delete(id);
    else this.disabledIds.add(id);
    this.writeDisabled();
    return this.reloadAll();
  }

  public isPackEnabled(packId: string): boolean {
    return !this.disabledIds.has(packId.toLowerCase());
  }

  public reloadPacks(): PackInfo[] {
    if (!this.loader) return [];

    this.drivers.clear();
    const infos: PackInfo[] = [];
    let firstId = '';
    this.defaultDriverId = '';
    for (const { info, driver } of this.loader.load()) {
      if (driver && info.id) {
        const id = info.id.toLowerCase();
        if (this.disabledIds.has(id)) {
          info.enabled = false;
          info.loaded = false;
        } else {
          this.register(driver);
          firstId = firstId || id;
          if (this.getManifest(id)?.default && !this.defaultDriverId) this.defaultDriverId = id;
        }
      }
      infos.push(info);
    }
    this.defaultDriverId = this.defaultDriverId || firstId;
    this.packInfos = infos;
    return infos;
  }

  public getPackInfos(): PackInfo[] {
    return this.packInfos;
  }

  /** Rescans the games folder and returns the complete list. */
  public reloadAll(): PackInfo[] {
    this.reloadPacks();
    return this.getPackInfos();
  }

  /**
   * Installs a pack folder into the games folder and reloads. Throws a readable message on failure. `trustCode`
   * approves the pack's `driver.js` right away; only for packs whose files were verified against the signed catalog.
   */
  public installPack(sourceDir: string, options: { trustCode?: boolean } = {}): PackInfo[] {
    if (!this.loader) throw new Error('Game packs are not enabled.');
    const { id } = this.loader.install(sourceDir);
    if (options.trustCode) this.loader.trust(id);
    return this.reloadAll();
  }

  public uninstallPack(packId: string): boolean {
    if (!this.loader) return false;
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

  /** The driver of a game, or null when it is not loaded (disabled, uninstalled or failed to load). */
  public findDriver(gameId: string | undefined): IGameDriver | null {
    return gameId ? (this.drivers.get(gameId.toLowerCase()) ?? null) : null;
  }

  /**
   * The driver of `gameId`, or the default game's when no id is given (legacy instances). An id whose game is
   * not loaded throws instead of falling back: running another game's driver on a server folder would launch
   * the wrong executable and write the wrong config files.
   */
  public getDriver(gameId?: string): IGameDriver {
    if (gameId) {
      const found = this.findDriver(gameId);
      if (!found) {
        throw new DaemonError('GAME_UNAVAILABLE', `The game "${gameId}" is not installed or failed to load.`);
      }
      return found;
    }
    const driver = this.drivers.get(this.defaultDriverId);
    if (!driver) {
      throw new Error(
        `No game is installed (games folder: ${this.gamesDir || 'unset'}). Install a game pack or check MC_NEXUS_BUNDLED_GAMES_DIR.`
      );
    }
    return driver;
  }

  public hasDriver(gameId: string): boolean {
    return this.drivers.has(gameId.toLowerCase());
  }

  /** Absolute path of a pack file (e.g. its logo), or null for unknown games. */
  public resolvePackFile(gameId: string, relative: string): string | null {
    const driver = this.drivers.get(gameId.toLowerCase()) as unknown as { packDir?: string | null } | undefined;
    return driver?.packDir ? path.join(driver.packDir, relative) : null;
  }

  public getManifest(gameId: string): GameManifest | null {
    const driver = this.drivers.get(gameId.toLowerCase());
    const base = driver as unknown as { manifest?: GameManifest } | undefined;
    return base?.manifest ?? null;
  }

  /** The installer data is only advertised when the driver really implements an installer. */
  public listDrivers(): GameDriverSummary[] {
    return Array.from(this.drivers.values()).map((d) =>
      d.installer || !d.summary.installer ? d.summary : { ...d.summary, installer: undefined }
    );
  }
}

export const driverRegistry = new GameDriverRegistry();
