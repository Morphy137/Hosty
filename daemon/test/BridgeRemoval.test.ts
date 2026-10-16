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

describe('bridge install config', () => {
  it('creates a bridge config for mod folders without overwriting it', () => {
    const assets = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-assets-'));
    const instance = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-inst-'));
    fs.writeFileSync(path.join(assets, 'mc-nexus-bridge-fabric.jar'), 'jar');
    const manager = new TelemetryBridgeManager(assets);
    const targets = { default: { dir: 'mods', asset: 'mc-nexus-bridge-fabric.jar' } };

    manager.installBridge(instance, 'fabric', targets);
    const configFile = path.join(instance, 'config', 'mc-nexus-bridge.json');
    expect(JSON.parse(fs.readFileSync(configFile, 'utf-8')).telemetryIntervalMs).toBe(1000);

    fs.writeFileSync(configFile, '{"telemetryIntervalMs":2000}');
    manager.installBridge(instance, 'fabric', targets);
    expect(JSON.parse(fs.readFileSync(configFile, 'utf-8')).telemetryIntervalMs).toBe(2000);
    fs.rmSync(assets, { recursive: true, force: true });
    fs.rmSync(instance, { recursive: true, force: true });
  });
});
