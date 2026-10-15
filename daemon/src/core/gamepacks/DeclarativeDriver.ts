import fs from 'fs';
import path from 'path';
import type {
  GameDriverSummary,
  IGameDriver,
  ParsedLogEvent,
  ProcessLaunchPlan,
  SetupField
} from '../drivers/IGameDriver';
import type { GameManifest, LocalizedText, PlatformValue } from './manifest';

const DEFAULT_MIN_RAM_MB = 1024;
const DEFAULT_MAX_RAM_MB = 4096;
const JAVA_RUNTIME_FLAGS = ['-XX:+UseG1GC'];

type LaunchConfig = Parameters<IGameDriver['buildLaunchPlan']>[0];

const toList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : value;

const compile = (patterns: string | string[] | undefined): RegExp[] =>
  toList(patterns).map((pattern) => new RegExp(pattern, 'i'));

const toLanguageMap = (text: LocalizedText | undefined): Record<string, string> | undefined =>
  text === undefined ? undefined : typeof text === 'string' ? { en: text } : text;

const firstText = (text: LocalizedText | undefined): string => {
  const map = toLanguageMap(text);
  return map ? (map.en ?? Object.values(map)[0] ?? '') : '';
};

/** Picks the platform-specific value; `default` (or the first entry) is the fallback. */
export function resolvePlatformValue(value: PlatformValue, platform: NodeJS.Platform = process.platform): string {
  if (typeof value === 'string') return value;
  const key = platform === 'win32' || platform === 'linux' || platform === 'darwin' ? platform : 'default';
  return value[key] ?? value.default ?? Object.values(value)[0] ?? '';
}

/** Replaces `{{name}}` placeholders; unknown placeholders are left empty so launches never print `undefined`. */
export function renderTemplate(template: string, variables: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ''));
}

/** Game driver built entirely from a `hosty-game.json` manifest. */
export class DeclarativeGameDriver implements IGameDriver {
  public readonly id: string;
  public readonly name: string;
  public readonly summary: GameDriverSummary;

  private readonly ready: RegExp[];
  private readonly join: RegExp[];
  private readonly leave: RegExp[];

  constructor(
    public readonly manifest: GameManifest,
    public readonly packDir: string | null,
    source: 'builtin' | 'pack' = 'pack'
  ) {
    this.id = manifest.id;
    this.name = manifest.name;
    this.ready = compile(manifest.logs?.ready);
    this.join = compile(manifest.logs?.join);
    this.leave = compile(manifest.logs?.leave);

    const capabilities = {
      players: manifest.capabilities?.players ?? true,
      mods: manifest.capabilities?.mods ?? false,
      configEditor: manifest.capabilities?.configEditor ?? (manifest.configFiles?.length ?? 0) > 0,
      bridge: manifest.capabilities?.bridge ?? false
    };

    const setupSchema: SetupField[] = (manifest.setup ?? []).map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      description: field.description,
      options: field.options?.map((option) => ({ value: option.value, label: option.label })),
      default: field.default,
      required: field.required
    }));

    this.summary = {
      id: manifest.id,
      name: manifest.name,
      category: manifest.category ?? 'sandbox',
      defaultPort: manifest.defaults.port,
      defaultMaxPlayers: manifest.defaults.maxPlayers,
      executableName: resolvePlatformValue(manifest.launch.executable),
      supportsMods: capabilities.mods,
      modFormat: manifest.modFormat ?? '',
      supportsCustomJava: manifest.launch.runtime === 'java',
      configFileName: manifest.configFiles?.[0]?.path ?? '',
      badge: manifest.badge ?? manifest.id.slice(0, 2).toUpperCase(),
      description: firstText(manifest.description),
      descriptionI18n: toLanguageMap(manifest.description),
      status: manifest.status ?? 'available',
      setupSchema,
      capabilities,
      configFiles: (manifest.configFiles ?? []).map((file) => ({ ...file })),
      source,
      hasLogo: Boolean(manifest.logo && packDir && fs.existsSync(path.join(packDir, manifest.logo))),
      i18n: manifest.i18n,
      provision: manifest.provision
    };
  }

  private executableCandidates(): string[] {
    const value = this.manifest.launch.executable;
    const resolved = resolvePlatformValue(value);
    // A platform entry may list fallbacks separated by `|` (first existing file wins).
    return resolved.split('|').map((entry) => entry.trim()).filter(Boolean);
  }

  public validateInstallation(instanceDir: string): boolean {
    const markers = [...(this.manifest.detect ?? []), ...this.executableCandidates()];
    return markers.some((marker) => fs.existsSync(path.join(instanceDir, marker)));
  }

  public buildLaunchPlan(config: LaunchConfig): ProcessLaunchPlan {
    const cwd = path.resolve(config.workingDir);
    const minRam = config.minRamMb ?? DEFAULT_MIN_RAM_MB;
    const maxRam = config.maxRamMb ?? DEFAULT_MAX_RAM_MB;

    const candidates = this.executableCandidates();
    const executable = candidates.find((candidate) => fs.existsSync(path.join(cwd, candidate))) ?? candidates[0] ?? '';

    const variables = {
      ...config.gameConfig,
      id: config.id,
      name: config.name,
      port: config.port ?? this.manifest.defaults.port,
      maxPlayers: config.maxPlayers ?? this.manifest.defaults.maxPlayers,
      minRamMb: minRam,
      maxRamMb: maxRam,
      ramMb: maxRam
    };
    const extraArgs = (this.manifest.launch.args ?? []).map((arg) => renderTemplate(arg, variables));

    if (this.manifest.launch.runtime === 'java') {
      return {
        executable: config.javaPath || 'java',
        args: [`-Xms${minRam}M`, `-Xmx${maxRam}M`, ...JAVA_RUNTIME_FLAGS, ...(config.jvmArgs ?? []), '-jar', executable, ...extraArgs],
        cwd
      };
    }

    return { executable: path.join(cwd, executable), args: extraArgs, cwd };
  }

  public buildStopCommand(): string {
    const command = this.manifest.commands?.stop ?? 'stop';
    return command.toLowerCase() === 'ctrl+c' ? '\u0003' : `${command}\n`;
  }

  public buildSaveCommand(): string {
    const command = this.manifest.commands?.save;
    return command === null ? '' : `${command ?? 'save'}\n`;
  }

  public parseLogLine(line: string): ParsedLogEvent | null {
    if (this.ready.some((pattern) => pattern.test(line))) return { isReady: true };

    for (const pattern of this.join) {
      const match = pattern.exec(line);
      const username = match?.groups?.username ?? match?.[1];
      if (username) {
        return { playerJoin: { username, dimension: this.manifest.logs?.dimension ?? 'overworld', x: 0, y: 0, z: 0 } };
      }
    }

    for (const pattern of this.leave) {
      const match = pattern.exec(line);
      const username = match?.groups?.username ?? match?.[1];
      if (username) return { playerLeave: username };
    }

    return null;
  }
}
