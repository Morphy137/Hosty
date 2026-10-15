import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectServerFolder } from '../src/core/FolderInspector';
import { driverRegistry } from '../src/core/drivers/GameDriverRegistry';

describe('inspectServerFolder', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-folder-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('identifies a Paper server and reads server.properties', () => {
    const zip = new AdmZip();
    zip.addFile('io/papermc/paperclip/Main.class', Buffer.from('x'));
    zip.addFile('META-INF/versions.list', Buffer.from('abc\t1.21.1/paper-1.21.1.jar\n'));
    zip.writeZip(path.join(dir, 'server.jar'));
    fs.writeFileSync(path.join(dir, 'server.properties'), 'server-port=25570\nmotd=Hello\nmax-players=12\n');

    const result = inspectServerFolder(dir);
    expect(result).toMatchObject({
      gameId: 'minecraft',
      variant: 'paper',
      gameVersion: '1.21.1',
      port: 25570,
      motd: 'Hello',
      maxPlayers: 12
    });
  });

  it('accepts a renamed jar when the file itself is chosen, and remembers its name', () => {
    const zip = new AdmZip();
    zip.addFile('io/papermc/paperclip/Main.class', Buffer.from('x'));
    zip.addFile('META-INF/versions.list', Buffer.from('abc\t1.20.4/paper-1.20.4.jar\n'));
    const jar = path.join(dir, 'my-custom-paper-build.jar');
    zip.writeZip(jar);

    // Choosing the folder cannot work: there is no server.jar next to it.
    expect(inspectServerFolder(dir, 'minecraft').gameId).toBeNull();
    // A file is only trusted by the game the user selected, never by an unrelated one.
    expect(inspectServerFolder(jar).gameId).toBeNull();

    const result = inspectServerFolder(jar, 'minecraft');
    expect(result).toMatchObject({
      gameId: 'minecraft',
      variant: 'paper',
      gameVersion: '1.20.4',
      launchFile: 'my-custom-paper-build.jar',
      path: dir
    });
  });

  it('identifies a NeoForge install by its args file', () => {
    const argsName = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    const argsDir = path.join(dir, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.172');
    fs.mkdirSync(argsDir, { recursive: true });
    fs.writeFileSync(path.join(argsDir, argsName), '');

    expect(inspectServerFolder(dir)).toMatchObject({ gameId: 'minecraft', variant: 'neoforge' });
  });

  it('identifies Project Zomboid before falling back to Minecraft', () => {
    fs.writeFileSync(path.join(dir, 'servertest.ini'), 'PublicName=Test\n');
    expect(inspectServerFolder(dir).gameId).toBe('project-zomboid');
  });

  it('returns a null game for unrelated folders and rejects missing paths', () => {
    expect(inspectServerFolder(dir).gameId).toBeNull();
    expect(() => inspectServerFolder(path.join(dir, 'missing'))).toThrow();
  });
});

describe('driver setup schemas', () => {
  it('declares availability and a setup schema for every driver', () => {
    const drivers = driverRegistry.listDrivers();
    expect(drivers.map((d) => d.status).every((s) => ['available', 'beta', 'coming_soon'].includes(s))).toBe(true);
    const zomboid = drivers.find((d) => d.id === 'project-zomboid');
    expect(zomboid?.setupSchema.map((field) => field.id)).toContain('pzBranch');
    expect(drivers.find((d) => d.id === 'hytale')?.status).toBe('coming_soon');
  });
});
