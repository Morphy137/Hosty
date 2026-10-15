import fs from 'fs';
import path from 'path';
import { readConfigFile, resolveConfigPath, writeConfigFile, type EditableFormat } from './ConfigFileEditor';

export interface ConfigSyncSpec {
  file: string;
  format: Exclude<EditableFormat, 'lines'>;
  /** Setting -> key in the file. Dotted keys address nested JSON/TOML values and INI `section.key`. */
  map: { port?: string; motd?: string; maxPlayers?: string };
}

export interface SyncedValues {
  port?: number;
  motd?: string;
  maxPlayers?: number;
}

const toNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Reads the synced settings back from the game's config file; unreadable or missing files yield `{}`. */
export function readSyncedValues(instanceDir: string, sync: ConfigSyncSpec): SyncedValues {
  let entries: ReturnType<typeof readConfigFile>;
  try {
    entries = readConfigFile(resolveConfigPath(instanceDir, sync.file), sync.format);
  } catch {
    return {};
  }
  const byKey = new Map(entries.map((entry) => [entry.key, entry.value]));
  const read = (key: string | undefined) => (key ? byKey.get(key) : undefined);

  const motd = read(sync.map.motd);
  return {
    port: toNumber(read(sync.map.port)),
    motd: motd === undefined ? undefined : String(motd),
    maxPlayers: toNumber(read(sync.map.maxPlayers))
  };
}

const EMPTY_FILE: Record<ConfigSyncSpec['format'], string> = {
  properties: '',
  ini: '',
  toml: '',
  json: '{}\n'
};

/** Writes only the provided settings, preserving the rest of the file (comments and order for key=value formats). */
export function writeSyncedValues(instanceDir: string, sync: ConfigSyncSpec, patch: SyncedValues): void {
  const updates: Record<string, string | number> = {};
  if (patch.port !== undefined && sync.map.port) updates[sync.map.port] = patch.port;
  if (patch.motd !== undefined && sync.map.motd) updates[sync.map.motd] = patch.motd;
  if (patch.maxPlayers !== undefined && sync.map.maxPlayers) updates[sync.map.maxPlayers] = patch.maxPlayers;
  if (Object.keys(updates).length === 0) return;

  const file = resolveConfigPath(instanceDir, sync.file);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, EMPTY_FILE[sync.format], 'utf-8');
  }
  writeConfigFile(file, sync.format, updates, { createMissing: true });
}
