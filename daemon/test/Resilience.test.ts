import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupManager } from '../src/core/BackupManager';
import { ProcessSupervisor, type ServerConfig, type SpawnFunction } from '../src/core/ProcessSupervisor';
import type { IGameDriver } from '../src/core/drivers/IGameDriver';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { write: vi.fn() });
  pid = 1234;
  kill = vi.fn(() => this.exit(null));
  exit(code: number | null): void {
    this.emit('close', code);
  }
  say(line: string): void {
    this.stdout.emit('data', Buffer.from(`${line}\n`));
  }
}

const fakeDriver = {
  validateInstallation: () => true,
  buildLaunchPlan: () => ({ executable: 'server', args: [], cwd: '.' }),
  buildStopCommand: () => 'stop\n',
  buildSaveCommand: () => 'save\n',
  buildBroadcastCommand: (message: string) => `say ${message}\n`,
  parseLogLine: (line: string) => (line.includes('Ready') ? { isReady: true } : null)
} as unknown as IGameDriver;

describe('server resilience', () => {
  let dir: string;
  let children: FakeChild[];
  let spawn: SpawnFunction;

  const makeSupervisor = (patch: Partial<ServerConfig> = {}) =>
    new ProcessSupervisor(
      {
        id: 'a',
        workingDir: dir,
        jarFile: 'server.jar',
        javaPath: 'java',
        minRamMb: 512,
        maxRamMb: 1024,
        stopTimeoutMs: 1000,
        metricsIntervalMs: 60_000,
        positionPollIntervalMs: 60_000,
        restartBackoffMs: 100,
        ...patch
      },
      spawn,
      fakeDriver
    );

  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-resilience-'));
    children = [];
    spawn = (() => {
      const child = new FakeChild();
      children.push(child);
      return child as never;
    }) as SpawnFunction;
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('restarts after a crash with backoff and not after a requested stop', () => {
    const supervisor = makeSupervisor({ autoRestart: true });
    supervisor.start();
    children[0].exit(1);
    expect(children).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(children).toHaveLength(2);

    supervisor.stop();
    children[1].exit(0);
    vi.advanceTimersByTime(10_000);
    expect(children).toHaveLength(2);
  });

  it('does not restart when auto-restart is off', () => {
    const supervisor = makeSupervisor();
    supervisor.start();
    children[0].exit(1);
    vi.advanceTimersByTime(10_000);
    expect(children).toHaveLength(1);
  });

  it('gives up after repeated crashes', () => {
    const supervisor = makeSupervisor({ autoRestart: true, restartBackoffMs: 1 });
    supervisor.start();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      children[children.length - 1].exit(1);
      vi.advanceTimersByTime(60_000);
    }
    expect(children).toHaveLength(6);
  });

  it('warns players and restarts on schedule', () => {
    const supervisor = makeSupervisor({ scheduledRestartHours: 1, restartWarnMs: 5000 });
    supervisor.start();
    children[0].say('Ready');
    expect(supervisor.getStatus()).toBe('ONLINE');

    vi.advanceTimersByTime(3_600_000);
    expect(children[0].stdin.write).toHaveBeenCalledWith('say Server restarting in 5 seconds\n');
    vi.advanceTimersByTime(5000);
    expect(children[0].stdin.write).toHaveBeenCalledWith('stop\n');
  });

  it('keeps console history across supervisors', () => {
    const first = makeSupervisor();
    first.start();
    children[0].say('hello world');
    first.flushConsoleLog();

    const second = makeSupervisor();
    expect(second.getConsoleBuffer().some((line) => line.includes('hello world'))).toBe(true);
  });
});

describe('BackupManager', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-backup-'));
    fs.mkdirSync(path.join(dir, 'world'));
    fs.writeFileSync(path.join(dir, 'world', 'level.dat'), 'v1');
    fs.writeFileSync(path.join(dir, 'server.cfg'), 'cfg');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('backs up declared paths, restores them and prunes old backups', () => {
    const manager = new BackupManager(dir);
    const backup = manager.create(['world'], 2);
    fs.writeFileSync(path.join(dir, 'world', 'level.dat'), 'v2');

    manager.restore(backup.name);
    expect(fs.readFileSync(path.join(dir, 'world', 'level.dat'), 'utf-8')).toBe('v1');

    manager.create(['world'], 2, 'a');
    manager.create(['world'], 2, 'b');
    expect(manager.list()).toHaveLength(2);
  });

  it('zips the whole instance without nested backups when no paths are declared', () => {
    const manager = new BackupManager(dir);
    manager.create(undefined, 5);
    const second = manager.create(undefined, 5, 'x');
    fs.rmSync(path.join(dir, 'server.cfg'));
    manager.restore(second.name);
    expect(fs.existsSync(path.join(dir, 'server.cfg'))).toBe(true);
  });

  it('rejects names that escape the backups folder', () => {
    const manager = new BackupManager(dir);
    expect(() => manager.restore('../../etc/passwd')).toThrow();
    expect(() => manager.remove('..\\x.zip')).toThrow();
  });
});
