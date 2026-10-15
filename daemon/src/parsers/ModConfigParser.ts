import fs from 'fs';
import path from 'path';
import toml from '@iarna/toml';
import { DaemonError } from '../errors';
import { ConfigUpdates, ConfigValue, parseConfigUpdates } from './configUpdates';

export interface ModConfigEntry {
  key: string;
  value: ConfigValue;
  type: 'boolean' | 'number' | 'string';
}

const ALLOWED_EXTENSIONS = ['.toml', '.json'] as const;

export class ModConfigParser {
  public static listConfigs(workingDir: string, configFolder = 'config'): string[] {
    const configDir = path.join(workingDir, configFolder);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      this.createSampleConfig(configDir);
    }

    const files = fs
      .readdirSync(configDir)
      .filter((file) => ALLOWED_EXTENSIONS.some((ext) => file.endsWith(ext)));

    if (files.length === 0) {
      this.createSampleConfig(configDir);
      return ['sample-mod.toml'];
    }

    return files;
  }

  public static parseConfig(workingDir: string, rawFilename: string, configFolder = 'config'): ModConfigEntry[] {
    const safeFilename = this.validateFilename(rawFilename);
    const filePath = path.join(workingDir, configFolder, safeFilename);
    if (!fs.existsSync(filePath)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Mod config file "${safeFilename}" was not found.`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    try {
      const parsed = safeFilename.endsWith('.toml') ? toml.parse(raw) : JSON.parse(raw);
      return this.flattenObject(parsed as Record<string, unknown>);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DaemonError('INTERNAL_ERROR', `Failed to parse config file "${safeFilename}": ${msg}`);
    }
  }

  public static saveConfig(
    workingDir: string,
    rawFilename: string,
    rawUpdates: unknown,
    configFolder = 'config'
  ): void {
    const safeFilename = this.validateFilename(rawFilename);
    const updates = parseConfigUpdates(rawUpdates);
    const filePath = path.join(workingDir, configFolder, safeFilename);

    if (!fs.existsSync(filePath)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Mod config file "${safeFilename}" was not found.`);
    }

    const nested = this.unflattenObject(updates);
    const output = safeFilename.endsWith('.toml')
      ? toml.stringify(nested as toml.JsonMap)
      : JSON.stringify(nested, null, 2);

    fs.writeFileSync(filePath, output, 'utf-8');
  }

  public static validateFilename(rawFilename: string): string {
    if (!rawFilename || typeof rawFilename !== 'string') {
      throw new DaemonError('INVALID_FILENAME', 'Filename is required.');
    }

    const base = path.basename(rawFilename.trim());
    if (base !== rawFilename.trim() || base.includes('..') || /[/\\]/.test(rawFilename)) {
      throw new DaemonError('INVALID_FILENAME', 'Path traversal is not allowed in filename.');
    }

    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => base.endsWith(ext));
    if (!hasValidExt) {
      throw new DaemonError(
        'INVALID_FILENAME',
        `Unsupported config format. Only ${ALLOWED_EXTENSIONS.join(', ')} are supported.`
      );
    }

    return base;
  }

  private static flattenObject(obj: Record<string, unknown>, prefix = ''): ModConfigEntry[] {
    let entries: ModConfigEntry[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        entries = entries.concat(this.flattenObject(v as Record<string, unknown>, fullKey));
      } else if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
        entries.push({
          key: fullKey,
          value: v,
          type: typeof v as 'boolean' | 'number' | 'string'
        });
      }
    }
    return entries;
  }

  private static unflattenObject(flat: ConfigUpdates): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      let current: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = Object.create(null);
        }
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }
    return result;
  }

  private static createSampleConfig(configDir: string): void {
    const sample = [
      '[general]',
      'enableAutoBackup = true',
      'backupIntervalMinutes = 45',
      'welcomeMessage = "Welcome to MC-Nexus Server"',
      '',
      '[worldgen]',
      'customStructures = true',
      'dungeonDensity = 1.5',
      '',
      '[optimization]',
      'maxEntityCollisions = 8',
      'asyncChunkLoading = true'
    ].join('\n');

    fs.writeFileSync(path.join(configDir, 'sample-mod.toml'), sample, 'utf-8');
  }
}