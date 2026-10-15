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
});
