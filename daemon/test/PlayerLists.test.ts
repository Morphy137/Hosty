import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSeededRegistry } from './helpers/packs';
import { validateManifest } from '../src/core/gamepacks/manifest';
import {
  readPlayerList,
  removeFromListFile,
  renderListCommand,
  sanitizeReason,
  validateListValue,
  writeToggle
} from '../src/core/PlayerLists';

const minecraft = createSeededRegistry().getDriver('minecraft').summary;
const list = (id: string) => minecraft.playerLists!.find((spec) => spec.id === id)!;
const formats = Object.fromEntries(minecraft.configFiles.map((file) => [file.path, file.format]));

describe('player lists', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-lists-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('Minecraft declares whitelist, operators and both ban lists', () => {
    expect(minecraft.playerLists?.map((spec) => spec.id)).toEqual(['whitelist', 'operators', 'banned-players', 'banned-ips']);
    expect(list('whitelist').toggle?.key).toBe('white-list');
  });

  it('reads entries and their details from the game files', () => {
    fs.writeFileSync(
      path.join(dir, 'banned-players.json'),
      JSON.stringify([{ uuid: 'x', name: 'zed', reason: 'griefing', created: '2026-10-16 01:19:28 -0300', source: 'Server', expires: 'forever' }, { name: 'Amy' }])
    );
    const state = readPlayerList(dir, list('banned-players'), formats);
    expect(state.entries).toEqual([
      { value: 'Amy', details: {} },
      { value: 'zed', details: { reason: 'griefing', created: '2026-10-16 01:19:28 -0300', source: 'Server' } }
    ]);
    expect(readPlayerList(dir, list('operators'), formats)).toMatchObject({ entries: [], unreadable: false, enabled: null });

    fs.writeFileSync(path.join(dir, 'ops.json'), '{not json');
    expect(readPlayerList(dir, list('operators'), formats).unreadable).toBe(true);
  });

  it('reads and writes the enforcement switch in its config file', () => {
    fs.writeFileSync(path.join(dir, 'server.properties'), 'white-list=false\nmotd=Hi\n');
    expect(readPlayerList(dir, list('whitelist'), formats).enabled).toBe(false);
    writeToggle(dir, list('whitelist'), true, formats);
    expect(fs.readFileSync(path.join(dir, 'server.properties'), 'utf-8')).toContain('white-list=true');
    expect(readPlayerList(dir, list('whitelist'), formats).enabled).toBe(true);
  });

  it('removes an entry from the file while the server is stopped', () => {
    fs.writeFileSync(path.join(dir, 'whitelist.json'), JSON.stringify([{ uuid: 'a', name: 'Steve' }, { uuid: 'b', name: 'Alex' }]));
    expect(removeFromListFile(dir, list('whitelist'), 'steve')).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'whitelist.json'), 'utf-8'))).toEqual([{ uuid: 'b', name: 'Alex' }]);
    expect(removeFromListFile(dir, list('whitelist'), 'nobody')).toBe(false);
  });

  it('validates values and renders the game commands', () => {
    expect(validateListValue(list('operators'), '  Steve_01 ')).toBe('Steve_01');
    expect(() => validateListValue(list('operators'), 'Steve; stop')).toThrow(/player name/);
    expect(validateListValue(list('banned-ips'), '203.0.113.7')).toBe('203.0.113.7');
    expect(() => validateListValue(list('banned-ips'), 'evil.example')).toThrow(/IP address/);
    expect(sanitizeReason('line one\nline two')).toBe('line one line two');
    expect(renderListCommand(list('banned-players').add, 'zed', 'griefing')).toBe('ban zed griefing');
    expect(renderListCommand(list('banned-players').add, 'zed')).toBe('ban zed');
  });

  it('rejects malformed list declarations in user packs', () => {
    const base = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/examples/valheim/hosty-game.json'), 'utf-8'));
    const good = { id: 'admins', label: 'Admins', file: 'admins.json', key: 'name', add: 'admin {{value}}', remove: 'unadmin {{value}}' };
    expect(validateManifest({ ...base, playerLists: [good] }).errors).toEqual([]);
    for (const bad of [
      { ...good, add: 'admin' },
      { ...good, file: '../outside.json' },
      { ...good, valueType: 'email' },
      { ...good, toggle: { configFile: 'x.ini' } }
    ]) {
      expect(validateManifest({ ...base, playerLists: [bad] }).errors.join(' ')).toMatch(/playerLists/);
    }
    expect(validateManifest({ ...base, playerLists: [good, good] }).errors.join(' ')).toMatch(/playerLists/);
  });
});
