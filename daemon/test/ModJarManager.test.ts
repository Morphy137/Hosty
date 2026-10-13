import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ModJarManager } from '../src/core/ModJarManager';
import { DaemonError } from '../src/errors';

describe('ModJarManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-modjar-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates mod filenames and blocks path traversal', () => {
    expect(() => ModJarManager.validateModFilename('../bad.jar')).toThrowError(DaemonError);
    expect(() => ModJarManager.validateModFilename('bad.exe')).toThrowError(DaemonError);
    expect(ModJarManager.validateModFilename('jei-1.21.jar')).toBe('jei-1.21.jar');
    expect(ModJarManager.validateModFilename('jei-1.21.jar.disabled')).toBe('jei-1.21.jar.disabled');
  });

  it('lists mod files with formatted size and enabled flag', () => {
    const modsDir = path.join(tmpDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    fs.writeFileSync(path.join(modsDir, 'active-mod.jar'), 'dummy-jar-content');
    fs.writeFileSync(path.join(modsDir, 'disabled-mod.jar.disabled'), 'disabled-content');

    const list = ModJarManager.listModFiles(tmpDir);
    expect(list).toHaveLength(2);

    const active = list.find((m) => m.filename === 'active-mod.jar');
    expect(active?.enabled).toBe(true);

    const disabled = list.find((m) => m.filename === 'disabled-mod.jar.disabled');
    expect(disabled?.enabled).toBe(false);
  });

  it('toggles mod file between .jar and .jar.disabled', () => {
    const modsDir = path.join(tmpDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    fs.writeFileSync(path.join(modsDir, 'test-mod.jar'), 'content');

    const toggled = ModJarManager.toggleMod(tmpDir, 'test-mod.jar');
    expect(toggled.filename).toBe('test-mod.jar.disabled');
    expect(toggled.enabled).toBe(false);
    expect(fs.existsSync(path.join(modsDir, 'test-mod.jar.disabled'))).toBe(true);
    expect(fs.existsSync(path.join(modsDir, 'test-mod.jar'))).toBe(false);

    const reEnabled = ModJarManager.toggleMod(tmpDir, 'test-mod.jar.disabled');
    expect(reEnabled.filename).toBe('test-mod.jar');
    expect(reEnabled.enabled).toBe(true);
  });

  it('deletes mod file safely', () => {
    const modsDir = path.join(tmpDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    fs.writeFileSync(path.join(modsDir, 'to-delete.jar'), 'content');
    ModJarManager.deleteMod(tmpDir, 'to-delete.jar');
    expect(fs.existsSync(path.join(modsDir, 'to-delete.jar'))).toBe(false);
  });
});
