import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { TelemetryBridgeManager } from '../src/core/bridge/TelemetryBridgeManager';

describe('bridge removal', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('deletes the bridge jar and reports the installed state', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-bridge-'));
    fs.mkdirSync(path.join(dir, 'mods'));
    fs.writeFileSync(path.join(dir, 'mods', 'mc-nexus-bridge.jar'), 'x');
    fs.writeFileSync(path.join(dir, 'mods', 'other.jar'), 'x');

    expect(TelemetryBridgeManager.isBridgeInstalled(dir, ['mods'])).toBe(true);
    expect(TelemetryBridgeManager.removeBridge(dir, ['mods', 'plugins'])).toBe(1);
    expect(TelemetryBridgeManager.isBridgeInstalled(dir, ['mods'])).toBe(false);
    expect(fs.existsSync(path.join(dir, 'mods', 'other.jar'))).toBe(true);
  });
});
