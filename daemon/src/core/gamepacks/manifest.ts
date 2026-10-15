/**
 * Game pack manifest (`hosty-game.json`), API version 1.
 * The published, documented copy of these types lives in `packages/game-sdk`; keep them in sync.
 */

export const GAME_PACK_API_VERSION = 1;

export type LocalizedText = string | Record<string, string>;

export type PlatformValue = string | { win32?: string; linux?: string; darwin?: string; default?: string };

export type ManifestSetupField = {
  id: string;
  type: 'select' | 'text' | 'secret' | 'number' | 'toggle';
  label: LocalizedText;
  description?: LocalizedText;
  options?: Array<{ value: string; label: LocalizedText }>;
  default?: string | number | boolean;
  required?: boolean;
};

export type ConfigFormat = 'properties' | 'ini' | 'json' | 'toml' | 'lines';

export interface ManifestConfigFile {
  path: string;
  format: ConfigFormat;
  label?: LocalizedText;
}

export type ProvisionSpec = { type: 'none' } | { type: 'steamcmd'; appId: number };

export interface GameCapabilities {
  players: boolean;
  mods: boolean;
  configEditor: boolean;
  bridge: boolean;
}

export interface GameManifest {
  apiVersion: 1;
  id: string;
  name: string;
  version: string;
  logo?: string;
  description?: LocalizedText;
  badge?: string;
  category?: 'voxel' | 'survival' | 'sandbox';
  status?: 'available' | 'beta' | 'coming_soon';
  defaults: { port: number; maxPlayers: number };
  provision?: ProvisionSpec;
  launch: {
    /** `native` runs the executable directly; `java` runs it as `java -jar <executable>` with RAM flags. */
    runtime?: 'native' | 'java';
    executable: PlatformValue;
    args?: string[];
  };
  /** Files whose presence marks a valid installation (also used to recognise imported folders). */
  detect?: string[];
  logs?: {
    ready?: string | string[];
    /** Must expose the player name as the named group `username` (or capture group 1). */
    join?: string | string[];
    leave?: string | string[];
    /** Dimension / world label shown for players joined through log parsing. */
    dimension?: string;
  };
  commands?: { stop?: string; save?: string | null };
  configFiles?: ManifestConfigFile[];
  setup?: ManifestSetupField[];
  capabilities?: Partial<GameCapabilities>;
  modFormat?: string;
  /** Extra translations merged into the UI: `{ en: { "my.key": "..." } }`. */
  i18n?: Record<string, Record<string, string>>;
}

export interface ManifestValidation {
  ok: boolean;
  errors: string[];
  manifest?: GameManifest;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const FIELD_TYPES = new Set(['select', 'text', 'secret', 'number', 'toggle']);
const CONFIG_FORMATS = new Set<ConfigFormat>(['properties', 'ini', 'json', 'toml', 'lines']);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLocalized = (value: unknown): boolean =>
  typeof value === 'string' ||
  (isObject(value) && Object.values(value).every((entry) => typeof entry === 'string'));

const isStringList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isPlatformValue = (value: unknown): boolean =>
  typeof value === 'string' ||
  (isObject(value) && Object.values(value).every((entry) => typeof entry === 'string'));

const isSafeRelativePath = (value: unknown): boolean =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.startsWith('/') &&
  !/^[a-zA-Z]:/.test(value) &&
  !value.split(/[\\/]/).includes('..');

const checkPatterns = (label: string, value: unknown, errors: string[]): void => {
  if (value === undefined) return;
  const list = typeof value === 'string' ? [value] : value;
  if (!isStringList(list)) {
    errors.push(`${label} must be a regular expression string or a list of strings`);
    return;
  }
  for (const pattern of list as string[]) {
    try {
      new RegExp(pattern, 'i');
    } catch {
      errors.push(`${label} contains an invalid regular expression: ${pattern}`);
    }
  }
};

/** Validates untrusted JSON against the manifest contract and returns every problem found. */
export function validateManifest(raw: unknown): ManifestValidation {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['The manifest must be a JSON object'] };

  if (raw.apiVersion !== GAME_PACK_API_VERSION) {
    errors.push(`apiVersion must be ${GAME_PACK_API_VERSION} (got ${JSON.stringify(raw.apiVersion)})`);
  }
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
    errors.push('id must be 2-40 chars of lowercase letters, digits and dashes');
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('name is required');
  if (typeof raw.version !== 'string' || !raw.version.trim()) errors.push('version is required');
  if (raw.logo !== undefined && !isSafeRelativePath(raw.logo)) errors.push('logo must be a relative path inside the pack');
  if (raw.description !== undefined && !isLocalized(raw.description)) errors.push('description must be text or a language map');
  if (raw.status !== undefined && !['available', 'beta', 'coming_soon'].includes(String(raw.status))) {
    errors.push('status must be available, beta or coming_soon');
  }

  const defaults = raw.defaults;
  if (
    !isObject(defaults) ||
    !Number.isInteger(defaults.port) ||
    (defaults.port as number) < 1 ||
    (defaults.port as number) > 65535 ||
    !Number.isInteger(defaults.maxPlayers) ||
    (defaults.maxPlayers as number) < 1
  ) {
    errors.push('defaults.port (1-65535) and defaults.maxPlayers (>= 1) are required integers');
  }

  const launch = raw.launch;
  if (!isObject(launch) || !isPlatformValue(launch.executable) || launch.executable === '') {
    errors.push('launch.executable is required');
  } else {
    if (launch.args !== undefined && !isStringList(launch.args)) errors.push('launch.args must be a list of strings');
    if (launch.runtime !== undefined && !['native', 'java'].includes(String(launch.runtime))) {
      errors.push('launch.runtime must be native or java');
    }
  }

  if (raw.provision !== undefined) {
    const provision = raw.provision;
    const valid =
      isObject(provision) &&
      (provision.type === 'none' || (provision.type === 'steamcmd' && Number.isInteger(provision.appId)));
    if (!valid) errors.push('provision must be { "type": "none" } or { "type": "steamcmd", "appId": <number> }');
  }

  if (raw.detect !== undefined && !(isStringList(raw.detect) && (raw.detect as string[]).every(isSafeRelativePath))) {
    errors.push('detect must be a list of relative file paths');
  }

  if (raw.logs !== undefined) {
    if (!isObject(raw.logs)) {
      errors.push('logs must be an object');
    } else {
      checkPatterns('logs.ready', raw.logs.ready, errors);
      checkPatterns('logs.join', raw.logs.join, errors);
      checkPatterns('logs.leave', raw.logs.leave, errors);
      if (raw.logs.dimension !== undefined && typeof raw.logs.dimension !== 'string') errors.push('logs.dimension must be a string');
    }
  }

  if (raw.configFiles !== undefined) {
    const files = raw.configFiles;
    if (
      !Array.isArray(files) ||
      !files.every((file) => isObject(file) && isSafeRelativePath(file.path) && CONFIG_FORMATS.has(file.format as ConfigFormat))
    ) {
      errors.push('configFiles must be a list of { path (relative), format (properties|ini|json|toml|lines) }');
    }
  }

  if (raw.setup !== undefined) {
    const fields = raw.setup;
    if (
      !Array.isArray(fields) ||
      !fields.every(
        (field) =>
          isObject(field) && typeof field.id === 'string' && FIELD_TYPES.has(String(field.type)) && isLocalized(field.label)
      )
    ) {
      errors.push('setup must be a list of { id, type, label }');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], manifest: raw as unknown as GameManifest };
}
