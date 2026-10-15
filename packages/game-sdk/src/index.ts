/**
 * @hosty/game-sdk — everything a game pack author needs.
 *
 * A pack is a folder with a `hosty-game.json` manifest (declarative, covers most games) and an
 * optional `driver.js` that overrides individual driver methods when the manifest is not enough.
 */

export const GAME_PACK_API_VERSION = 1;

export type LocalizedText = string | Record<string, string>;
export type PlatformValue = string | { win32?: string; linux?: string; darwin?: string; default?: string };

export interface SetupFieldManifest {
  id: string;
  type: 'select' | 'text' | 'secret' | 'number' | 'toggle';
  label: LocalizedText;
  description?: LocalizedText;
  options?: Array<{ value: string; label: LocalizedText }>;
  default?: string | number | boolean;
  required?: boolean;
}

export type ConfigFormat = 'properties' | 'ini' | 'json' | 'toml' | 'lines';

export interface ConfigFileManifest {
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
  /** 2-40 chars: lowercase letters, digits and dashes. Must be unique and cannot reuse a built-in id. */
  id: string;
  name: string;
  version: string;
  /** Relative path to a logo image inside the pack (png / webp / svg). */
  logo?: string;
  description?: LocalizedText;
  badge?: string;
  category?: 'voxel' | 'survival' | 'sandbox';
  status?: 'available' | 'beta' | 'coming_soon';
  defaults: { port: number; maxPlayers: number };
  provision?: ProvisionSpec;
  launch: {
    /** `native` runs the executable directly; `java` runs `java -jar <executable>` with RAM flags. */
    runtime?: 'native' | 'java';
    /** Use `a|b` inside a platform value to list fallbacks (first existing file wins). */
    executable: PlatformValue;
    /** Placeholders: {{id}} {{name}} {{port}} {{maxPlayers}} {{minRamMb}} {{maxRamMb}} {{ramMb}} */
    args?: string[];
  };
  /** Files whose presence marks a valid installation (also used to recognise imported folders). */
  detect?: string[];
  logs?: {
    ready?: string | string[];
    /** Expose the player name as the named group `username` (or capture group 1). */
    join?: string | string[];
    leave?: string | string[];
    dimension?: string;
  };
  /** `stop: "ctrl+c"` sends Ctrl+C instead of a console command. `save: null` disables saving. */
  commands?: { stop?: string; save?: string | null };
  configFiles?: ConfigFileManifest[];
  setup?: SetupFieldManifest[];
  capabilities?: Partial<GameCapabilities>;
  modFormat?: string;
  i18n?: Record<string, Record<string, string>>;
}

/** Identity helper that gives manifests written in TypeScript/JS full type checking. */
export function defineGame(manifest: GameManifest): GameManifest {
  return manifest;
}

// ---- driver.js extension API ---------------------------------------------------------------------

export interface LaunchPlan {
  executable: string;
  args: string[];
  cwd: string;
}

export interface LogEvent {
  isReady?: boolean;
  playerJoin?: { username: string; dimension?: string; x?: number; y?: number; z?: number };
  playerLeave?: string;
}

export interface LaunchConfig {
  workingDir: string;
  javaPath?: string;
  minRamMb?: number;
  maxRamMb?: number;
  jvmArgs?: string[];
  port?: number;
  maxPlayers?: number;
  name?: string;
  id?: string;
  /** Values of the manifest's `setup` fields, also available as `{{fieldId}}` in launch args. */
  gameConfig?: Record<string, string | number | boolean>;
}

/** Methods a `driver.js` may override; everything else keeps the declarative behaviour. */
export interface DriverOverrides {
  validateInstallation?(instanceDir: string): boolean;
  buildLaunchPlan?(config: LaunchConfig): LaunchPlan;
  buildStopCommand?(): string;
  buildSaveCommand?(): string;
  parseLogLine?(line: string): LogEvent | null;
}

export interface DriverContext {
  manifest: GameManifest;
  packDir: string;
  /** The declarative driver; call its methods to extend instead of replace. */
  base: Required<DriverOverrides>;
}

export type DriverFactory = (context: DriverContext) => DriverOverrides;

