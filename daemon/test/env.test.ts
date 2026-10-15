import path from 'path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/env';

describe('Daemon loadConfig', () => {
  it('loads valid defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.allowedOrigins).toContain('http://localhost:5173');
    expect(config.allowedOrigins).toContain('http://tauri.localhost');
    expect(config.minRamMb).toBe(2048);
    expect(config.maxRamMb).toBe(4096);
  });

  it('parses custom environment variables', () => {
    const config = loadConfig({
      MC_NEXUS_PORT: '5000',
      MC_NEXUS_HOST: '0.0.0.0',
      MC_NEXUS_MIN_RAM_MB: '1024',
      MC_NEXUS_MAX_RAM_MB: '8192',
      MC_NEXUS_ENABLE_MOCK: 'false'
    });
    expect(config.port).toBe(5000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.minRamMb).toBe(1024);
    expect(config.maxRamMb).toBe(8192);
    expect(config.mockEnabled).toBe(false);
  });

  it('throws when min RAM exceeds max RAM', () => {
    expect(() =>
      loadConfig({
        MC_NEXUS_MIN_RAM_MB: '4096',
        MC_NEXUS_MAX_RAM_MB: '2048'
      })
    ).toThrowError('MC_NEXUS_MIN_RAM_MB cannot be greater than MC_NEXUS_MAX_RAM_MB');
  });

  it('resolves instance and assets dirs from the environment', () => {
    const config = loadConfig({
      MC_NEXUS_INSTANCE_DIR: '/data/hosty/instances/default',
      MC_NEXUS_ASSETS_DIR: '/opt/hosty/bridge'
    });
    expect(config.instanceDir.split(path.sep).join('/')).toMatch(/hosty\/instances\/default$/);
    expect(config.assetsDir.split(path.sep).join('/')).toMatch(/opt\/hosty\/bridge$/);
  });

  it('defaults the production instance dir to the user app data folder', () => {
    const config = loadConfig({ NODE_ENV: 'production', APPDATA: path.join('data', 'Roaming') });
    expect(config.instanceDir).toContain('Hosty');
    expect(config.instanceDir).not.toContain('node_modules');
  });
});

describe('app data directory per platform', () => {
  it('follows each OS convention', async () => {
    const { resolveAppDataDir } = await import('../src/config/env');
    expect(resolveAppDataDir({ APPDATA: '/roaming' }, 'win32', '/home/me')).toBe(path.join('/roaming', 'Hosty'));
    expect(resolveAppDataDir({}, 'win32', '/home/me')).toBe(path.join('/home/me', 'AppData', 'Roaming', 'Hosty'));
    expect(resolveAppDataDir({}, 'darwin', '/Users/me')).toBe(path.join('/Users/me', 'Library', 'Application Support', 'Hosty'));
    expect(resolveAppDataDir({ XDG_DATA_HOME: '/data' }, 'linux', '/home/me')).toBe(path.join('/data', 'Hosty'));
    expect(resolveAppDataDir({}, 'linux', '/home/me')).toBe(path.join('/home/me', '.local', 'share', 'Hosty'));
  });
});
