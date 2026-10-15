import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSyncedValues, writeSyncedValues, type ConfigSyncSpec } from '../src/core/ConfigSync';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-configsync-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const specs: Array<{ name: string; spec: ConfigSyncSpec; seed: string }> = [
  {
    name: 'properties',
    spec: { file: 'server.properties', format: 'properties', map: { port: 'server-port', motd: 'motd', maxPlayers: 'max-players' } },
    seed: '# comment\nserver-port=1111\nmotd=Old\nmax-players=5\nother=keep\n'
  },
  {
    name: 'ini',
    spec: { file: 'game.ini', format: 'ini', map: { port: 'Server.Port', motd: 'Server.Name', maxPlayers: 'Server.Max' } },
    seed: '[Server]\nPort=1111\nName=Old\nMax=5\n'
  },
  {
    name: 'json',
    spec: { file: 'config.json', format: 'json', map: { port: 'net.port', motd: 'description', maxPlayers: 'limits.players' } },
    seed: JSON.stringify({ net: { port: 1111 }, description: 'Old', limits: { players: 5 }, other: true })
  },
  {
    name: 'toml',
    spec: { file: 'config.toml', format: 'toml', map: { port: 'net.port', motd: 'description', maxPlayers: 'limits.players' } },
    seed: 'description = "Old"\n[net]\nport = 1111\n[limits]\nplayers = 5\n'
  }
];

describe('ConfigSync', () => {
  it.each(specs)('reads and writes $name files without losing other settings', ({ spec, seed }) => {
    // INI keys are written as `Section.Key`; the seed above uses the same casing.
    fs.writeFileSync(path.join(dir, spec.file), seed, 'utf-8');

    expect(readSyncedValues(dir, spec)).toEqual({ port: 1111, motd: 'Old', maxPlayers: 5 });

    writeSyncedValues(dir, spec, { port: 2222, motd: 'New name' });
    expect(readSyncedValues(dir, spec)).toEqual({ port: 2222, motd: 'New name', maxPlayers: 5 });
    expect(fs.readFileSync(path.join(dir, spec.file), 'utf-8')).toMatch(/keep|true|Max|players/);
  });

  it('creates a missing file and tolerates unreadable ones', () => {
    const spec: ConfigSyncSpec = { file: 'new.json', format: 'json', map: { port: 'port' } };
    expect(readSyncedValues(dir, spec)).toEqual({});
    writeSyncedValues(dir, spec, { port: 9000 });
    expect(readSyncedValues(dir, spec).port).toBe(9000);

    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json', 'utf-8');
    expect(readSyncedValues(dir, { ...spec, file: 'broken.json' })).toEqual({});
  });

  it('refuses files outside the instance folder', () => {
    const spec: ConfigSyncSpec = { file: '../outside.json', format: 'json', map: { port: 'port' } };
    expect(() => writeSyncedValues(dir, spec, { port: 1 })).toThrow(/outside/);
  });
});
