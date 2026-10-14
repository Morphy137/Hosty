import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';
import { PropertiesParser } from '../parsers/PropertiesParser';

export interface InstanceInfo {
  id: string;
  name: string;
  dir: string;
  port: number;
  motd: string;
  hasJar: boolean;
  isImported: boolean;
  createdAt: string;
}

interface RegistryData {
  activeInstanceId: string;
  importedInstances: Record<string, { name: string; path: string; createdAt: string }>;
}

const REGISTRY_FILE = 'instances_registry.json';
const DEFAULT_PORT = 25565;

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

  public createInstance(id: string, name?: string): InstanceInfo {
    const safeId = this.sanitizeInstanceId(id);
    const targetDir = path.join(this.instancesBaseDir, safeId);

    if (fs.existsSync(targetDir)) {
      throw new DaemonError('INVALID_PAYLOAD', `Instance "${safeId}" already exists.`);
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'config'), { recursive: true });

    // Create default server.properties with next free port and complete standard schema
    const port = this.findNextAvailablePort();
    const serverName = name?.trim() || safeId;
    PropertiesParser.createDefaultProperties(path.join(targetDir, 'server.properties'), {
      port,
      motd: `MC-Nexus - ${serverName}`
    });

    return this.inspectInstance(safeId, targetDir, false, serverName);
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
    const propsPath = path.join(dir, 'server.properties');
    let port = DEFAULT_PORT;
    let motd = id;

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
          }
        }
      } catch {
        // Fallback to defaults
      }
    }

    const stat = fs.statSync(dir);
    const hasJar = fs.existsSync(path.join(dir, 'server.jar'));

    return {
      id,
      name: customName || (motd !== id ? motd : id),
      dir,
      port,
      motd,
      hasJar,
      isImported,
      createdAt: customCreatedAt || stat.birthtime.toISOString()
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
