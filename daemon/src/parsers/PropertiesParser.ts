import fs from 'fs';
import path from 'path';
import { ConfigUpdates, ConfigValue } from './configUpdates';

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

  private static createDefaultProperties(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const defaults = [
      '# Minecraft server properties',
      'motd=MC-Nexus Local Server',
      'server-port=25565',
      'max-players=20',
      'online-mode=true',
      'pvp=true',
      'difficulty=normal',
      'gamemode=survival',
      'view-distance=10',
      'simulation-distance=10',
      'allow-flight=false',
      'white-list=false',
      'spawn-protection=16'
    ].join(LF);
    fs.writeFileSync(filePath, defaults + LF, 'utf-8');
  }
}