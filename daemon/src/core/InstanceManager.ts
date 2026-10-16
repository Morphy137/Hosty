import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';
import { driverRegistry } from './drivers/GameDriverRegistry';
import { readSyncedValues, writeSyncedValues } from './ConfigSync';
import { TelemetryBridgeManager } from './bridge/TelemetryBridgeManager';
import { deleteInstanceIcon, findInstanceIcon, saveInstanceIcon, type GameIconResult } from './InstanceIcon';
import { readJsonFile, writeJsonAtomic } from './JsonStore';

const defaultGameId = (): string => driverRegistry.getDefaultGameId();

/** Folder names any installed game creates inside an instance (never instances themselves). */
const declaredFolders = (): Set<string> =>
  new Set(driverRegistry.listDrivers().flatMap((summary) => summary.instanceFolders ?? []));

/** Pre-0.2.1 instances kept the Steam branch in `pzBranch`; it now lives in `gameConfig`. */
const legacyGameConfig = (settings: object): Record<string, string> | undefined => {
  const legacy = (settings as { pzBranch?: unknown }).pzBranch;
  return typeof legacy === 'string' ? { pzBranch: legacy } : undefined;
};

export interface InstanceSettings {
  name?: string;
  motd?: string;
  port?: number;
  maxPlayers?: number;
  minRamMb?: number;
  maxRamMb?: number;
  jvmArgs?: string[];
  javaPath?: string;
  forceSaveOnStop?: boolean;
  autostart?: boolean;
  /** Restart automatically after an unexpected exit. */
  autoRestart?: boolean;
  /** Restart every N hours while running (0 = off). */
  scheduledRestartHours?: number;
  /** Backups kept before the oldest is deleted. */
  backupsKept?: number;
  /** Pinned to the top of the server list. */
  favorite?: boolean;
  loader?: string;
  loaderVersion?: string;
  gameId?: string;
  /** File the user chose to start the server (renamed jar, custom script); default launch otherwise. */
  launchFile?: string;
  /** Values of the game's setup schema fields chosen at creation. */
  gameConfig?: Record<string, string | number | boolean>;
}

export interface InstanceInfo {
  id: string;
  name: string;
  dir: string;
  port: number;
  motd: string;
  hasJar: boolean;
  hasIcon: boolean;
  /** Changes whenever the icon file changes; clients append it to the icon URL so a new icon is not served from cache. */
  iconVersion?: number;
  isImported: boolean;
  createdAt: string;
  maxPlayers: number;
  minRamMb: number;
  maxRamMb: number;
  jvmArgs: string[];
  javaPath: string;
  forceSaveOnStop: boolean;
  autostart: boolean;
  autoRestart: boolean;
  scheduledRestartHours: number;
  backupsKept: number;
  favorite?: boolean;
  loader?: string;
  loaderVersion?: string;
  gameId: string;
  launchFile?: string;
  gameConfig?: Record<string, string | number | boolean>;
  /** A bridge jar exists in plugins/ or mods/ (independent of a live connection). */
  bridgeInstalled?: boolean;
  /** A bridge artifact exists for this instance's loader. */
  bridgeSupported?: boolean;
  /**
   * False when the server's game is not loaded (pack disabled, removed or broken) or its settings file is
   * damaged. Such servers are listed but cannot be started until the game is available again.
   */
  gameAvailable: boolean;
}

interface RegistryData {
  activeInstanceId: string;
  importedInstances: Record<string, { name: string; path: string; createdAt: string; gameId?: string }>;
}

const REGISTRY_FILE = 'instances_registry.json';
const INSTANCE_SETTINGS_FILE = 'instance.json';
const DEFAULT_MIN_RAM_MB = 1024;
const DEFAULT_MAX_RAM_MB = 4096;

export class InstanceManager {
  private activeId: string;
  private readonly instancesBaseDir: string;
  private readonly registryFilePath: string;

  constructor(instancesBaseDir: string, defaultInstanceId = '') {
    this.instancesBaseDir = path.resolve(instancesBaseDir);
    this.registryFilePath = path.join(this.instancesBaseDir, REGISTRY_FILE);
    fs.mkdirSync(this.instancesBaseDir, { recursive: true });

    if (defaultInstanceId) {
      this.ensureDefaultInstance(defaultInstanceId);
    }

    const registry = this.loadRegistry();
    const existing = this.listInstances();
    if (registry.activeInstanceId && existing.some((inst) => inst.id === registry.activeInstanceId)) {
      this.activeId = registry.activeInstanceId;
    } else if (existing.length > 0) {
      this.activeId = existing[0].id;
    } else if (defaultInstanceId) {
      this.activeId = defaultInstanceId;
    } else {
      this.activeId = '';
    }
  }

