import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createPackHarness, defineGame, type GameManifest } from '../../packages/game-sdk/src/index';
import { DeclarativeGameDriver } from '../src/core/gamepacks/DeclarativeDriver';
import { validateManifest } from '../src/core/gamepacks/manifest';

const repoRoot = path.resolve(__dirname, '../..');
const readJson = (relative: string) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf-8'));

describe('game pack SDK vs daemon', () => {
  it('ships example and template manifests that the daemon accepts', () => {
    for (const file of ['docs/examples/valheim/hosty-game.json', 'packages/create-hosty-game/template/hosty-game.json']) {
      const raw = readJson(file);
      const result = validateManifest({ ...raw, id: String(raw.id).includes('__') ? 'template-pack' : raw.id });
      expect(result.errors, file).toEqual([]);
    }
  });

  it('the SDK harness behaves like the daemon driver', () => {
    const manifest = defineGame(readJson('docs/examples/valheim/hosty-game.json') as GameManifest);
    const harness = createPackHarness(manifest);
    const driver = new DeclarativeGameDriver(validateManifest(manifest).manifest!, null);

    expect(harness.stopCommand()).toBe(driver.buildStopCommand());
    expect(harness.saveCommand()).toBe(driver.buildSaveCommand());
    for (const line of ['Game server connected', 'Got connection SteamID 123', 'Closing socket 123', 'noise']) {
      expect(harness.parseLog(line)?.isReady).toBe(driver.parseLogLine(line)?.isReady);
      expect(harness.parseLog(line)?.playerJoin?.username).toBe(driver.parseLogLine(line)?.playerJoin?.username);
      expect(harness.parseLog(line)?.playerLeave).toBe(driver.parseLogLine(line)?.playerLeave);
    }
  });

  it('passes setup values to launch arguments as placeholders', () => {
    const manifest = validateManifest(readJson('docs/examples/valheim/hosty-game.json')).manifest!;
    const plan = new DeclarativeGameDriver(manifest, null).buildLaunchPlan({
      workingDir: '.',
      name: 'Vikings',
      port: 2456,
      gameConfig: { password: 'hunter2' }
    });
    expect(plan.args).toEqual(['-name', 'Vikings', '-port', '2456', '-world', 'Dedicated', '-password', 'hunter2']);
  });
});