export function defineDriver(factory: DriverFactory): DriverFactory {
  return factory;
}

// ---- helpers --------------------------------------------------------------------------------------

/** Replaces `{{key}}` placeholders; missing keys become an empty string. */
export function renderTemplate(template: string, variables: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ''));
}

export function resolvePlatformValue(value: PlatformValue, platform: string = process.platform): string {
  if (typeof value === 'string') return value;
  const key = platform === 'win32' || platform === 'linux' || platform === 'darwin' ? platform : 'default';
  return value[key] ?? value.default ?? Object.values(value)[0] ?? '';
}

/** Parses `key=value` files (.properties / flat .ini); comments and blank lines are skipped. */
export function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const index = line.indexOf('=');
    if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return result;
}

export function serializeProperties(values: Record<string, string | number | boolean>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
}

/** Parses an INI file into `{ section: { key: value } }`; keys before any section land in `''`. */
export function parseIni(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = { '': {} };
  let section = '';
  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      section = header[1].trim();
      result[section] ??= {};
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const index = line.indexOf('=');
    if (index > 0) result[section][line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return result;
}

/** Compiles log patterns the same way the daemon does (case-insensitive). */
export function compileLogPatterns(patterns: string | string[] | undefined): RegExp[] {
  const list = patterns === undefined ? [] : typeof patterns === 'string' ? [patterns] : patterns;
  return list.map((pattern) => new RegExp(pattern, 'i'));
}

/** Arguments for an anonymous SteamCMD `app_update`, handy inside a custom `provision` step. */
export function steamCmdArgs(options: { appId: number; installDir: string; branch?: string }): string[] {
  const update = ['+app_update', String(options.appId)];
  if (options.branch && options.branch !== 'stable') update.push('-beta', options.branch);
  update.push('validate');
  return ['+force_install_dir', options.installDir, '+login', 'anonymous', ...update, '+quit'];
}

// ---- test harness ---------------------------------------------------------------------------------

export interface PackHarness {
  /** Arguments the daemon would pass for the given instance values. */
  launchArgs(values?: Partial<Record<'id' | 'name' | 'port' | 'maxPlayers' | 'minRamMb' | 'maxRamMb', string | number>>): string[];
  parseLog(line: string): LogEvent | null;
  stopCommand(): string;
  saveCommand(): string;
}

/**
 * Lightweight simulation of the declarative driver so pack authors can unit-test a manifest
 * without running the daemon:
 *
 *   const pack = createPackHarness(manifest);
 *   expect(pack.parseLog('Player Bob joined')?.playerJoin?.username).toBe('Bob');
 */
export function createPackHarness(manifest: GameManifest): PackHarness {
  const ready = compileLogPatterns(manifest.logs?.ready);
  const join = compileLogPatterns(manifest.logs?.join);
  const leave = compileLogPatterns(manifest.logs?.leave);

  return {
    launchArgs(values = {}) {
      const variables = {
        port: manifest.defaults.port,
        maxPlayers: manifest.defaults.maxPlayers,
        minRamMb: 1024,
        maxRamMb: 4096,
        ...values
      } as Record<string, string | number | undefined>;
      variables.ramMb = variables.maxRamMb;
      return (manifest.launch.args ?? []).map((arg) => renderTemplate(arg, variables));
    },
    parseLog(line) {
      if (ready.some((pattern) => pattern.test(line))) return { isReady: true };
      for (const pattern of join) {
        const match = pattern.exec(line);
        const username = match?.groups?.username ?? match?.[1];
        if (username) return { playerJoin: { username, dimension: manifest.logs?.dimension ?? 'overworld' } };
      }
      for (const pattern of leave) {
        const match = pattern.exec(line);
        const username = match?.groups?.username ?? match?.[1];
        if (username) return { playerLeave: username };
      }
      return null;
    },
    stopCommand() {
      const command = manifest.commands?.stop ?? 'stop';
      return command.toLowerCase() === 'ctrl+c' ? '\u0003' : `${command}\n`;
    },
    saveCommand() {
      const command = manifest.commands?.save;
      return command === null ? '' : `${command ?? 'save'}\n`;
    }
  };
}
