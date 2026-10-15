import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const BRIDGE_DIR_NAME = '.hosty';
export const BRIDGE_CONFIG_FILE = 'bridge.json';

export interface BridgeConfigFile {
  protocolVersion: number;
  instanceId: string;
  token: string;
  /** WebSocket URL of the daemon's bridge endpoint (reflects the port picked at startup). */
  url: string;
}

const configPath = (instanceDir: string) => path.join(instanceDir, BRIDGE_DIR_NAME, BRIDGE_CONFIG_FILE);

const readExisting = (instanceDir: string): BridgeConfigFile | null => {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(instanceDir), 'utf-8')) as Partial<BridgeConfigFile>;
    if (typeof parsed.token === 'string' && parsed.token.length >= 32) return parsed as BridgeConfigFile;
  } catch {
    // Missing or corrupt: a new one is generated below.
  }
  return null;
};

/**
 * Creates (or refreshes) `<instance>/.hosty/bridge.json`. The token is generated once per instance and
 * kept; the URL is rewritten every time so a changed daemon port never strands an installed bridge.
 */
export function ensureBridgeConfig(instanceDir: string, instanceId: string, url: string): BridgeConfigFile {
  const existing = readExisting(instanceDir);
  const config: BridgeConfigFile = {
    protocolVersion: 1,
    instanceId,
    token: existing?.token ?? crypto.randomBytes(32).toString('hex'),
    url
  };

  const file = configPath(instanceDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!existing || existing.url !== url || existing.instanceId !== instanceId) {
    fs.writeFileSync(file, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
  return config;
}

export function readBridgeToken(instanceDir: string): string | null {
  return readExisting(instanceDir)?.token ?? null;
}

/** Constant-time token comparison. */
export function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
