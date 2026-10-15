import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';
import { PropertiesParser } from '../parsers/PropertiesParser';
import { driverRegistry } from './drivers/GameDriverRegistry';
import { TelemetryBridgeManager } from './bridge/TelemetryBridgeManager';

const defaultGameId = (): string => driverRegistry.getDefaultGameId();

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
  /** Pinned to the top of the server list. */
  favorite?: boolean;
  loader?: string;
  loaderVersion?: string;
  gameId?: string;
  /** Project Zomboid Steam branch (stable / unstable) chosen at creation. */
  pzBranch?: string;
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
  isImported: boolean;
  createdAt: string;
  maxPlayers: number;
  minRamMb: number;
  maxRamMb: number;
  jvmArgs: string[];
  javaPath: string;
  forceSaveOnStop: boolean;
  autostart: boolean;
  favorite?: boolean;
  loader?: string;
  loaderVersion?: string;
  gameId: string;
  pzBranch?: string;
  gameConfig?: Record<string, string | number | boolean>;
  /** A bridge jar exists in plugins/ or mods/ (independent of a live connection). */
  bridgeInstalled?: boolean;
  /** A bridge artifact exists for this instance's loader. */
  bridgeSupported?: boolean;
}

interface RegistryData {
  activeInstanceId: string;
  importedInstances: Record<string, { name: string; path: string; createdAt: string; gameId?: string }>;
}