  public getActiveInstanceId(): string {
    return this.activeId;
  }

  public getActiveInstanceDir(): string {
    const instance = this.getInstance(this.activeId);
    if (!instance) {
      return this.instancesBaseDir;
    }
    return instance.dir;
  }

  public setActiveInstanceId(id: string): InstanceInfo {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }

    this.activeId = id;
    const registry = this.loadRegistry();
    registry.activeInstanceId = id;
    this.saveRegistry(registry);

    return instance;
  }

  public listInstances(): InstanceInfo[] {
    const list: InstanceInfo[] = [];
    const registry = this.loadRegistry();

    // 1. Scan subdirectories in instancesBaseDir
    if (fs.existsSync(this.instancesBaseDir)) {
      const entries = fs.readdirSync(this.instancesBaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = entry.name;
        const dir = path.join(this.instancesBaseDir, id);
        // Folders a game declares (`mods`, `config`...) at the root are leftovers of routes run without an
        // active instance, not servers.
        if (declaredFolders().has(id) && !fs.existsSync(path.join(dir, INSTANCE_SETTINGS_FILE))) continue;
        if (!this.isConfiguredDirectory(dir)) continue;
        list.push(this.inspectInstance(id, dir, false));
      }
    }

    // 2. Include registered external/imported instances
    for (const [id, data] of Object.entries(registry.importedInstances)) {
      if (fs.existsSync(data.path) && !list.some((inst) => inst.id === id)) {
        list.push(this.inspectInstance(id, data.path, true, data.name, data.createdAt, data.gameId));
      }
    }

    return list;
  }

  public getInstance(id: string): InstanceInfo | null {
    return this.listInstances().find((inst) => inst.id === id) ?? null;
  }

  public createInstance(id: string, name?: string, customSettings?: Partial<InstanceSettings>): InstanceInfo {
    const safeId = this.sanitizeInstanceId(id);
    const targetDir = path.join(this.instancesBaseDir, safeId);

    if (fs.existsSync(targetDir)) {
      throw new DaemonError('INVALID_PAYLOAD', `Instance "${safeId}" already exists.`);
    }

    const gameId = customSettings?.gameId || defaultGameId();
    const driver = driverRegistry.getDriver(gameId);

    fs.mkdirSync(targetDir, { recursive: true });
    for (const folder of driver.summary.instanceFolders ?? []) {
      fs.mkdirSync(path.join(targetDir, folder), { recursive: true });
    }

    const serverName = name?.trim() || safeId;
    const port = customSettings?.port ?? this.findNextAvailablePort(driver.summary.defaultPort, driver.summary.portStride);
    const motd = customSettings?.motd ?? `${driver.summary.name} - ${serverName}`;
    const maxPlayers = customSettings?.maxPlayers ?? driver.summary.defaultMaxPlayers;

    // The driver creates the game's initial files (e.g. a default config), core stays game-agnostic.
    driver.scaffoldInstance?.(targetDir, { port, motd, maxPlayers });

    const settings: InstanceSettings = {
      name: serverName,
      motd,
      port,
      maxPlayers,
      minRamMb: customSettings?.minRamMb ?? DEFAULT_MIN_RAM_MB,
      maxRamMb: customSettings?.maxRamMb ?? DEFAULT_MAX_RAM_MB,
      jvmArgs: customSettings?.jvmArgs ?? [],
      javaPath: customSettings?.javaPath ?? '',
      forceSaveOnStop: customSettings?.forceSaveOnStop ?? true,
      autostart: customSettings?.autostart ?? false,
      loader: customSettings?.loader,
      loaderVersion: customSettings?.loaderVersion,
      gameId,
      gameConfig: customSettings?.gameConfig
    };

    writeJsonAtomic(path.join(targetDir, INSTANCE_SETTINGS_FILE), settings);

    return this.inspectInstance(safeId, targetDir, false, serverName);
  }

  public updateInstanceSettings(id: string, patch: Partial<InstanceSettings>): InstanceInfo {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }

    const stored = readJsonFile<InstanceSettings>(path.join(instance.dir, INSTANCE_SETTINGS_FILE));
    if (stored.status === 'corrupt') {
      // Writing the patch alone would silently drop the game, RAM, port... of this server.
      throw new DaemonError('SETTINGS_CORRUPT', `The settings of "${id}" are damaged and could not be recovered.`);
    }
    if (patch.gameId && !driverRegistry.findDriver(patch.gameId)) {
      throw new DaemonError('GAME_UNAVAILABLE', `The game "${patch.gameId}" is not installed or failed to load.`);
    }

    const merged: InstanceSettings = {
      ...(stored.status === 'ok' ? stored.value : {}),
      ...patch
    };

    writeJsonAtomic(path.join(instance.dir, INSTANCE_SETTINGS_FILE), merged);

    // Keep the game's own config file in sync with the instance settings (declared by the driver).
    const sync = driverRegistry.findDriver(merged.gameId || defaultGameId())?.summary.configSync;
    if (sync) {
      writeSyncedValues(instance.dir, sync, { port: patch.port, motd: patch.motd, maxPlayers: patch.maxPlayers });
    }

    return this.getInstance(id)!;
  }

  /** Removes an instance folder created by Hosty. Imported (external) folders are only unregistered. */
  public deleteInstance(id: string): void {
    const instance = this.getInstance(id);
    if (!instance) return;

    if (instance.isImported) {
      const registry = this.loadRegistry();
      delete registry.importedInstances[id];
      this.saveRegistry(registry);
    } else {
      fs.rmSync(instance.dir, { recursive: true, force: true });
    }

    if (this.activeId === id) {
      this.activeId = this.listInstances()[0]?.id ?? '';
      const registry = this.loadRegistry();
      registry.activeInstanceId = this.activeId;
      this.saveRegistry(registry);
    }
  }

  public getInstanceIconPath(id: string): string | null {
    const instance = this.getInstance(id);
    if (!instance) return null;
    return findInstanceIcon(instance.dir, driverRegistry.findDriver(instance.gameId)?.summary.serverIcon);
  }

  /** Saves the app icon and, if the game declares a `serverIcon`, its in-game icon file too. */
  public saveInstanceIcon(id: string, buffer: Buffer): GameIconResult {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }
    return saveInstanceIcon(instance.dir, buffer, driverRegistry.findDriver(instance.gameId)?.summary.serverIcon);
  }

  public deleteInstanceIcon(id: string): void {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }
    deleteInstanceIcon(instance.dir, driverRegistry.findDriver(instance.gameId)?.summary.serverIcon);
  }

  public importInstance(externalPath: string, name?: string, gameId?: string): InstanceInfo {
    const resolvedPath = path.resolve(externalPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Directory "${resolvedPath}" does not exist.`);
    }

    const folderName = path.basename(resolvedPath);
    const registry = this.loadRegistry();
    const baseId = this.sanitizeInstanceId(folderName);
    let id = baseId;
    for (let n = 2; registry.importedInstances[id] && registry.importedInstances[id].path !== resolvedPath; n += 1) {
      id = `${baseId}-${n}`;
    }
    const serverName = name?.trim() || folderName;

    registry.importedInstances[id] = {
      name: serverName,
      path: resolvedPath,
      createdAt: new Date().toISOString(),
      gameId: gameId || defaultGameId()
    };
    this.saveRegistry(registry);

    return this.inspectInstance(id, resolvedPath, true, serverName, undefined, registry.importedInstances[id].gameId);
  }

  private inspectInstance(
    id: string,
    dir: string,
    isImported: boolean,
    customName?: string,
    customCreatedAt?: string,
    registeredGameId?: string
  ): InstanceInfo {
    const stored = readJsonFile<InstanceSettings>(path.join(dir, INSTANCE_SETTINGS_FILE));
    const settings: InstanceSettings = stored.status === 'ok' ? stored.value : {};

    const gameId = settings.gameId || registeredGameId || defaultGameId();
    // A damaged settings file or a game that is not loaded must never be run with another game's driver.
    const driver = stored.status === 'corrupt' ? null : driverRegistry.findDriver(gameId);

    let port = settings.port ?? driver?.summary.defaultPort ?? 0;
    let motd = settings.motd ?? id;
    let maxPlayers = settings.maxPlayers ?? driver?.summary.defaultMaxPlayers ?? 0;

    // The game's own config file wins over stored settings (it is what the server really uses).
    if (driver?.summary.configSync) {
      const synced = readSyncedValues(dir, driver.summary.configSync);
      port = synced.port ?? port;
      motd = synced.motd ?? motd;
      maxPlayers = synced.maxPlayers ?? maxPlayers;
    }

    const stat = fs.statSync(dir);
    const hasJar = driver?.validateInstallation(dir, settings.launchFile) ?? false;
    const iconPath = findInstanceIcon(dir, driver?.summary.serverIcon);
    const hasIcon = iconPath !== null;
    const iconVersion = iconPath ? Math.round(fs.statSync(iconPath).mtimeMs) : undefined;
    const bridgeTargets = driver?.summary.bridgeTargets ?? { default: { dir: 'mods' } };
    const bridgeLoaders = driver?.summary.bridgeLoaders ?? [];

    return {
      id,
      name: settings.name || customName || (motd !== id ? motd : id),
      dir,
      port,
      motd,
      hasJar,
      hasIcon,
      iconVersion,
      isImported,
      createdAt: customCreatedAt || stat.birthtime.toISOString(),
      maxPlayers,
      minRamMb: settings.minRamMb ?? DEFAULT_MIN_RAM_MB,
      maxRamMb: settings.maxRamMb ?? DEFAULT_MAX_RAM_MB,
      jvmArgs: settings.jvmArgs ?? [],
      javaPath: settings.javaPath ?? '',
      forceSaveOnStop: settings.forceSaveOnStop ?? true,
      autostart: settings.autostart ?? false,
      autoRestart: settings.autoRestart ?? false,
      scheduledRestartHours: settings.scheduledRestartHours ?? 0,
      backupsKept: settings.backupsKept ?? 5,
      favorite: settings.favorite ?? false,
      loader: settings.loader,
      loaderVersion: settings.loaderVersion,
      gameId,
      launchFile: settings.launchFile,
      // Instances created before `gameConfig` stored the Steam branch in a dedicated key.
      gameConfig: settings.gameConfig ?? legacyGameConfig(settings),
      bridgeInstalled: TelemetryBridgeManager.isBridgeInstalled(
        dir,
        Array.from(new Set(Object.values(bridgeTargets).map((target) => target.dir)))
      ),
      bridgeSupported: bridgeLoaders.length > 0 && (!settings.loader || bridgeLoaders.includes(settings.loader)),
      gameAvailable: driver !== null
    };
  }

  private sanitizeInstanceId(raw: string): string {
    const sanitized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    if (!sanitized) {
      throw new DaemonError('INVALID_PAYLOAD', 'Instance ID must contain alphanumeric characters.');
    }
    return sanitized;
  }

  /**
   * First port from `basePort` (moving in steps of `stride`) whose range `[port, port + stride)` does not overlap
   * any other server's range. Games that listen on several consecutive ports declare their `portStride`.
   */
  private findNextAvailablePort(basePort: number, stride = 1): number {
    const usedPorts = new Set<number>();
    for (const instance of this.listInstances()) {
      const instanceStride = driverRegistry.findDriver(instance.gameId)?.summary.portStride ?? 1;
      for (let offset = 0; offset < instanceStride; offset += 1) usedPorts.add(instance.port + offset);
    }
    const overlaps = (port: number) => Array.from({ length: stride }, (_, offset) => port + offset).some((p) => usedPorts.has(p));
    let candidate = basePort;
    while (overlaps(candidate)) {
      candidate += stride;
    }
    return candidate;
  }

  private isConfiguredDirectory(dir: string): boolean {
    if (fs.existsSync(path.join(dir, INSTANCE_SETTINGS_FILE))) return true;
    // Any installed game recognising the folder (its own markers) makes it a server.
    if (driverRegistry.listDrivers().some((summary) => driverRegistry.getDriver(summary.id).validateInstallation(dir))) {
      return true;
    }
    try {
      const declared = declaredFolders();
      return fs.readdirSync(dir).some((entry) => !declared.has(entry));
    } catch {
      return false;
    }
  }

  private ensureDefaultInstance(id: string): void {
    // No game installed yet: there is nothing to scaffold the default instance from.
    if (!defaultGameId()) return;
    const dir = path.join(this.instancesBaseDir, id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      // The default game's own defaults (port, player limit, folders).
      const summary = driverRegistry.getDriver().summary;
      for (const folder of summary.instanceFolders ?? []) {
        fs.mkdirSync(path.join(dir, folder), { recursive: true });
      }
      const defaultSettings: InstanceSettings = {
        name: id,
        gameId: defaultGameId(),
        port: summary.defaultPort,
        maxPlayers: summary.defaultMaxPlayers,
        minRamMb: DEFAULT_MIN_RAM_MB,
        maxRamMb: DEFAULT_MAX_RAM_MB
      };
      writeJsonAtomic(path.join(dir, INSTANCE_SETTINGS_FILE), defaultSettings);
    }
  }

  private loadRegistry(): RegistryData {
    const stored = readJsonFile<RegistryData>(this.registryFilePath);
    if (stored.status === 'ok') {
      return { activeInstanceId: stored.value.activeInstanceId ?? '', importedInstances: stored.value.importedInstances ?? {} };
    }
    if (stored.status === 'corrupt') {
      // Keep the damaged file for manual recovery instead of overwriting it with an empty registry.
      const keptAs = `${this.registryFilePath}.corrupt-${Date.now()}`;
      fs.renameSync(this.registryFilePath, keptAs);
      console.warn(`[InstanceManager] ${REGISTRY_FILE} was damaged; kept as ${path.basename(keptAs)}.`);
    }
    return { activeInstanceId: '', importedInstances: {} };
  }

  private saveRegistry(data: RegistryData): void {
    writeJsonAtomic(this.registryFilePath, data);
  }
}
