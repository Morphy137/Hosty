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

  const writeConfig = (relative: string, content: string) => {
    const target = path.join(tmpDir, 'config', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
  };

  it('rejects paths that leave the config folder', () => {
    writeConfig('a.toml', 'x = 1');
    for (const bad of ['../evil.toml', 'foo/../../evil.toml', '/etc/passwd', 'foo//bar.toml', 'foo\\..\\..\\x.toml']) {
      expect(() => ModConfigParser.resolveFile(tmpDir, bad)).toThrowError(DaemonError);
    }
  });

  it('refuses binary files and missing files', () => {
    writeConfig('data.dat', 'x');
    expect(() => ModConfigParser.resolveFile(tmpDir, 'data.dat')).toThrowError(DaemonError);
    expect(() => ModConfigParser.resolveFile(tmpDir, 'nope.toml')).toThrowError(DaemonError);
  });

  it('lists every text file in its folders and skips binaries', () => {
    writeConfig('root.toml', 'a = 1');
    writeConfig('sodium/options.json', '{}');
    writeConfig('create/deep/client.cfg', 'x');
    writeConfig('create/icon.png', 'x');
    expect(ModConfigParser.listConfigs(tmpDir)).toEqual(['create/deep/client.cfg', 'root.toml', 'sodium/options.json']);
  });

  it('reads non-structured files as text and falls back to text for broken json', () => {
    writeConfig('mod/server.cfg', 'B:enabled=true\n');
    writeConfig('mod/broken.json', '{ // comment\n}');
    expect(ModConfigParser.readConfig(tmpDir, 'mod/server.cfg')).toMatchObject({
      format: 'text',
      content: 'B:enabled=true\n'
    });
    expect(ModConfigParser.readConfig(tmpDir, 'mod/broken.json').format).toBe('text');
  });

  it('saves text, validating toml and json', () => {
    writeConfig('mod/server.cfg', 'old');
    writeConfig('mod/a.json', '{}');
    ModConfigParser.saveConfigText(tmpDir, 'mod/server.cfg', 'new');
    expect(fs.readFileSync(path.join(tmpDir, 'config/mod/server.cfg'), 'utf-8')).toBe('new');
    expect(() => ModConfigParser.saveConfigText(tmpDir, 'mod/a.json', '{ nope')).toThrowError(DaemonError);
    expect(fs.readFileSync(path.join(tmpDir, 'config/mod/a.json'), 'utf-8')).toBe('{}');
  });

  it('keeps arrays the form does not show when saving values', () => {
    writeConfig('mod/a.json', JSON.stringify({ name: 'x', list: [1, 2], nested: { on: true } }));
    ModConfigParser.saveConfig(tmpDir, 'mod/a.json', { name: 'y', 'nested.on': false });
    expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'config/mod/a.json'), 'utf-8'))).toEqual({
      name: 'y',
      list: [1, 2],
      nested: { on: false }
    });
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
