import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SupervisorRegistry } from '../src/core/SupervisorRegistry';
import type { InstanceInfo } from '../src/core/InstanceManager';

describe('SupervisorRegistry', () => {
  let tmpDir: string;
  let registry: SupervisorRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-registry-test-'));
    registry = new SupervisorRegistry({
      defaultJavaPath: 'java',
      defaultJarFile: 'server.jar',
      stopTimeoutMs: 5000,
      metricsIntervalMs: 2000,
      positionPollIntervalMs: 3000
    });
  });

  afterEach(() => {
    registry.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and retrieves supervisors independently for instances', () => {
    const instA: InstanceInfo = {
      id: 'server-a',
      name: 'Server A',
      dir: path.join(tmpDir, 'server-a'),
      port: 25565,
      motd: 'Server A MOTD',
      hasJar: false,
      hasIcon: false,
      isImported: false,
      createdAt: new Date().toISOString(),
      maxPlayers: 20,
      minRamMb: 1024,
      maxRamMb: 2048,
      jvmArgs: [],
      javaPath: '',
      forceSaveOnStop: true,
      autostart: false
    };

    const instB: InstanceInfo = {
      id: 'server-b',
      name: 'Server B',
      dir: path.join(tmpDir, 'server-b'),
      port: 25566,
      motd: 'Server B MOTD',
      hasJar: false,
      hasIcon: false,
      isImported: false,
      createdAt: new Date().toISOString(),
      maxPlayers: 40,
      minRamMb: 2048,
      maxRamMb: 4096,
      jvmArgs: ['-XX:+UseG1GC'],
      javaPath: '',
      forceSaveOnStop: false,
      autostart: false
    };

    const supA = registry.getOrCreateSupervisor(instA);
    const supB = registry.getOrCreateSupervisor(instB);

    expect(supA).toBeDefined();
    expect(supB).toBeDefined();
    expect(supA).not.toBe(supB);

    expect(registry.getStatus('server-a')).toBe('OFFLINE');
    expect(registry.getStatus('server-b')).toBe('OFFLINE');
    expect(registry.getPlayers('server-a')).toEqual([]);

    const statuses = registry.getAllStatuses();
    expect(statuses['server-a']).toBe('OFFLINE');
    expect(statuses['server-b']).toBe('OFFLINE');
  });
});