const REGISTRY_FILE = 'instances_registry.json';
const INSTANCE_SETTINGS_FILE = 'instance.json';
const SERVER_ICON_FILE = 'server-icon.png';
const DEFAULT_PORT = 25565;
const DEFAULT_MAX_PLAYERS = 20;
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
        // `mods` / `config` at the root are leftovers of mod routes run without an active instance.
        if ((id === 'mods' || id === 'config') && !fs.existsSync(path.join(dir, INSTANCE_SETTINGS_FILE))) continue;
        if (!this.isConfiguredDirectory(dir)) continue;
        list.push(this.inspectInstance(id, dir, false));
      }
    }

    // 2. Include registered external/imported instances
    for (const [id, data] of Object.entries(registry.importedInstances)) {
      if (fs.existsSync(data.path) && !list.some((inst) => inst.id === id)) {
        list.push(this.inspectInstance(id, data.path, true, data.name, data.createdAt));
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
    fs.mkdirSync(path.join(targetDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'config'), { recursive: true });

    const serverName = name?.trim() || safeId;
    const port = customSettings?.port ?? this.findNextAvailablePort(driver.summary.defaultPort);
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
      pzBranch: customSettings?.pzBranch,
      gameConfig: customSettings?.gameConfig
    };

    fs.writeFileSync(
      path.join(targetDir, INSTANCE_SETTINGS_FILE),
      JSON.stringify(settings, null, 2),
      'utf-8'
    );

    return this.inspectInstance(safeId, targetDir, false, serverName);
  }

  public updateInstanceSettings(id: string, patch: Partial<InstanceSettings>): InstanceInfo {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }

    const settingsPath = path.join(instance.dir, INSTANCE_SETTINGS_FILE);
    let currentSettings: InstanceSettings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        // Fallback to empty
      }
    }

    const merged: InstanceSettings = {
      ...currentSettings,
      ...patch
    };

    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');

    // Keep the game's own config file in sync with the instance settings (declared by the driver).
    const sync = driverRegistry.getDriver(merged.gameId || defaultGameId()).summary.configSync;
    if (sync && sync.format === 'properties') {
      const updates: Record<string, string | number | boolean> = {};
      if (patch.port !== undefined && sync.map.port) updates[sync.map.port] = patch.port;
      if (patch.motd !== undefined && sync.map.motd) updates[sync.map.motd] = patch.motd;
      if (patch.maxPlayers !== undefined && sync.map.maxPlayers) updates[sync.map.maxPlayers] = patch.maxPlayers;
      if (Object.keys(updates).length > 0) {
        PropertiesParser.updateFile(path.join(instance.dir, sync.file), updates);
      }
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
    const iconPath = path.join(instance.dir, SERVER_ICON_FILE);
    return fs.existsSync(iconPath) ? iconPath : null;
  }

  public saveInstanceIcon(id: string, buffer: Buffer): void {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }
    const iconPath = path.join(instance.dir, SERVER_ICON_FILE);
    fs.writeFileSync(iconPath, buffer);
  }

  public deleteInstanceIcon(id: string): void {
    const instance = this.getInstance(id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
    }
    const iconPath = path.join(instance.dir, SERVER_ICON_FILE);
    if (fs.existsSync(iconPath)) {
      fs.unlinkSync(iconPath);
    }
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

    return this.inspectInstance(id, resolvedPath, true, serverName);
  }

  private inspectInstance(
    id: string,
    dir: string,
    isImported: boolean,
    customName?: string,
    customCreatedAt?: string
  ): InstanceInfo {
    let settings: InstanceSettings = {};
    const settingsPath = path.join(dir, INSTANCE_SETTINGS_FILE);
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        // Fallback to empty
      }
    }

    const gameId = settings.gameId || defaultGameId();
    const driver = driverRegistry.getDriver(gameId);

    const configSync = driver.summary.configSync;
    const propsPath = configSync ? path.join(dir, configSync.file) : '';
    let port = settings.port ?? driver.summary.defaultPort ?? DEFAULT_PORT;
    let motd = settings.motd ?? id;
    let maxPlayers = settings.maxPlayers ?? driver.summary.defaultMaxPlayers ?? DEFAULT_MAX_PLAYERS;

    if (configSync && fs.existsSync(propsPath)) {
      const values = PropertiesParser.readValues(propsPath);
      const asNumber = (raw: string | undefined) => (raw !== undefined && raw !== '' && !isNaN(Number(raw)) ? Number(raw) : undefined);
      if (configSync.map.port) port = asNumber(values[configSync.map.port]) ?? port;
      if (configSync.map.motd && values[configSync.map.motd] !== undefined) motd = values[configSync.map.motd];
      if (configSync.map.maxPlayers) maxPlayers = asNumber(values[configSync.map.maxPlayers]) ?? maxPlayers;
    }

    const stat = fs.statSync(dir);
    const hasJar = driver.validateInstallation(dir);
    const hasIcon = fs.existsSync(path.join(dir, SERVER_ICON_FILE));

    return {
      id,
      name: settings.name || customName || (motd !== id ? motd : id),
      dir,
      port,
      motd,
      hasJar,
      hasIcon,
      isImported,
      createdAt: customCreatedAt || stat.birthtime.toISOString(),
      maxPlayers,
      minRamMb: settings.minRamMb ?? DEFAULT_MIN_RAM_MB,
      maxRamMb: settings.maxRamMb ?? DEFAULT_MAX_RAM_MB,
      jvmArgs: settings.jvmArgs ?? [],
      javaPath: settings.javaPath ?? '',
      forceSaveOnStop: settings.forceSaveOnStop ?? true,
      autostart: settings.autostart ?? false,
      favorite: settings.favorite ?? false,
      loader: settings.loader,
      loaderVersion: settings.loaderVersion,
      gameId,
      pzBranch: settings.pzBranch,
      gameConfig: settings.gameConfig,
      bridgeInstalled: TelemetryBridgeManager.isBridgeInstalled(dir),
      bridgeSupported: (driver.summary.bridgeLoaders ?? []).length > 0 && (!settings.loader || (driver.summary.bridgeLoaders ?? []).includes(settings.loader))
    };
  }

  private sanitizeInstanceId(raw: string): string {
    const sanitized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    if (!sanitized) {
      throw new DaemonError('INVALID_PAYLOAD', 'Instance ID must contain alphanumeric characters.');
    }
    return sanitized;
  }

  private findNextAvailablePort(basePort: number = DEFAULT_PORT): number {
    const instances = this.listInstances();
    const usedPorts = new Set(instances.map((i) => i.port));
    let candidate = basePort;
    while (usedPorts.has(candidate)) {
      candidate += 1;
    }
    return candidate;
  }

  private isConfiguredDirectory(dir: string): boolean {
    const settingsPath = path.join(dir, INSTANCE_SETTINGS_FILE);
    const propsPath = path.join(dir, 'server.properties');
    const jarPath = path.join(dir, 'server.jar');
    if (fs.existsSync(settingsPath) || fs.existsSync(propsPath) || fs.existsSync(jarPath)) {
      return true;
    }
    try {
      const files = fs.readdirSync(dir);
      return files.some((f) => f !== 'mods' && f !== 'config');
    } catch {
      return false;
    }
  }

  private ensureDefaultInstance(id: string): void {
    const dir = path.join(this.instancesBaseDir, id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
      const defaultSettings: InstanceSettings = {
        name: id,
        gameId: defaultGameId(),
        port: DEFAULT_PORT,
        maxPlayers: DEFAULT_MAX_PLAYERS,
        minRamMb: DEFAULT_MIN_RAM_MB,
        maxRamMb: DEFAULT_MAX_RAM_MB
      };
      fs.writeFileSync(
        path.join(dir, INSTANCE_SETTINGS_FILE),
        JSON.stringify(defaultSettings, null, 2),
        'utf-8'
      );
    }
  }

  private loadRegistry(): RegistryData {
    if (!fs.existsSync(this.registryFilePath)) {
      return { activeInstanceId: '', importedInstances: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.registryFilePath, 'utf-8'));
    } catch {
      return { activeInstanceId: '', importedInstances: {} };
    }
  }

  private saveRegistry(data: RegistryData): void {
    fs.writeFileSync(this.registryFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
