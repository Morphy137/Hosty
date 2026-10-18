import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ModFileManager } from '../src/core/ModFileManager';
import { DaemonError } from '../src/errors';

describe('ModFileManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-modjar-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates mod filenames and blocks path traversal', () => {
    expect(() => ModFileManager.validateModFilename('../bad.jar')).toThrowError(DaemonError);
    // The game declares which files are mods; without a declaration any file is accepted.
    const jarOnly = { fileTypes: ['.jar'] };
    expect(() => ModFileManager.validateModFilename('bad.exe', jarOnly)).toThrowError(DaemonError);
    expect(ModFileManager.validateModFilename('mod.zip')).toBe('mod.zip');
    expect(ModFileManager.validateModFilename('jei-1.21.jar.disabled', jarOnly)).toBe('jei-1.21.jar.disabled');
    expect(ModFileManager.validateModFilename('jei-1.21.jar')).toBe('jei-1.21.jar');
    expect(ModFileManager.validateModFilename('jei-1.21.jar.disabled')).toBe('jei-1.21.jar.disabled');
    expect(ModFileManager.validateModFilename('jei-1.21.jar.disable')).toBe('jei-1.21.jar.disable');
  });

  it('reports the config files that belong to each mod', () => {
    fs.mkdirSync(path.join(tmpDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'mods', 'create-1.21.jar'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'mods', 'lonely.jar'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'config', 'create-1.21.toml'), '');
    fs.writeFileSync(path.join(tmpDir, 'config', 'create-1.21.txt'), '');
    fs.writeFileSync(path.join(tmpDir, 'config', 'other.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'config', 'lonely', 'client'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'config', 'lonely', 'client', 'settings.cfg'), '');

    const byName = new Map(ModFileManager.listModFiles(tmpDir).map((mod) => [mod.originalName, mod]));
    expect(byName.get('create-1.21.jar')).toMatchObject({ hasConfig: true, configFiles: ['create-1.21.toml', 'create-1.21.txt'] });
    // A folder named like the mod brings every file inside it.
    expect(byName.get('lonely.jar')).toMatchObject({ hasConfig: true, configFiles: ['lonely/client/settings.cfg'] });
  });

  it('lists mod files with formatted size and enabled flag', () => {
    const modsDir = path.join(tmpDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    fs.writeFileSync(path.join(modsDir, 'active-mod.jar'), 'dummy-jar-content');
    fs.writeFileSync(path.join(modsDir, 'disabled-mod.jar.disabled'), 'disabled-content');
    fs.writeFileSync(path.join(modsDir, 'modrinth-mod.jar.disable'), 'disable-content');

    const list = ModFileManager.listModFiles(tmpDir);
    expect(list).toHaveLength(3);

    const active = list.find((m) => m.filename === 'active-mod.jar');
    expect(active?.enabled).toBe(true);

    const disabled1 = list.find((m) => m.filename === 'disabled-mod.jar.disabled');
    expect(disabled1?.enabled).toBe(false);

    const disabled2 = list.find((m) => m.filename === 'modrinth-mod.jar.disable');
    expect(disabled2?.enabled).toBe(false);
  });

  it('toggles mod file between .jar and .jar.disable (and supports .jar.disabled)', () => {
    const modsDir = path.join(tmpDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    fs.writeFileSync(path.join(modsDir, 'test-mod.jar'), 'content');

    const toggled = ModFileManager.toggleMod(tmpDir, 'test-mod.jar');
    expect(toggled.filename).toBe('test-mod.jar.disable');
    expect(toggled.enabled).toBe(false);
    expect(fs.existsSync(path.join(modsDir, 'test-mod.jar.disable'))).toBe(true);
    expect(fs.existsSync(path.join(modsDir, 'test-mod.jar'))).toBe(false);

    const reEnabled = ModFileManager.toggleMod(tmpDir, 'test-mod.jar.disable');
    expect(reEnabled.filename).toBe('test-mod.jar');
    expect(reEnabled.enabled).toBe(true);

    // Also verify .disabled works
    fs.writeFileSync(path.join(modsDir, 'legacy-mod.jar.disabled'), 'content');
    const legacyReEnabled = ModFileManager.toggleMod(tmpDir, 'legacy-mod.jar.disabled');
    expect(legacyReEnabled.filename).toBe('legacy-mod.jar');
    expect(legacyReEnabled.enabled).toBe(true);
  });

  it('deletes mod file safely', () => {
    const modsDir = path.join(tmpDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    fs.writeFileSync(path.join(modsDir, 'to-delete.jar'), 'content');
    ModFileManager.deleteMod(tmpDir, 'to-delete.jar');
    expect(fs.existsSync(path.join(modsDir, 'to-delete.jar'))).toBe(false);
  });
});
