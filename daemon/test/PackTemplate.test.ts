import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPackHarness, type GameManifest } from '../../packages/game-sdk/src/index';
import { createPackFromTemplate } from '../src/core/gamepacks/PackTemplate';
import { validateManifest } from '../src/core/gamepacks/manifest';

const repoRoot = path.resolve(__dirname, '../..');
const templateDir = path.join(repoRoot, 'packages/create-hosty-game/template');
const bundledTemplateDir = path.join(repoRoot, 'daemon/assets/pack-template');
const temporaryDirs: string[] = [];

const makeGamesDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-template-'));
  temporaryDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('game pack template', () => {
  it('generates a pack that passes the daemon validation', () => {
    const gamesDir = makeGamesDir();
    const target = createPackFromTemplate(gamesDir, templateDir, 'demo-game', 'Demo Game');
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'hosty-game.json'), 'utf-8'));

    expect(manifest.id).toBe('demo-game');
    expect(manifest.name).toBe('Demo Game');
    expect(validateManifest(manifest).errors).toEqual([]);
    expect(fs.existsSync(path.join(target, manifest.logo))).toBe(true);
    expect(fs.existsSync(path.join(target, 'driver.js'))).toBe(false);
  });

  it('rejects invalid and duplicate ids', () => {
    const gamesDir = makeGamesDir();
    expect(() => createPackFromTemplate(gamesDir, templateDir, '../evil')).toThrow();
    createPackFromTemplate(gamesDir, templateDir, 'demo-game');
    expect(() => createPackFromTemplate(gamesDir, templateDir, 'demo-game')).toThrow(/already exists/);
  });

  it('keeps the daemon copy of the template in sync with the npm package', () => {
    for (const file of fs.readdirSync(templateDir)) {
      expect(fs.readFileSync(path.join(bundledTemplateDir, file), 'utf-8'), file).toBe(
        fs.readFileSync(path.join(templateDir, file), 'utf-8')
      );
    }
  });

  it('keeps the SDK validator generated from the daemon source', () => {
    const generated = fs.readFileSync(path.join(repoRoot, 'packages/game-sdk/src/validate.ts'), 'utf-8');
    const source = fs.readFileSync(path.join(repoRoot, 'daemon/src/core/gamepacks/manifest.ts'), 'utf-8');
    expect(generated.endsWith(source), 'run `npm --prefix packages/game-sdk run sync-validator`').toBe(true);
  });

  it('renders player actions and resolves dimensions in the SDK harness', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(templateDir, 'hosty-game.json'), 'utf-8')) as GameManifest;
    const harness = createPackHarness(manifest);

    expect(harness.renderAction('kick', 'Bob')).toEqual(['kick Bob']);
    expect(harness.renderAction('ban', 'Bob', { reason: 'griefing\nop @a' })).toEqual(['ban Bob griefing op @a']);
    expect(harness.resolveDimension('MAIN')?.id).toBe('world');
    expect(harness.resolveDimension('nether')).toBeUndefined();
  });
});
