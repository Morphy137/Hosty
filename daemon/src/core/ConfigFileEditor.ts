import fs from 'fs';
import path from 'path';
import TOML from '@iarna/toml';
import { DaemonError } from '../errors';

export type EditableFormat = 'properties' | 'ini' | 'json' | 'toml' | 'lines';
export type ConfigScalar = string | number | boolean;

export interface ConfigEntry {
  key: string;
  value: ConfigScalar;
  type: 'boolean' | 'number' | 'string';
}

const entryType = (value: ConfigScalar): ConfigEntry['type'] =>
  typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';

const coerce = (raw: string): ConfigScalar => {
  const trimmed = raw.trim();
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return raw;
};

/** Resolves a declared config file inside an instance, refusing anything that escapes it. */
export function resolveConfigPath(instanceDir: string, relative: string): string {
  const base = path.resolve(instanceDir);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new DaemonError('INVALID_FILENAME', `Config path "${relative}" is outside the server folder.`);
  }
  return target;
}

// ---- properties / ini (line based so comments, order and sections survive edits) -----------------

interface KeyValueLine {
  index: number;
  section: string;
  key: string;
  value: string;
}

const SECTION = /^\s*\[([^\]]+)\]\s*$/;

function scanKeyValues(lines: string[]): KeyValueLine[] {
  const found: KeyValueLine[] = [];
  let section = '';
  lines.forEach((line, index) => {
    const sectionMatch = SECTION.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      return;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')) return;
    const separator = line.indexOf('=');
    if (separator <= 0) return;
    found.push({ index, section, key: line.slice(0, separator).trim(), value: line.slice(separator + 1) });
  });
  return found;
}

const displayKey = (item: KeyValueLine) => (item.section ? `${item.section}.${item.key}` : item.key);

function readKeyValueFile(content: string): ConfigEntry[] {
  return scanKeyValues(content.split(/\r?\n/)).map((item) => {
    const value = coerce(item.value);
    return { key: displayKey(item), value, type: entryType(value) };
  });
}

function writeKeyValueFile(content: string, updates: Record<string, ConfigScalar>): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const remaining = new Map(Object.entries(updates));

  for (const item of scanKeyValues(lines)) {
    const name = displayKey(item);
    if (remaining.has(name)) {
      lines[item.index] = `${item.key}=${String(remaining.get(name))}`;
      remaining.delete(name);
    }
  }
  // Unknown keys are appended at the end (top-level only) instead of being silently dropped.
  for (const [key, value] of remaining) {
    if (!key.includes('.')) lines.push(`${key}=${String(value)}`);
  }
  return lines.join(eol);
}

// ---- json / toml (flattened to dot paths) --------------------------------------------------------

function flatten(value: unknown, prefix = ''): ConfigEntry[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const entries: ConfigEntry[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') {
      entries.push({ key: name, value: child, type: entryType(child) });
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      entries.push(...flatten(child, name));
    }
  }
  return entries;
}

/** Sets a dotted path. Editing never creates structure; `createMissing` (config sync) does. */
function setByPath(target: Record<string, unknown>, dotted: string, value: ConfigScalar, createMissing = false): void {
  const parts = dotted.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    let next = cursor[parts[i]];
    if (next === undefined && createMissing) {
      next = {};
      cursor[parts[i]] = next;
    }
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return;
    cursor = next as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (leaf in cursor || createMissing) cursor[leaf] = value;
}

// ---- public API ----------------------------------------------------------------------------------

export function readConfigFile(file: string, format: EditableFormat): ConfigEntry[] {
  if (!fs.existsSync(file)) throw new DaemonError('CONFIG_NOT_FOUND', `Config file "${path.basename(file)}" does not exist yet.`);
  const content = fs.readFileSync(file, 'utf-8');

  switch (format) {
    case 'properties':
    case 'ini':
      return readKeyValueFile(content);
    case 'json':
      try {
        return flatten(JSON.parse(content));
      } catch (error) {
        throw new DaemonError('INVALID_PAYLOAD', `Invalid JSON in ${path.basename(file)}: ${(error as Error).message}`);
      }
    case 'toml':
      try {
        return flatten(TOML.parse(content));
      } catch (error) {
        throw new DaemonError('INVALID_PAYLOAD', `Invalid TOML in ${path.basename(file)}: ${(error as Error).message}`);
      }
    default:
      throw new DaemonError('INVALID_PAYLOAD', `Files in "${format}" format cannot be edited here.`);
  }
}

export function writeConfigFile(
  file: string,
  format: EditableFormat,
  updates: Record<string, ConfigScalar>,
  options: { createMissing?: boolean } = {}
): void {
  if (!fs.existsSync(file)) throw new DaemonError('CONFIG_NOT_FOUND', `Config file "${path.basename(file)}" does not exist yet.`);
  const content = fs.readFileSync(file, 'utf-8');

  switch (format) {
    case 'properties':
    case 'ini':
      fs.writeFileSync(file, writeKeyValueFile(content, updates), 'utf-8');
      return;
    case 'json': {
      const data = JSON.parse(content) as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) setByPath(data, key, value, options.createMissing);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
      return;
    }
    case 'toml': {
      const data = TOML.parse(content) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) setByPath(data, key, value, options.createMissing);
      fs.writeFileSync(file, TOML.stringify(data as TOML.JsonMap), 'utf-8');
      return;
    }
    default:
      throw new DaemonError('INVALID_PAYLOAD', `Files in "${format}" format cannot be edited here.`);
  }
}
