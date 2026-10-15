import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const DEFAULTS = {
  port: 4000,
  host: '127.0.0.1',
  allowedOrigins:
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost',
  instanceDir: path.join(__dirname, '../../../instances/default'),
  instanceId: '',
  jarFile: 'server.jar',
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
    instanceDir: path.resolve(env.MC_NEXUS_INSTANCE_DIR?.trim() || DEFAULTS.instanceDir),
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
