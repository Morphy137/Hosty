import fs from 'fs';
import path from 'path';
import toml from '@iarna/toml';

export interface ModConfigEntry {
  key: string;
  value: string | number | boolean;
  type: 'boolean' | 'number' | 'string';
}

export class ModConfigParser {
  public static listConfigs(workingDir: string): string[] {
    const configDir = path.join(workingDir, 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      this.createSampleConfig(configDir);
    }

    const files = fs.readdirSync(configDir).filter(
      (f) => f.endsWith('.toml') || f.endsWith('.json')
    );

    if (files.length === 0) {
      this.createSampleConfig(configDir);
      return ['sample-mod.toml'];
    }

    return files;
  }

  public static parseConfig(workingDir: string, filename: string): ModConfigEntry[] {
    const safeName = path.basename(filename);
    const filePath = path.join(workingDir, 'config', safeName);
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = safeName.endsWith('.toml') ? toml.parse(raw) : JSON.parse(raw);

    return this.flattenObject(parsed);
  }

  public static saveConfig(
    workingDir: string,
    filename: string,
    updates: Record<string, string | number | boolean>
  ): void {
    const safeName = path.basename(filename);
    const filePath = path.join(workingDir, 'config', safeName);
    const nested = this.unflattenObject(updates);

    const output = safeName.endsWith('.toml')
      ? toml.stringify(nested as toml.JsonMap)
      : JSON.stringify(nested, null, 2);

    fs.writeFileSync(filePath, output, 'utf-8');
  }

  private static flattenObject(obj: Record<string, any>, prefix = ''): ModConfigEntry[] {
    let entries: ModConfigEntry[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        entries = entries.concat(this.flattenObject(v, fullKey));
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

  private static unflattenObject(flat: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
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