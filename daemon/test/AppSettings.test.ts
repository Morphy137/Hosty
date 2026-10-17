import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  APP_SETTINGS_FILE,
  AppSettingsStore,
  DEFAULT_APP_SETTINGS,
  parseAppSettingsPatch
} from '../src/core/AppSettingsStore';
import { InstanceManager } from '../src/core/InstanceManager';
import { DaemonError } from '../src/errors';

describe('AppSettingsStore', () => {
  let tmpDir: string;
  let file: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-app-settings-'));
    file = path.join(tmpDir, APP_SETTINGS_FILE);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts from the defaults without a file', () => {
    expect(new AppSettingsStore(file).get()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('persists updates across instances', () => {
    new AppSettingsStore(file).update({ defaultMemoryMb: 6144, defaultJavaPath: ' C:\\Java\\bin\\java.exe ' });
    expect(new AppSettingsStore(file).get()).toEqual({
      defaultMemoryMb: 6144,
      defaultJavaPath: 'C:\\Java\\bin\\java.exe',
      defaultAutostart: false
    });
  });

  it('ignores invalid stored values', () => {
    fs.writeFileSync(file, JSON.stringify({ defaultMemoryMb: 12, defaultJavaPath: 5, defaultAutostart: 'yes' }));
    expect(new AppSettingsStore(file).get()).toEqual(DEFAULT_APP_SETTINGS);
  });
});

describe('parseAppSettingsPatch', () => {
  it('accepts valid fields', () => {
    expect(parseAppSettingsPatch({ defaultMemoryMb: null, defaultAutostart: true })).toEqual({
      defaultMemoryMb: null,
      defaultAutostart: true
    });
  });

  it.each([
    [null],
    [[]],
    [{ defaultMemoryMb: 100 }],
    [{ defaultMemoryMb: 2048.5 }],
    [{ defaultJavaPath: 3 }],
    [{ defaultAutostart: 'true' }],
    [{ somethingElse: 1 }]
  ])('rejects %j', (body) => {
    expect(() => parseAppSettingsPatch(body)).toThrow(DaemonError);
  });
});

describe('InstanceManager creation defaults', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-defaults-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies the app defaults only where the creation settings say nothing', () => {
    const manager = new InstanceManager(tmpDir);
    manager.setCreationDefaults(() => ({ memoryMb: 768, javaPath: '/opt/java', autostart: true }));

    const plain = manager.createInstance('plain', 'Plain');
    expect(plain.maxRamMb).toBe(768);
    expect(plain.minRamMb).toBe(768);
    expect(plain.javaPath).toBe('/opt/java');
    expect(plain.autostart).toBe(true);

    const explicit = manager.createInstance('explicit', 'Explicit', {
      maxRamMb: 8192,
      javaPath: 'java',
      autostart: false
    });
    expect(explicit.maxRamMb).toBe(8192);
    expect(explicit.javaPath).toBe('java');
    expect(explicit.autostart).toBe(false);
  });
});
