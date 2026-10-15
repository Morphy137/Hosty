import fs from 'fs';
import path from 'path';
import { ConfigUpdates, ConfigValue } from '../../parsers/configUpdates';

export interface PropertyItem {
  key: string;
  value: ConfigValue;
  type: 'boolean' | 'number' | 'string';
}

const PROPERTIES_FILE_NAME = 'server.properties';
const CRLF = '\r\n';
const LF = '\n';

interface ParsedLine {
  key: string;
  rawValue: string;
}

const parseLine = (line: string): ParsedLine | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return null;

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) return null;

  return {
    key: trimmed.slice(0, separatorIndex).trim(),
    rawValue: trimmed.slice(separatorIndex + 1).trim()
  };
};

const toPropertyItem = ({ key, rawValue }: ParsedLine): PropertyItem => {
  if (rawValue === 'true' || rawValue === 'false') {
    return { key, value: rawValue === 'true', type: 'boolean' };
  }
  if (rawValue !== '' && !isNaN(Number(rawValue))) {
    return { key, value: Number(rawValue), type: 'number' };
  }
  return { key, value: rawValue, type: 'string' };
};

const detectLineEnding = (content: string): string => (content.includes(CRLF) ? CRLF : LF);

export class PropertiesParser {
  public static parseFile(workingDir: string): PropertyItem[] {
    const filePath = path.join(workingDir, PROPERTIES_FILE_NAME);
    if (!fs.existsSync(filePath)) {
      this.createDefaultProperties(filePath);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split(/\r?\n/)
      .map(parseLine)
      .filter((parsed): parsed is ParsedLine => parsed !== null)
      .map(toPropertyItem);
  }

  /**
   * Applies updates in place, preserving comments, ordering and the original line endings.
   * Keys that do not exist yet are appended at the end of the file.
   */
  public static saveFile(workingDir: string, updates: ConfigUpdates): void {
    const filePath = path.join(workingDir, PROPERTIES_FILE_NAME);
    if (!fs.existsSync(filePath)) {
      this.createDefaultProperties(filePath);
    }
    this.updateFile(filePath, updates);
  }

  /** Reads `key=value` pairs of any properties-format file; a missing file yields an empty map. */
  public static readValues(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) return {};
    const values: Record<string, string> = {};
    for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
      const parsed = parseLine(line);
      if (parsed) values[parsed.key] = parsed.rawValue.trim();
    }
    return values;
  }

  /** Same in-place update as `saveFile`, for an explicit path (creates a minimal file when missing). */
  public static updateFile(filePath: string, updates: ConfigUpdates): void {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '', 'utf-8');
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lineEnding = detectLineEnding(content);
    const remainingKeys = new Set(Object.keys(updates));

    const updatedLines = content.split(/\r?\n/).map((line) => {
      const parsed = parseLine(line);
      if (!parsed || !Object.hasOwn(updates, parsed.key)) return line;

      remainingKeys.delete(parsed.key);
      return `${parsed.key}=${updates[parsed.key]}`;
    });

    // Drop the trailing empty element so appended keys don't leave a blank gap.
    const hadTrailingNewline = updatedLines.length > 0 && updatedLines[updatedLines.length - 1] === '';
    if (hadTrailingNewline) updatedLines.pop();

    for (const key of remainingKeys) {
      updatedLines.push(`${key}=${updates[key]}`);
    }

    fs.writeFileSync(filePath, updatedLines.join(lineEnding) + lineEnding, 'utf-8');
  }

  public static createDefaultProperties(
    filePath: string,
    options?: { port?: number; motd?: string; maxPlayers?: number }
  ): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const port = options?.port ?? 25565;
    const motd = options?.motd ?? 'MC-Nexus Local Server';
    const maxPlayers = options?.maxPlayers ?? 20;

    const defaults = [
      '# Minecraft server properties',
      'accepts-transfers=false',
      'allow-flight=false',
      'allow-nether=true',
      'broadcast-console-to-ops=true',
      'broadcast-rcon-to-ops=true',
      'bug-report-link=',
      'difficulty=normal',
      'enable-command-block=false',
      'enable-jmx-monitoring=false',
      'enable-query=false',
      'enable-rcon=false',
      'enable-status=true',
      'enforce-secure-profile=true',
      'enforce-whitelist=false',
      'entity-broadcast-range-percentage=100',
      'force-gamemode=false',
      'function-permission-level=2',
      'gamemode=survival',
      'generate-structures=true',
      'generator-settings={}',
      'hardcore=false',
      'hide-online-players=false',
      'initial-disabled-packs=',
      'initial-enabled-packs=vanilla',
      'level-name=world',
      'level-seed=',
      'level-type=minecraft\\:normal',
      'log-ips=true',
      'max-chained-neighbor-updates=1000000',
      `max-players=${maxPlayers}`,
      'max-tick-time=60000',
      'max-world-size=29999984',
      `motd=${motd}`,
      'network-compression-threshold=256',
      'online-mode=true',
      'op-permission-level=4',
      'player-idle-timeout=0',
      'prevent-proxy-connections=false',
      'pvp=true',
      `query.port=${port}`,
      'rate-limit=0',
      'rcon.password=',
      'rcon.port=25575',
      'region-file-compression=deflate',
      'require-resource-pack=false',
      'resource-pack=',
      'resource-pack-id=',
      'resource-pack-prompt=',
      'resource-pack-sha1=',
      'server-ip=',
      `server-port=${port}`,
      'simulation-distance=10',
      'spawn-animals=true',
      'spawn-monsters=true',
      'spawn-npcs=true',
      'spawn-protection=16',
      'sync-chunk-writes=true',
      'text-filtering-config=',
      'use-native-transport=true',
      'view-distance=10',
      'white-list=false'
    ].join(LF);

    fs.writeFileSync(filePath, defaults + LF, 'utf-8');
  }
}