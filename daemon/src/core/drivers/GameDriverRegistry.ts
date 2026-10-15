import path from 'path';
import type { IGameDriver, GameDriverSummary } from './IGameDriver';
import { MinecraftDriver } from './MinecraftDriver';
import { DeclarativeGameDriver } from '../gamepacks/DeclarativeDriver';
import { validateManifest, type GameManifest } from '../gamepacks/manifest';
import { PackLoader, type PackInfo } from '../gamepacks/PackLoader';
import projectZomboidManifest from '../gamepacks/builtin/project-zomboid.json';
import hytaleManifest from '../gamepacks/builtin/hytale.json';

const BUILTIN_MANIFESTS: unknown[] = [projectZomboidManifest, hytaleManifest];

export class GameDriverRegistry {
  private readonly drivers = new Map<string, IGameDriver>();
  private readonly builtinIds = new Set<string>();
  private packInfos: PackInfo[] = [];
  private loader: PackLoader | null = null;
  private readonly defaultDriverId = 'minecraft';

  constructor() {
    this.register(new MinecraftDriver(), true);
    for (const raw of BUILTIN_MANIFESTS) {
      const validation = validateManifest(raw);
      if (!validation.ok || !validation.manifest) {
        throw new Error(`Invalid built-in game pack: ${validation.errors.join('; ')}`);
      }
      this.register(new DeclarativeGameDriver(validation.manifest as GameManifest, null, 'builtin'), true);
    }
  }

  public register(driver: IGameDriver, builtin = false): void {
    const id = driver.id.toLowerCase();
    this.drivers.set(id, driver);
    if (builtin) this.builtinIds.add(id);
  }

  /** Loads user game packs from `gamesDir`; built-in drivers can never be replaced by a pack. */
  public loadPacks(gamesDir: string): PackInfo[] {
    this.loader = new PackLoader(gamesDir);
    return this.reloadPacks();
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
        } else {
          this.register(driver);
        }
      }
      infos.push(info);
    }
    this.packInfos = infos;
    return infos;
  }

  /** Built-in games first (read-only, shown as reference), then the packs found on disk. */
  public getPackInfos(): PackInfo[] {
    const builtin: PackInfo[] = [...this.builtinIds].map((id) => {
      const driver = this.drivers.get(id);
      const manifest = driver ? this.getManifest(id) : null;
      return {
        id,
        name: driver?.summary.name ?? id,
        version: manifest?.version ?? null,
        dir: 'built-in',
        source: 'builtin',
        hasCode: manifest === null,
        trusted: true,
        loaded: true,
        errors: []
      };
    });
    return [...builtin, ...this.packInfos];
  }

  /** Installs a pack folder into the games folder and reloads. Throws a readable message on failure. */
  public installPack(sourceDir: string): PackInfo[] {
    if (!this.loader) throw new Error('Game packs are not enabled.');
    const { id } = this.loader.install(sourceDir);
    if (this.builtinIds.has(id.toLowerCase())) {
      this.loader.uninstall(id);
      throw new Error(`"${id}" is a built-in game and cannot be replaced by a pack.`);
    }
    return this.reloadPacks();
  }

  public uninstallPack(packId: string): boolean {
    if (!this.loader || this.builtinIds.has(packId.toLowerCase())) return false;
    const ok = this.loader.uninstall(packId);
    if (ok) this.reloadPacks();
    return ok;
  }

  public trustPack(packId: string): boolean {
    const ok = this.loader?.trust(packId) ?? false;
    if (ok) this.reloadPacks();
    return ok;
  }

  public getDriver(gameId?: string): IGameDriver {
    if (!gameId) {
      return this.drivers.get(this.defaultDriverId)!;
    }
    const found = this.drivers.get(gameId.toLowerCase());
    return found ?? this.drivers.get(this.defaultDriverId)!;
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
