import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { InstanceManager } from '../src/core/InstanceManager';
import { DaemonError } from '../src/errors';

/** Smallest buffer with a PNG signature and an IHDR header of the given square size. */
const fakePng = (size: number): Buffer => {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(size, 16);
  buffer.writeUInt32BE(size, 20);
  return buffer;
};

describe('InstanceManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-inst-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes and lists default instance when requested', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    const instances = manager.listInstances();
    expect(instances.length).toBeGreaterThanOrEqual(1);
    expect(manager.getActiveInstanceId()).toBe('default');
  });

  it('initializes with empty instances when no default ID is provided', () => {
    const manager = new InstanceManager(tmpDir);
    expect(manager.listInstances()).toEqual([]);
    expect(manager.getActiveInstanceId()).toBe('');
  });

  it('creates a new instance with dedicated directory and server-port', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    const newInst = manager.createInstance('survival-1', 'My Survival Server');
    expect(newInst.id).toBe('survival-1');
    expect(newInst.name).toBe('My Survival Server');
    expect(fs.existsSync(newInst.dir)).toBe(true);

    const instances = manager.listInstances();
    expect(instances.some((i) => i.id === 'survival-1')).toBe(true);
  });

  it('selects active instance and switches ID', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    manager.createInstance('server-b', 'Server B');

    const selected = manager.setActiveInstanceId('server-b');
    expect(selected.id).toBe('server-b');
    expect(manager.getActiveInstanceId()).toBe('server-b');
  });

  it('imports an external server directory', () => {
    const externalDir = path.join(tmpDir, 'external-server');
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, 'server.properties'), 'motd=External Server\nserver-port=25570\n');

    const manager = new InstanceManager(tmpDir, 'default');
    const imported = manager.importInstance(externalDir, 'Imported Server');
    expect(imported.dir).toBe(externalDir);
    expect(imported.isImported).toBe(true);
    expect(imported.port).toBe(25570);
  });

  it('throws DaemonError on invalid or missing instance ID selection', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    expect(() => manager.setActiveInstanceId('non-existent')).toThrowError(DaemonError);
  });

  it('creates an instance with custom settings and updates them', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    const created = manager.createInstance('modded-1', 'Modded Pack', {
      port: 25580,
      motd: 'Custom Modpack',
      maxPlayers: 50,
      minRamMb: 2048,
      maxRamMb: 8192,
      jvmArgs: ['-XX:+UseG1GC']
    });

    expect(created.port).toBe(25580);
    expect(created.motd).toBe('Custom Modpack');
    expect(created.maxPlayers).toBe(50);
    expect(created.minRamMb).toBe(2048);
    expect(created.maxRamMb).toBe(8192);
    expect(created.jvmArgs).toEqual(['-XX:+UseG1GC']);

    // Update settings
    const updated = manager.updateInstanceSettings('modded-1', {
      motd: 'Updated Modpack MOTD',
      maxPlayers: 60,
      maxRamMb: 12288
    });

    expect(updated.motd).toBe('Updated Modpack MOTD');
    expect(updated.maxPlayers).toBe(60);
    expect(updated.maxRamMb).toBe(12288);
  });

  it('stores the icon for Hosty and as the game icon when the game declares one', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    const inst = manager.createInstance('icon-test', 'Icon Server', { gameId: 'minecraft' });
    expect(inst.hasIcon).toBe(false);
    expect(manager.getInstanceIconPath('icon-test')).toBeNull();

    expect(manager.saveInstanceIcon('icon-test', fakePng(64))).toBe('written');
    expect(fs.existsSync(path.join(inst.dir, '.hosty', 'icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(inst.dir, 'server-icon.png'))).toBe(true);
    expect(manager.getInstance('icon-test')?.hasIcon).toBe(true);

    // A size the game rejects only updates Hosty's copy.
    fs.rmSync(path.join(inst.dir, 'server-icon.png'));
    expect(manager.saveInstanceIcon('icon-test', fakePng(128))).toBe('wrong-size');
    expect(fs.existsSync(path.join(inst.dir, 'server-icon.png'))).toBe(false);

    manager.deleteInstanceIcon('icon-test');
    expect(manager.getInstanceIconPath('icon-test')).toBeNull();
    expect(manager.getInstance('icon-test')?.hasIcon).toBe(false);
  });

  it('keeps the icon inside Hosty for games without a server icon', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    const inst = manager.createInstance('pz-icon', 'Zomboid', { gameId: 'project-zomboid' });
    expect(manager.saveInstanceIcon('pz-icon', fakePng(128))).toBe('unsupported');
    expect(fs.readdirSync(inst.dir)).not.toContain('server-icon.png');
    expect(manager.getInstanceIconPath('pz-icon')).toBe(path.join(inst.dir, '.hosty', 'icon.png'));
  });

  it('rejects files that are not PNG images', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    manager.createInstance('bad-icon', 'Bad');
    expect(() => manager.saveInstanceIcon('bad-icon', Buffer.from('not-a-png'))).toThrow(/PNG/);
  });
});

