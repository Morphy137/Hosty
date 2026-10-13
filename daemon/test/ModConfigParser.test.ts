import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ModConfigParser } from '../src/parsers/ModConfigParser';
import { DaemonError } from '../src/errors';

describe('ModConfigParser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-mod-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects path traversal in filename', () => {
    expect(() => ModConfigParser.validateFilename('../evil.toml')).toThrowError(DaemonError);
    expect(() => ModConfigParser.validateFilename('foo/bar.toml')).toThrowError(DaemonError);
    expect(() => ModConfigParser.validateFilename('foo\\bar.toml')).toThrowError(DaemonError);
  });

  it('rejects unsupported extensions', () => {
    expect(() => ModConfigParser.validateFilename('script.sh')).toThrowError(DaemonError);
    expect(() => ModConfigParser.validateFilename('server.jar')).toThrowError(DaemonError);
  });

  it('allows valid .toml and .json filenames', () => {
    expect(ModConfigParser.validateFilename('config.toml')).toBe('config.toml');
    expect(ModConfigParser.validateFilename('settings.json')).toBe('settings.json');
  });

  it('parses and saves toml configs correctly', () => {
    const configDir = path.join(tmpDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const tomlContent = [
      '[server]',
      'maxPlayers = 10',
      'pvpEnabled = true',
      'motd = "Test"'
    ].join('\n');
    fs.writeFileSync(path.join(configDir, 'test.toml'), tomlContent, 'utf-8');

    const entries = ModConfigParser.parseConfig(tmpDir, 'test.toml');
    expect(entries).toEqual([
      { key: 'server.maxPlayers', value: 10, type: 'number' },
      { key: 'server.pvpEnabled', value: true, type: 'boolean' },
      { key: 'server.motd', value: 'Test', type: 'string' }
    ]);

    ModConfigParser.saveConfig(tmpDir, 'test.toml', {
      'server.maxPlayers': 25,
      'server.pvpEnabled': false,
      'server.motd': 'Updated'
    });

    const updatedEntries = ModConfigParser.parseConfig(tmpDir, 'test.toml');
    expect(updatedEntries).toEqual([
      { key: 'server.maxPlayers', value: 25, type: 'number' },
      { key: 'server.pvpEnabled', value: false, type: 'boolean' },
      { key: 'server.motd', value: 'Updated', type: 'string' }
    ]);
  });
});
