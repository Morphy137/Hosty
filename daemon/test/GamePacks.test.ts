import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateManifest } from '../src/core/gamepacks/manifest';
import { DeclarativeGameDriver, renderTemplate, resolvePlatformValue } from '../src/core/gamepacks/DeclarativeDriver';
import { GameDriverRegistry } from '../src/core/drivers/GameDriverRegistry';
import { readConfigFile, resolveConfigPath, writeConfigFile } from '../src/core/ConfigFileEditor';
import { buildSteamCmdArgs } from '../src/provisioning/SteamCmd';

const validManifest = {
  apiVersion: 1,
  id: 'valheim',
  name: 'Valheim',
  version: '1.0.0',
  defaults: { port: 2456, maxPlayers: 10 },
  launch: { executable: 'valheim_server.exe', args: ['-name', '{{name}}', '-port', '{{port}}'] },
  logs: {
    ready: 'Game server connected',
    join: 'Got connection SteamID (?<username>\\d+)',
    leave: 'Closing socket (?<username>\\d+)'
  },
  commands: { stop: 'ctrl+c', save: null },
  configFiles: [{ path: 'adminlist.txt', format: 'lines' }],
  capabilities: { players: true, mods: false, configEditor: false, bridge: false }
};

describe('validateManifest', () => {
  it('accepts a complete manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.ok).toBe(true);
    expect(result.manifest?.id).toBe('valheim');
  });

  it('reports every problem with actionable messages', () => {
    const result = validateManifest({
      apiVersion: 2,
      id: 'Bad Id',
      name: '',
      defaults: { port: 70000, maxPlayers: 0 },
      launch: {},
      logs: { ready: '(' },
      logo: '../escape.png'
    });
    expect(result.ok).toBe(false);
    const text = result.errors.join('\n');
    expect(text).toContain('apiVersion');
    expect(text).toContain('id must be');
    expect(text).toContain('defaults.port');
    expect(text).toContain('launch.executable');
    expect(text).toContain('invalid regular expression');
    expect(text).toContain('logo must be a relative path');
  });
});

describe('DeclarativeGameDriver', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-pack-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const driver = () => new DeclarativeGameDriver(validateManifest(validManifest).manifest!, null);

  it('renders launch arguments from instance values', () => {
    const plan = driver().buildLaunchPlan({ workingDir: dir, name: 'My World', port: 2460 });
    expect(plan.args).toEqual(['-name', 'My World', '-port', '2460']);
    expect(plan.executable).toBe(path.join(path.resolve(dir), 'valheim_server.exe'));
  });

  it('parses log lines with named groups and translates stop/save commands', () => {
    const d = driver();
    expect(d.parseLogLine('Game server connected')).toEqual({ isReady: true });
    expect(d.parseLogLine('Got connection SteamID 7656')?.playerJoin?.username).toBe('7656');
    expect(d.parseLogLine('Closing socket 7656')?.playerLeave).toBe('7656');
    expect(d.buildStopCommand()).toBe('\u0003');
    expect(d.buildSaveCommand()).toBe('');
  });

  it('exposes capabilities and config files in the summary', () => {
    const summary = driver().summary;
    expect(summary.capabilities).toEqual({ players: true, mods: false, configEditor: false, bridge: false });
    expect(summary.defaultPort).toBe(2456);
    expect(summary.source).toBe('pack');
  });

  it('runs java packs as java -jar with RAM flags', () => {
    const manifest = validateManifest({
      ...validManifest,
      id: 'javagame',
      launch: { runtime: 'java', executable: 'server.jar', args: ['--port', '{{port}}'] }
    }).manifest!;
    const plan = new DeclarativeGameDriver(manifest, null).buildLaunchPlan({
      workingDir: dir,
      javaPath: 'java',
      minRamMb: 512,
      maxRamMb: 2048,
      port: 1234
    });
    expect(plan.executable).toBe('java');
    expect(plan.args).toEqual(['-Xms512M', '-Xmx2048M', '-XX:+UseG1GC', '-jar', 'server.jar', '--port', '1234']);
  });

  it('resolves platform values and templates', () => {
    expect(resolvePlatformValue({ win32: 'a.exe', default: 'a.sh' }, 'win32')).toBe('a.exe');
    expect(resolvePlatformValue({ win32: 'a.exe', default: 'a.sh' }, 'linux')).toBe('a.sh');
    expect(renderTemplate('{{a}}-{{missing}}', { a: 1 })).toBe('1-');
  });
});

