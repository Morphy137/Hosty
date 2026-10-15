import fs from 'fs';
import path from 'path';
import type {
  GameDriverSummary,
  IGameDriver,
  ParsedLogEvent,
  ProcessLaunchPlan,
  SetupField
} from '../drivers/IGameDriver';
import type { GameManifest, LaunchArg, LaunchDiscovery, LocalizedText, PlatformValue } from './manifest';

const DEFAULT_MIN_RAM_MB = 1024;
const DEFAULT_MAX_RAM_MB = 4096;
const JAVA_RUNTIME_FLAGS = ['-XX:+UseG1GC'];

type LaunchConfig = Parameters<IGameDriver['buildLaunchPlan']>[0];

/** Expands a relative glob where `*` matches inside a single path segment. Results are sorted. */
export function expandGlob(baseDir: string, pattern: string): string[] {
  const segments = pattern.split(/[\\/]/).filter(Boolean);
  const toRegex = (segment: string) =>
    new RegExp(`^${segment.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`, 'i');

  const walk = (dir: string, index: number, prefix: string[]): string[] => {
    if (index >= segments.length) return [prefix.join('/')];
    const segment = segments[index];
    const last = index === segments.length - 1;
    if (!segment.includes('*')) {
      const next = path.join(dir, segment);
      if (!fs.existsSync(next)) return [];
      if (last) return fs.statSync(next).isFile() ? [[...prefix, segment].join('/')] : [];
      return fs.statSync(next).isDirectory() ? walk(next, index + 1, [...prefix, segment]) : [];
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    const matcher = toRegex(segment);
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!matcher.test(entry.name)) continue;
      if (last) {
        if (entry.isFile()) results.push([...prefix, entry.name].join('/'));
      } else if (entry.isDirectory()) {
        results.push(...walk(path.join(dir, entry.name), index + 1, [...prefix, entry.name]));
      }
    }
    return results;
  };

  return walk(baseDir, 0, []);
}

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
  private readonly queries: Array<{ id: string; command: string; pattern: RegExp; fields: Record<string, 'number' | 'string'> }>;

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
    this.queries = (manifest.playerQueries ?? []).map((query) => ({
      id: query.id,
      command: query.command,
      pattern: new RegExp(query.pattern, 'i'),
      fields: query.fields
    }));

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
      labelKey: field.labelKey,
      component: field.component,
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
      launchDefaults: manifest.defaults.memoryMb ? { memoryMb: manifest.defaults.memoryMb } : undefined,
      configSync: manifest.configSync,
      playerActions: manifest.playerActions,
      creationSettings: manifest.creationSettings,
      instanceFolders: manifest.instanceFolders,
      modLayout: manifest.modLayout,
      bridgeTargets: manifest.bridgeTargets,
      quickCommands: manifest.quickCommands,
      playerView: manifest.playerView,
      dimensions: manifest.dimensions,
      performance: manifest.performance,
      listPlayersCommand: manifest.commands?.listPlayers,
      bridgeLoaders: manifest.bridgeLoaders,
      jvmFlagPresets: manifest.jvmFlagPresets,
      modSources: manifest.modSources,
      serverIcon: manifest.serverIcon ? { ...manifest.serverIcon } : undefined,
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

  /** First `launch.discover` entry (for this platform) that matches a file in the instance. */
  private discoverLaunch(cwd: string): { entry: LaunchDiscovery; match: string } | null {
    for (const entry of this.manifest.launch.discover ?? []) {
      if (entry.platform && entry.platform !== process.platform) continue;
      const exclude = entry.exclude ? new RegExp(entry.exclude, 'i') : null;
      const match = expandGlob(cwd, entry.glob).find((candidate) => !exclude || !exclude.test(path.basename(candidate)));
      if (match) return { entry, match };
    }
    return null;
  }

  public validateInstallation(instanceDir: string, launchFile?: string): boolean {
    // A file the user explicitly chose for this game counts as its launch file.
    if (launchFile && this.manifest.launch.runtime === 'java' && /\.jar$/i.test(launchFile)) {
      if (fs.existsSync(path.join(instanceDir, launchFile))) return true;
    }
    const markers = [...(this.manifest.detect ?? []), ...this.executableCandidates()];
    if (markers.some((marker) => fs.existsSync(path.join(instanceDir, marker)))) return true;
    return this.discoverLaunch(path.resolve(instanceDir)) !== null;
  }

  public buildLaunchPlan(config: LaunchConfig): ProcessLaunchPlan {
    const cwd = path.resolve(config.workingDir);
    const minRam = config.minRamMb ?? DEFAULT_MIN_RAM_MB;
    const maxRam = config.maxRamMb ?? DEFAULT_MAX_RAM_MB;

    const candidates = this.executableCandidates();
    const executable = candidates.find((candidate) => fs.existsSync(path.join(cwd, candidate))) ?? candidates[0] ?? '';
    const discovered = this.discoverLaunch(cwd);

    const variables = {
      ...config.gameConfig,
      id: config.id,
      name: config.name,
      port: config.port ?? this.manifest.defaults.port,
      maxPlayers: config.maxPlayers ?? this.manifest.defaults.maxPlayers,
      minRamMb: minRam,
      maxRamMb: maxRam,
      ramMb: maxRam,
      match: discovered?.match
    };
    const renderArgs = (args: LaunchArg[]): string[] =>
      args.flatMap((item) => {
        if (typeof item === 'string') return [renderTemplate(item, variables)];
        return fs.existsSync(path.join(cwd, item.ifExists)) ? [renderTemplate(item.arg, variables)] : [];
      });
    const extraArgs = renderArgs(this.manifest.launch.args ?? []);

    if (this.manifest.launch.runtime === 'java') {
      const custom = (config.jvmArgs ?? []).filter((flag, index, all) => all.indexOf(flag) === index);
      // Two garbage collectors abort the JVM, so the default only applies when none was chosen.
      const choosesCollector = custom.some((flag) => /^-XX:\+Use\w+GC$/.test(flag));
      const base = [`-Xms${minRam}M`, `-Xmx${maxRam}M`, ...(choosesCollector ? [] : JAVA_RUNTIME_FLAGS), ...custom];

      if (discovered) {
        const rendered = renderArgs(discovered.entry.args ?? []);
        const tail = discovered.entry.mode === 'jar' ? ['-jar', discovered.match, ...rendered] : rendered;
        return { executable: config.javaPath || 'java', args: [...base, ...tail], cwd };
      }
      return {
        executable: config.javaPath || 'java',
        args: [...base, '-jar', config.jarFile || executable, ...extraArgs],
        cwd
      };
    }

    if (discovered) {
      return {
        executable: path.join(cwd, discovered.match),
        args: renderArgs(discovered.entry.args ?? []),
        cwd
      };
    }
    return { executable: path.join(cwd, executable), args: extraArgs, cwd };
  }

  public consumeQueryResponse(
    line: string,
    pendingQueries: Set<string>
  ): { username: string; patch: Record<string, unknown> } | null {
    for (const query of this.queries) {
      const match = query.pattern.exec(line);
      const username = match?.groups?.username;
      if (!match || !username || !pendingQueries.delete(`${username}:${query.id}`)) continue;

      const patch: Record<string, unknown> = {};
      for (const [field, kind] of Object.entries(query.fields)) {
        const raw = match.groups?.[field];
        if (raw === undefined) continue;
        patch[field] = kind === 'number' ? Math.round(parseFloat(raw)) : raw;
      }
      return { username, patch };
    }
    return null;
  }

  public pollPlayerPositions(stdin: NodeJS.WritableStream, players: string[], pendingQueries: Set<string>): void {
    if (this.queries.length === 0) return;
    pendingQueries.clear();
    for (const player of players) {
      for (const query of this.queries) {
        pendingQueries.add(`${player}:${query.id}`);
        stdin.write(`${renderTemplate(query.command, { player })}\n`);
      }
    }
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
