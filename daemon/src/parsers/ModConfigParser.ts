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

export type ConfigFormat = 'toml' | 'json' | 'text';

export interface ModConfigFile {
  format: ConfigFormat;
  /** Key/value rows (toml/json only, and only when the file parses). */
  entries: ModConfigEntry[];
  /** The file exactly as stored, for the text editor. */
  content: string;
}

/** Never listed: binary data a text editor cannot show. */
const BINARY_EXTENSIONS = new Set([
  '.jar', '.zip', '.gz', '.7z', '.rar', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.dat', '.dat_old',
  '.nbt', '.mca', '.db', '.sqlite', '.lock', '.class', '.so', '.dll', '.exe', '.bin', '.ogg', '.wav', '.mp3'
]);

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_CONFIG_DEPTH = 8;
const MAX_CONFIG_FILES = 2000;
const NUL = String.fromCharCode(0);
const SAMPLE_CONFIG_NAME = 'sample-mod.toml';

const formatOf = (relativePath: string): ConfigFormat => {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.toml')) return 'toml';
  if (lower.endsWith('.json')) return 'json';
  return 'text';
};

export class ModConfigParser {
  /** Every editable file under the config folder as a relative `/` path, in its folders (e.g. `sodium/options.json`). */
  public static listConfigs(workingDir: string, configFolder = 'config'): string[] {
    const configDir = path.join(workingDir, configFolder);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      this.createSampleConfig(configDir);
    }

    const files = this.collectFiles(configDir, '', 0);
    if (files.length === 0) {
      this.createSampleConfig(configDir);
      return [SAMPLE_CONFIG_NAME];
    }

    return files.sort((a, b) => a.localeCompare(b));
  }

  /** Same listing without touching the disk: `[]` when the config folder does not exist yet. */
  public static listExistingConfigs(workingDir: string, configFolder = 'config'): string[] {
    const configDir = path.join(workingDir, configFolder);
    return fs.existsSync(configDir) ? this.collectFiles(configDir, '', 0) : [];
  }

  public static readConfig(workingDir: string, rawPath: string, configFolder = 'config'): ModConfigFile {
    const { filePath, relative } = this.resolveFile(workingDir, rawPath, configFolder);
    if (fs.statSync(filePath).size > MAX_CONFIG_BYTES) {
      throw new DaemonError('INVALID_PAYLOAD', `Config file "${relative}" is too large to edit here.`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes(NUL)) {
      throw new DaemonError('INVALID_PAYLOAD', `Config file "${relative}" is not a text file.`);
    }

    const format = formatOf(relative);
    if (format === 'text') return { format, entries: [], content };

    try {
      return { format, entries: this.flattenObject(this.parseStructured(format, content)), content };
    } catch {
      // Not valid toml/json (comments in .json, half-written file...): still editable as text.
      return { format: 'text', entries: [], content };
    }
  }

  public static parseConfig(workingDir: string, rawPath: string, configFolder = 'config'): ModConfigEntry[] {
    const file = this.readConfig(workingDir, rawPath, configFolder);
    if (file.format === 'text') {
      throw new DaemonError('INTERNAL_ERROR', `Config file "${rawPath}" cannot be shown as key/value pairs.`);
    }
    return file.entries;
  }

  /** Applies edited values onto the parsed file, so keys the form does not show (arrays, nulls) survive. */
  public static saveConfig(workingDir: string, rawPath: string, rawUpdates: unknown, configFolder = 'config'): void {
    const { filePath, relative } = this.resolveFile(workingDir, rawPath, configFolder);
    const format = formatOf(relative);
    if (format === 'text') {
      throw new DaemonError('INVALID_FILENAME', `"${relative}" has no key/value form; save it as text.`);
    }

    const updates = parseConfigUpdates(rawUpdates);
    let document: Record<string, unknown>;
    try {
      document = this.parseStructured(format, fs.readFileSync(filePath, 'utf-8'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DaemonError('INTERNAL_ERROR', `Failed to parse config file "${relative}": ${msg}`);
    }

    this.applyUpdates(document, updates);
    const output = format === 'toml' ? toml.stringify(document as toml.JsonMap) : JSON.stringify(document, null, 2);
    fs.writeFileSync(filePath, output, 'utf-8');
  }

  public static saveConfigText(workingDir: string, rawPath: string, content: unknown, configFolder = 'config'): void {
    const { filePath, relative } = this.resolveFile(workingDir, rawPath, configFolder);
    if (typeof content !== 'string' || content.length > MAX_CONFIG_BYTES || content.includes(NUL)) {
      throw new DaemonError('INVALID_PAYLOAD', 'Expected the file content as text.');
    }

    // Files that already do not parse (json with comments...) are saved as typed; valid ones must stay valid.
    const format = this.readConfig(workingDir, rawPath, configFolder).format;
    if (format !== 'text') {
      try {
        this.parseStructured(format, content);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new DaemonError('INVALID_PAYLOAD', `"${relative}" is not valid ${format}: ${msg}`);
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /** Resolves a `/` relative path inside the config folder, refusing anything that escapes it. */
  public static resolveFile(
    workingDir: string,
    rawPath: string,
    configFolder = 'config'
  ): { filePath: string; relative: string } {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new DaemonError('INVALID_FILENAME', 'Filename is required.');
    }

    const relative = rawPath.trim().replace(/\\/g, '/');
    const segments = relative.split('/');
    if (path.isAbsolute(relative) || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new DaemonError('INVALID_FILENAME', 'Path traversal is not allowed in filename.');
    }
    if (BINARY_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      throw new DaemonError('INVALID_FILENAME', 'Binary files cannot be edited.');
    }

    const configDir = path.resolve(workingDir, configFolder);
    const filePath = path.resolve(configDir, ...segments);
    if (!filePath.startsWith(configDir + path.sep)) {
      throw new DaemonError('INVALID_FILENAME', 'Path traversal is not allowed in filename.');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Mod config file "${relative}" was not found.`);
    }

    return { filePath, relative };
  }

  private static collectFiles(directory: string, prefix: string, depth: number): string[] {
    if (depth > MAX_CONFIG_DEPTH) return [];

    const found: string[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (found.length >= MAX_CONFIG_FILES) break;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        found.push(...this.collectFiles(path.join(directory, entry.name), relative, depth + 1));
      } else if (entry.isFile() && this.isListable(path.join(directory, entry.name))) {
        found.push(relative);
      }
    }
    return found;
  }

  private static isListable(filePath: string): boolean {
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
    return fs.statSync(filePath).size <= MAX_CONFIG_BYTES;
  }

  private static parseStructured(format: Exclude<ConfigFormat, 'text'>, raw: string): Record<string, unknown> {
    const parsed = format === 'toml' ? toml.parse(raw) : JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('the root must be an object');
    }
    return parsed as Record<string, unknown>;
  }

  private static applyUpdates(document: Record<string, unknown>, updates: ConfigUpdates): void {
    for (const [key, value] of Object.entries(updates)) {
      const parts = key.split('.');
      let current = document;
      for (const part of parts.slice(0, -1)) {
        const next = current[part];
        if (next === null || typeof next !== 'object' || Array.isArray(next)) current[part] = Object.create(null);
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }
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

    fs.writeFileSync(path.join(configDir, SAMPLE_CONFIG_NAME), sample, 'utf-8');
  }
}
