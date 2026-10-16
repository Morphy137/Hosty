import fs from 'fs';
import { DaemonError } from '../errors';
import { readConfigFile, resolveConfigPath, writeConfigFile, type EditableFormat } from './ConfigFileEditor';
import { renderTemplate } from './gamepacks/DeclarativeDriver';
import type { PlayerListSpec } from './gamepacks/manifest';
import { writeJsonAtomic } from './JsonStore';

export type DetailValue = string | number | boolean;

export interface PlayerListEntry {
  value: string;
  details: Record<string, DetailValue>;
}

export interface PlayerListState {
  id: string;
  entries: PlayerListEntry[];
  /** Whether the list is enforced, for lists with a `toggle`; null when it cannot be read yet. */
  enabled: boolean | null;
  /** The file exists but could not be parsed. */
  unreadable: boolean;
}

const PLAYER_VALUE = /^[A-Za-z0-9_.-]{1,64}$/;
const IP_VALUE = /^[0-9A-Fa-f:.]{2,45}$/;
const MAX_REASON_LENGTH = 200;

/** Checks a value typed by the user against the list's type; returns it trimmed. */
export function validateListValue(spec: PlayerListSpec, raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const pattern = spec.valueType === 'ip' ? IP_VALUE : PLAYER_VALUE;
  if (!pattern.test(value)) {
    throw new DaemonError('INVALID_PAYLOAD', spec.valueType === 'ip' ? 'Enter a valid IP address.' : 'Enter a valid player name.');
  }
  return value;
}

/** One-line, length-limited reason (it ends up on the game's command line). */
export function sanitizeReason(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_REASON_LENGTH) : '';
}

export function renderListCommand(template: string, value: string, reason = ''): string {
  return renderTemplate(template, { value, reason }).trim();
}

const readEntries = (file: string): { entries: Array<Record<string, unknown>>; unreadable: boolean } => {
  if (!fs.existsSync(file)) return { entries: [], unreadable: false };
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8') || '[]');
    return Array.isArray(parsed)
      ? { entries: parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'), unreadable: false }
      : { entries: [], unreadable: true };
  } catch {
    return { entries: [], unreadable: true };
  }
};

const isDetail = (value: unknown): value is DetailValue =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** Reads one list (and its enforcement switch) from the server folder. */
export function readPlayerList(
  instanceDir: string,
  spec: PlayerListSpec,
  configFormats: Record<string, EditableFormat>
): PlayerListState {
  const { entries, unreadable } = readEntries(resolveConfigPath(instanceDir, spec.file));
  return {
    id: spec.id,
    unreadable,
    enabled: spec.toggle ? readToggle(instanceDir, spec.toggle, configFormats) : null,
    entries: entries
      .filter((entry) => typeof entry[spec.key] === 'string')
      .map((entry) => ({
        value: entry[spec.key] as string,
        details: Object.fromEntries(
          (spec.details ?? []).filter((field) => isDetail(entry[field])).map((field) => [field, entry[field] as DetailValue])
        )
      }))
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }))
  };
}

function readToggle(
  instanceDir: string,
  toggle: NonNullable<PlayerListSpec['toggle']>,
  configFormats: Record<string, EditableFormat>
): boolean | null {
  const format = configFormats[toggle.configFile];
  const file = resolveConfigPath(instanceDir, toggle.configFile);
  if (!format || !fs.existsSync(file)) return null;
  const entry = readConfigFile(file, format).find((candidate) => candidate.key === toggle.key);
  if (!entry) return false;
  return entry.value === true || String(entry.value).toLowerCase() === 'true';
}

/** Removes an entry from the list file while the server is stopped. Returns false when it was not listed. */
export function removeFromListFile(instanceDir: string, spec: PlayerListSpec, value: string): boolean {
  const file = resolveConfigPath(instanceDir, spec.file);
  const { entries, unreadable } = readEntries(file);
  if (unreadable) throw new DaemonError('INVALID_PAYLOAD', `${spec.file} could not be read.`);
  const wanted = value.toLowerCase();
  const kept = entries.filter((entry) => String(entry[spec.key] ?? '').toLowerCase() !== wanted);
  if (kept.length === entries.length) return false;
  writeJsonAtomic(file, kept);
  return true;
}

/** Writes the enforcement switch into its config file while the server is stopped. */
export function writeToggle(
  instanceDir: string,
  spec: PlayerListSpec,
  enabled: boolean,
  configFormats: Record<string, EditableFormat>
): void {
  if (!spec.toggle) throw new DaemonError('INVALID_PAYLOAD', 'This list cannot be switched on or off.');
  const format = configFormats[spec.toggle.configFile];
  if (!format) throw new DaemonError('INVALID_FILENAME', `${spec.toggle.configFile} is not a declared config file.`);
  writeConfigFile(resolveConfigPath(instanceDir, spec.toggle.configFile), format, { [spec.toggle.key]: enabled }, { createMissing: true });
}