describe('pack loading and trust', () => {
  let gamesDir: string;
  beforeEach(() => {
    gamesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-games-'));
  });
  afterEach(() => fs.rmSync(gamesDir, { recursive: true, force: true }));

  const writePack = (folder: string, manifest: object, driverCode?: string) => {
    const dir = path.join(gamesDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hosty-game.json'), JSON.stringify(manifest));
    if (driverCode) fs.writeFileSync(path.join(dir, 'driver.js'), driverCode);
  };

  it('registers valid packs, reports invalid ones and protects built-ins', () => {
    writePack('valheim', validManifest);
    writePack('broken', { apiVersion: 1, id: 'x' });
    writePack('minecraft', { ...validManifest, id: 'minecraft' });

    const registry = new GameDriverRegistry();
    const infos = registry.loadPacks(gamesDir);

    expect(registry.hasDriver('valheim')).toBe(true);
    expect(registry.getDriver('minecraft').summary.source).toBe('builtin');
    expect(infos.find((i) => i.dir.endsWith('broken'))?.errors.length).toBeGreaterThan(0);
    expect(infos.find((i) => i.id === 'minecraft')?.errors.join(' ')).toContain('built-in');
  });

  it('never runs driver.js until the user trusts that exact file', () => {
    const marker = path.join(gamesDir, 'ran.txt').replace(/\\/g, '/');
    const code = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');
      module.exports.createDriver = () => ({ buildStopCommand: () => 'custom-stop\\n' });`;
    writePack('valheim', validManifest, code);

    const registry = new GameDriverRegistry();
    registry.loadPacks(gamesDir);
    expect(fs.existsSync(marker)).toBe(false);
    expect(registry.getPackInfos().filter((pack) => pack.source === 'external')[0]).toMatchObject({ hasCode: true, trusted: false, loaded: true });
    expect(registry.getDriver('valheim').buildStopCommand()).toBe('\u0003');

    expect(registry.trustPack('valheim')).toBe(true);
    expect(registry.getPackInfos().filter((pack) => pack.source === 'external')[0].trusted).toBe(true);
    expect(registry.getDriver('valheim').buildStopCommand()).toBe('custom-stop\n');

    // Editing the code invalidates the approval.
    fs.appendFileSync(path.join(gamesDir, 'valheim', 'driver.js'), '\n// changed');
    registry.reloadPacks();
    expect(registry.getPackInfos().filter((pack) => pack.source === 'external')[0].trusted).toBe(false);
  });
});

describe('config file editor', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-cfg-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('edits ini/properties files preserving comments and sections', () => {
    const file = path.join(dir, 'servertest.ini');
    fs.writeFileSync(file, '# comment\nPublicName=Old\nMaxPlayers=16\n[Extra]\nFlag=true\n');

    const entries = readConfigFile(file, 'ini');
    expect(entries).toEqual([
      { key: 'PublicName', value: 'Old', type: 'string' },
      { key: 'MaxPlayers', value: 16, type: 'number' },
      { key: 'Extra.Flag', value: true, type: 'boolean' }
    ]);

    writeConfigFile(file, 'ini', { PublicName: 'New', 'Extra.Flag': false });
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('# comment');
    expect(content).toContain('PublicName=New');
    expect(content).toContain('Flag=false');
    expect(content).toContain('MaxPlayers=16');
  });

  it('flattens json and writes back nested values without creating structure', () => {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ name: 'x', network: { port: 1, list: [1] } }));
    expect(readConfigFile(file, 'json').map((e) => e.key)).toEqual(['name', 'network.port']);

    writeConfigFile(file, 'json', { 'network.port': 2, 'missing.key': 'ignored' });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ name: 'x', network: { port: 2, list: [1] } });
  });

  it('refuses paths outside the instance', () => {
    expect(() => resolveConfigPath(dir, '../secret.txt')).toThrow();
    expect(resolveConfigPath(dir, 'a/b.ini')).toBe(path.join(path.resolve(dir), 'a', 'b.ini'));
  });
});

describe('SteamCMD', () => {
  it('builds an anonymous app_update command with optional beta branch', () => {
    expect(buildSteamCmdArgs({ appId: 380870, installDir: 'C:/pz' })).toEqual([
      '+force_install_dir', 'C:/pz', '+login', 'anonymous', '+app_update', '380870', 'validate', '+quit'
    ]);
    expect(buildSteamCmdArgs({ appId: 380870, branch: 'unstable', installDir: 'C:/pz' })).toContain('-beta');
  });
});

describe('pack install, uninstall and built-in listing', () => {
  it('lists built-in games as read-only entries', () => {
    const registry = new GameDriverRegistry();
    const ids = registry.getPackInfos().filter((pack) => pack.source === 'builtin').map((pack) => pack.id);
    expect(ids).toEqual(expect.arrayContaining(['minecraft', 'project-zomboid', 'hytale']));
  });

  it('installs a valid pack folder, never trusts its code, and uninstalls it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-install-'));
    const games = path.join(root, 'games');
    const source = path.join(root, 'src-pack');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(
      path.join(source, 'hosty-game.json'),
      JSON.stringify({ ...validManifest, id: 'demo-game', name: 'Demo Game' })
    );

    const registry = new GameDriverRegistry();
    registry.loadPacks(games);
    registry.installPack(source);
    expect(registry.hasDriver('demo-game')).toBe(true);
    expect(fs.existsSync(path.join(games, 'demo-game', 'hosty-game.json'))).toBe(true);

    expect(registry.uninstallPack('demo-game')).toBe(true);
    expect(registry.hasDriver('demo-game')).toBe(false);
    expect(registry.uninstallPack('minecraft')).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
