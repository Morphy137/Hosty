/**
 * Game pack manifest (`hosty-game.json`), API version 1.
 * The published, documented copy of these types lives in `packages/game-sdk`; keep them in sync.
 */

export const GAME_PACK_API_VERSION = 1;

export type LocalizedText = string | Record<string, string>;

export type PlatformValue = string | { win32?: string; linux?: string; darwin?: string; default?: string };

export type ManifestSetupField = {
  id: string;
  type: 'select' | 'text' | 'secret' | 'number' | 'toggle' | 'custom';
  label: LocalizedText;
  /** i18n key of the host app, used instead of `label` by built-in games. */
  labelKey?: string;
  /** For `custom` fields: id of a component registered by the client. */
  component?: string;
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

export type ProvisionSpec =
  | { type: 'none' }
  | { type: 'steamcmd'; appId: number }
  /** One https file downloaded into the instance folder (optionally verified with `sha256`). */
  | { type: 'download'; url: string; filename?: string; sha256?: string };

/** An argument; objects are only included when `ifExists` (a path relative to the instance) exists. */
export type LaunchArg = string | { arg: string; ifExists: string };

/** How to find the real entry point when it is only known after installation (e.g. generated args files). */
export interface LaunchDiscovery {
  /** Relative glob; `*` matches within one path segment. */
  glob: string;
  platform?: 'win32' | 'linux' | 'darwin';
  /** Case-insensitive pattern of file names to skip (e.g. `installer`). */
  exclude?: string;
  /** `jar` runs `java -jar <match>`; the default `args` mode puts `{{match}}` only where the args say so. */
  mode?: 'args' | 'jar';
  args?: LaunchArg[];
}

/** A command sent for every online player whose answer updates that player's state. */
export interface PlayerQuery {
  id: string;
  /** `{{player}}` is replaced with the player name. */
  command: string;
  /** Must define the named group `username`; other named groups become the fields below. */
  pattern: string;
  fields: Record<string, 'number' | 'string'>;
}

/** Keeps port / description / player limit of the instance in sync with a game config file. */
export interface ConfigSync {
  file: string;
  format: 'properties' | 'ini' | 'json' | 'toml';
  map: { port?: string; motd?: string; maxPlayers?: string };
}

export interface ManifestJvmFlagPreset {
  id: string;
  label: string;
  description: string;
  flags: string[];
  recommendedFor?: string[];
}

export interface ManifestModSource {
  id: string;
  name: string;
  type: 'modrinth';
  baseUrl: string;
  projectUrl?: string;
  loaderCategories?: Record<string, string[]>;
  projectTypes?: string[];
  installDir?: Record<string, string>;
  defaultInstallDir?: string;
}

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
  defaults: { port: number; maxPlayers: number; memoryMb?: number };
  provision?: ProvisionSpec;
  launch: {
    /** `native` runs the executable directly; `java` runs it as `java -jar <executable>` with RAM flags. */
    runtime?: 'native' | 'java';
    executable: PlatformValue;
    args?: string[];
    discover?: LaunchDiscovery[];
  };
  /** Bundled packs only: id of a code extension shipped with Hosty (rejected in user packs). */
  extension?: string;
  playerQueries?: PlayerQuery[];
  configSync?: ConfigSync;
  /** Loaders (or variants) a Telemetry Bridge artifact exists for. */
  bridgeLoaders?: string[];
  jvmFlagPresets?: ManifestJvmFlagPreset[];
  modSources?: ManifestModSource[];
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
const FIELD_TYPES = new Set(['select', 'text', 'secret', 'number', 'toggle', 'custom']);
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

  if (isObject(launch) && launch.discover !== undefined) {
    const discover = launch.discover;
    const argOk = (arg: unknown) =>
      typeof arg === 'string' ||
      (isObject(arg) && typeof arg.arg === 'string' && isSafeRelativePath(arg.ifExists));
    if (
      !Array.isArray(discover) ||
      !discover.every(
        (entry) =>
          isObject(entry) &&
          isSafeRelativePath(entry.glob) &&
          (entry.platform === undefined || ['win32', 'linux', 'darwin'].includes(String(entry.platform))) &&
          (entry.mode === undefined || ['args', 'jar'].includes(String(entry.mode))) &&
          (entry.args === undefined || (Array.isArray(entry.args) && entry.args.every(argOk)))
      )
    ) {
      errors.push('launch.discover must be a list of { glob (relative), platform?, exclude?, mode?, args? }');
    } else {
      for (const entry of discover as Array<Record<string, unknown>>) {
        if (entry.exclude !== undefined) checkPatterns('launch.discover.exclude', entry.exclude, errors);
      }
    }
  }

  if (raw.extension !== undefined && (typeof raw.extension !== 'string' || !ID_PATTERN.test(raw.extension))) {
    errors.push('extension must be an extension id (lowercase letters, digits and dashes)');
  }

  if (raw.playerQueries !== undefined) {
    const queries = raw.playerQueries;
    if (
      !Array.isArray(queries) ||
      !queries.every(
        (query) =>
          isObject(query) &&
          typeof query.id === 'string' &&
          typeof query.command === 'string' &&
          typeof query.pattern === 'string' &&
          isObject(query.fields) &&
          Object.values(query.fields).every((kind) => kind === 'number' || kind === 'string')
      )
    ) {
      errors.push('playerQueries must be a list of { id, command, pattern, fields }');
    } else {
      for (const query of queries as Array<Record<string, unknown>>) {
        checkPatterns(`playerQueries.${String(query.id)}.pattern`, query.pattern, errors);
        if (typeof query.pattern === 'string' && !query.pattern.includes('(?<username>')) {
          errors.push(`playerQueries.${String(query.id)}.pattern must define the named group "username"`);
        }
      }
    }
  }

  if (raw.configSync !== undefined) {
    const sync = raw.configSync;
    if (!isObject(sync) || !isSafeRelativePath(sync.file) || !['properties', 'ini', 'json', 'toml'].includes(String(sync.format)) || !isObject(sync.map)) {
      errors.push('configSync must be { file (relative), format (properties|ini|json|toml), map }');
    }
  }

  if (raw.bridgeLoaders !== undefined && !isStringList(raw.bridgeLoaders)) {
    errors.push('bridgeLoaders must be a list of strings');
  }

  if (raw.provision !== undefined) {
    const provision = raw.provision;
    const valid =
      isObject(provision) &&
      (provision.type === 'none' ||
        (provision.type === 'steamcmd' && Number.isInteger(provision.appId)) ||
        (provision.type === 'download' &&
          typeof provision.url === 'string' &&
          /^https:\/\//i.test(provision.url) &&
          (provision.filename === undefined || typeof provision.filename === 'string') &&
          (provision.sha256 === undefined || /^[a-f0-9]{64}$/i.test(String(provision.sha256)))));
    if (!valid) {
      errors.push(
        'provision must be { "type": "none" }, { "type": "steamcmd", "appId": <number> } or { "type": "download", "url": "https://...", "sha256"?: <hex> }'
      );
    }
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
