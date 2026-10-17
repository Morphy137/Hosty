import { DaemonError } from '../errors';
import { readJsonFile, writeJsonAtomic } from './JsonStore';

/** Defaults applied to servers created from now on (Settings > Servers). Existing servers keep theirs. */
export interface AppSettings {
  /** Memory for new servers; null lets each game decide (its manifest default or a size from system RAM). */
  defaultMemoryMb: number | null;
  /** Java executable for new servers; empty uses the detected/default `java`. */
  defaultJavaPath: string;
  /** New servers start when Hosty starts. */
  defaultAutostart: boolean;
}

export const APP_SETTINGS_FILE = 'app-settings.json';
export const MEMORY_LIMITS_MB = { min: 512, max: 65_536 } as const;
const MAX_JAVA_PATH_LENGTH = 1024;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultMemoryMb: null,
  defaultJavaPath: '',
  defaultAutostart: false
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validMemory(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= MEMORY_LIMITS_MB.min &&
      value <= MEMORY_LIMITS_MB.max)
  );
}

/** Keeps the valid fields of a stored file; anything else falls back to its default. */
function sanitize(raw: unknown): AppSettings {
  const source = isRecord(raw) ? raw : {};
  return {
    defaultMemoryMb: validMemory(source.defaultMemoryMb) ? source.defaultMemoryMb : DEFAULT_APP_SETTINGS.defaultMemoryMb,
    defaultJavaPath:
      typeof source.defaultJavaPath === 'string' && source.defaultJavaPath.length <= MAX_JAVA_PATH_LENGTH
        ? source.defaultJavaPath.trim()
        : DEFAULT_APP_SETTINGS.defaultJavaPath,
    defaultAutostart:
      typeof source.defaultAutostart === 'boolean' ? source.defaultAutostart : DEFAULT_APP_SETTINGS.defaultAutostart
  };
}

/** Validates a PATCH body strictly: unknown keys or wrong types are rejected instead of ignored. */
export function parseAppSettingsPatch(body: unknown): Partial<AppSettings> {
  if (!isRecord(body)) throw new DaemonError('INVALID_PAYLOAD', 'Settings must be an object.');
  const patch: Partial<AppSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    switch (key) {
      case 'defaultMemoryMb':
        if (!validMemory(value)) {
          throw new DaemonError(
            'INVALID_PAYLOAD',
            `defaultMemoryMb must be null or an integer between ${MEMORY_LIMITS_MB.min} and ${MEMORY_LIMITS_MB.max}.`
          );
        }
        patch.defaultMemoryMb = value;
        break;
      case 'defaultJavaPath':
        if (typeof value !== 'string' || value.length > MAX_JAVA_PATH_LENGTH) {
          throw new DaemonError('INVALID_PAYLOAD', 'defaultJavaPath must be a string.');
        }
        patch.defaultJavaPath = value.trim();
        break;
      case 'defaultAutostart':
        if (typeof value !== 'boolean') throw new DaemonError('INVALID_PAYLOAD', 'defaultAutostart must be a boolean.');
        patch.defaultAutostart = value;
        break;
      default:
        throw new DaemonError('INVALID_PAYLOAD', `Unknown setting "${key}".`);
    }
  }
  return patch;
}

/** App-wide settings persisted next to the instances registry. */
export class AppSettingsStore {
  private settings: AppSettings;

  constructor(private readonly filePath: string) {
    const stored = readJsonFile<unknown>(filePath);
    this.settings = stored.status === 'ok' ? sanitize(stored.value) : { ...DEFAULT_APP_SETTINGS };
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = sanitize({ ...this.settings, ...patch });
    writeJsonAtomic(this.filePath, this.settings);
    return this.get();
  }
}
