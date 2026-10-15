import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Bundled single-file builds (Node SEA) have no meaningful __dirname.
const moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd();

/** Per-user data folder of the app: %APPDATA%\\Hosty, ~/Library/Application Support/Hosty or $XDG_DATA_HOME/Hosty. */
export const resolveAppDataDir = (
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir()
): string => {
  if (platform === 'win32') {
    return path.join(env.APPDATA?.trim() || path.join(home, 'AppData', 'Roaming'), 'Hosty');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Hosty');
  }
  return path.join(env.XDG_DATA_HOME?.trim() || path.join(home, '.local', 'share'), 'Hosty');
};

const resolveDefaultInstanceDir = (env: Record<string, string | undefined>): string => {
  if (env.NODE_ENV === 'production') {
    return path.join(resolveAppDataDir(env), 'instances', 'default');
  }
  return path.join(moduleDir, '../../../instances/default');
};

const resolveDefaultGamesDir = (env: Record<string, string | undefined>): string => {
  if (env.NODE_ENV === 'production') {
    return path.join(resolveAppDataDir(env), 'games');
  }
  return path.join(moduleDir, '../../../games');
};

const resolveDefaultAssetsDir = (): string => path.join(moduleDir, '../../assets/bridge');

const DEFAULTS = {
  port: 4000,
  host: '127.0.0.1',
  allowedOrigins:
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost',
  instanceId: '',
  /** Empty = each game launches its own declared executable. */
  jarFile: '',
  javaPath: 'java',
  minRamMb: 2048,
  maxRamMb: 4096,
  stopTimeoutMs: 30_000,
  metricsIntervalMs: 1_500,
  positionPollIntervalMs: 5_000
} as const;

export interface DaemonConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  instanceDir: string;
  /** Directory holding the bundled bridge jars. */
  assetsDir: string;
  /** Folder scanned for user game packs (`<id>/hosty-game.json`). */
  gamesDir: string;
  /** Folder with community UI translations (`<code>.json`), served to the client. */
  localesDir: string;
  /** Games that ship with Hosty (read-only pack folders). */
  bundledGamesDir: string;
  /** Translation packs shipped with Hosty (read-only); the user's `localesDir` overrides them. */
  bundledLocalesDir: string;
  /** When set, REST and WebSocket clients must present it (the desktop shell generates one per run). */
  apiToken: string;
  /** Accept pre-v1 bridges that cannot authenticate (transitional, off by default). */
  allowLegacyBridge: boolean;
  instanceId: string;
  jarFile: string;
  javaPath: string;
  minRamMb: number;
  maxRamMb: number;
  stopTimeoutMs: number;
  metricsIntervalMs: number;
  positionPollIntervalMs: number;
  mockEnabled: boolean;
}

type Env = Record<string, string | undefined>;

const readPositiveInt = (env: Env, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid environment variable ${key}="${raw}": expected a positive integer`);
  }
  return parsed;
};

const readBoolean = (env: Env, key: string, fallback: boolean): boolean => {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
};

const readList = (env: Env, key: string, fallback: string): string[] =>
  (env[key] ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const loadConfig = (env: Env = process.env): DaemonConfig => {
  const minRamMb = readPositiveInt(env, 'MC_NEXUS_MIN_RAM_MB', DEFAULTS.minRamMb);
  const maxRamMb = readPositiveInt(env, 'MC_NEXUS_MAX_RAM_MB', DEFAULTS.maxRamMb);
  if (minRamMb > maxRamMb) {
    throw new Error('MC_NEXUS_MIN_RAM_MB cannot be greater than MC_NEXUS_MAX_RAM_MB');
  }

  return {
    port: readPositiveInt(env, 'MC_NEXUS_PORT', DEFAULTS.port),
    host: env.MC_NEXUS_HOST?.trim() || DEFAULTS.host,
    allowedOrigins: readList(env, 'MC_NEXUS_ALLOWED_ORIGINS', DEFAULTS.allowedOrigins),
    instanceDir: path.resolve(env.MC_NEXUS_INSTANCE_DIR?.trim() || resolveDefaultInstanceDir(env)),
    assetsDir: path.resolve(env.MC_NEXUS_ASSETS_DIR?.trim() || resolveDefaultAssetsDir()),
    gamesDir: path.resolve(env.MC_NEXUS_GAMES_DIR?.trim() || resolveDefaultGamesDir(env)),
    bundledGamesDir: path.resolve(
      env.MC_NEXUS_BUNDLED_GAMES_DIR?.trim() ||
        path.join(path.dirname(env.MC_NEXUS_ASSETS_DIR?.trim() || resolveDefaultAssetsDir()), 'games')
    ),
    localesDir: path.resolve(
      env.MC_NEXUS_LOCALES_DIR?.trim() ||
        path.join(path.dirname(env.MC_NEXUS_GAMES_DIR?.trim() || resolveDefaultGamesDir(env)), 'locales')
    ),
    bundledLocalesDir: path.resolve(
      env.MC_NEXUS_BUNDLED_LOCALES_DIR?.trim() ||
        path.join(path.dirname(env.MC_NEXUS_ASSETS_DIR?.trim() || resolveDefaultAssetsDir()), 'locales')
    ),
    apiToken: env.MC_NEXUS_API_TOKEN?.trim() || '',
    allowLegacyBridge: readBoolean(env, 'MC_NEXUS_ALLOW_LEGACY_BRIDGE', false),
    instanceId: env.MC_NEXUS_INSTANCE_ID?.trim() || DEFAULTS.instanceId,
    jarFile: env.MC_NEXUS_JAR_FILE?.trim() || DEFAULTS.jarFile,
    javaPath: env.MC_NEXUS_JAVA_PATH?.trim() || DEFAULTS.javaPath,
    minRamMb,
    maxRamMb,
    stopTimeoutMs: readPositiveInt(env, 'MC_NEXUS_STOP_TIMEOUT_MS', DEFAULTS.stopTimeoutMs),
    metricsIntervalMs: readPositiveInt(env, 'MC_NEXUS_METRICS_INTERVAL_MS', DEFAULTS.metricsIntervalMs),
    positionPollIntervalMs: readPositiveInt(
      env,
      'MC_NEXUS_POSITION_POLL_INTERVAL_MS',
      DEFAULTS.positionPollIntervalMs
    ),
    mockEnabled: readBoolean(env, 'MC_NEXUS_ENABLE_MOCK', env.NODE_ENV !== 'production')
  };
};
