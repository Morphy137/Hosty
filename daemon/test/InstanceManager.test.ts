import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { InstanceManager } from '../src/core/InstanceManager';
import { DaemonError } from '../src/errors';

describe('InstanceManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-inst-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes and lists default instance', () => {
    const manager = new InstanceManager(tmpDir, 'default');
    const instances = manager.listInstances();
    expect(instances.length).toBeGreaterThanOrEqual(1);
    expect(manager.getActiveInstanceId()).toBe('default');
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
});
