import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';
import { PropertiesParser } from '../parsers/PropertiesParser';

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
  loader?: string;
  loaderVersion?: string;
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
  loader?: string;
  loaderVersion?: string;
}

interface RegistryData {
  activeInstanceId: string;
  importedInstances: Record<string, { name: string; path: string; createdAt: string }>;
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

  constructor(instancesBaseDir: string, defaultInstanceId = 'default') {
    this.instancesBaseDir = path.resolve(instancesBaseDir);
    this.registryFilePath = path.join(this.instancesBaseDir, REGISTRY_FILE);
    fs.mkdirSync(this.instancesBaseDir, { recursive: true });

    const registry = this.loadRegistry();
    this.activeId = registry.activeInstanceId || defaultInstanceId;
    this.ensureDefaultInstance(defaultInstanceId);
  }

  public getActiveInstanceId(): string {
    return this.activeId;
  }

  public getActiveInstanceDir(): string {
    const instance = this.getInstance(this.activeId);
    if (!instance) {
      return path.join(this.instancesBaseDir, 'default');
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

    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'config'), { recursive: true });

    const serverName = name?.trim() || safeId;
    const port = customSettings?.port ?? this.findNextAvailablePort();
    const motd = customSettings?.motd ?? `MC-Nexus - ${serverName}`;
    const maxPlayers = customSettings?.maxPlayers ?? DEFAULT_MAX_PLAYERS;

    // Create default server.properties with next free port and complete standard schema
    PropertiesParser.createDefaultProperties(path.join(targetDir, 'server.properties'), {
      port,
      motd,
      maxPlayers
    });

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
      loaderVersion: customSettings?.loaderVersion
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

    // Also sync to server.properties if port, motd, or maxPlayers were modified
    const propsUpdates: Record<string, string | number | boolean> = {};
    if (patch.port !== undefined) propsUpdates['server-port'] = patch.port;
    if (patch.motd !== undefined) propsUpdates['motd'] = patch.motd;
    if (patch.maxPlayers !== undefined) propsUpdates['max-players'] = patch.maxPlayers;

    if (Object.keys(propsUpdates).length > 0) {
      PropertiesParser.saveFile(instance.dir, propsUpdates);
    }

    return this.getInstance(id)!;
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

  public importInstance(externalPath: string, name?: string): InstanceInfo {
    const resolvedPath = path.resolve(externalPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Directory "${resolvedPath}" does not exist.`);
    }

    const folderName = path.basename(resolvedPath);
    const id = this.sanitizeInstanceId(folderName);
    const serverName = name?.trim() || folderName;

    const registry = this.loadRegistry();
    registry.importedInstances[id] = {
      name: serverName,
      path: resolvedPath,
      createdAt: new Date().toISOString()
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

    const propsPath = path.join(dir, 'server.properties');
    let port = settings.port ?? DEFAULT_PORT;
    let motd = settings.motd ?? id;
    let maxPlayers = settings.maxPlayers ?? DEFAULT_MAX_PLAYERS;

    if (fs.existsSync(propsPath)) {
      try {
        const raw = fs.readFileSync(propsPath, 'utf-8');
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith('server-port=')) {
            const p = Number(trimmed.split('=')[1]);
            if (!isNaN(p)) port = p;
          } else if (trimmed.startsWith('motd=')) {
            motd = trimmed.slice('motd='.length).trim();
          } else if (trimmed.startsWith('max-players=')) {
            const mp = Number(trimmed.split('=')[1]);
            if (!isNaN(mp)) maxPlayers = mp;
          }
        }
      } catch {
        // Fallback to defaults
      }
    }

    const stat = fs.statSync(dir);
    const hasJar = fs.existsSync(path.join(dir, 'server.jar'));
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
      loader: settings.loader,
      loaderVersion: settings.loaderVersion
    };
  }

  private sanitizeInstanceId(raw: string): string {
    const sanitized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    if (!sanitized) {
      throw new DaemonError('INVALID_PAYLOAD', 'Instance ID must contain alphanumeric characters.');
    }
    return sanitized;
  }

  private findNextAvailablePort(): number {
    const instances = this.listInstances();
    const usedPorts = new Set(instances.map((i) => i.port));
    let candidate = DEFAULT_PORT;
    while (usedPorts.has(candidate)) {
      candidate += 1;
    }
    return candidate;
  }

  private ensureDefaultInstance(id: string): void {
    const dir = path.join(this.instancesBaseDir, id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    }
  }

  private loadRegistry(): RegistryData {
    if (!fs.existsSync(this.registryFilePath)) {
      return { activeInstanceId: 'default', importedInstances: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.registryFilePath, 'utf-8'));
    } catch {
      return { activeInstanceId: 'default', importedInstances: {} };
    }
  }

  private saveRegistry(data: RegistryData): void {
    fs.writeFileSync(this.registryFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
