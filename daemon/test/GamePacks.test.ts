import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateManifest } from '../src/core/gamepacks/manifest';
import { DeclarativeGameDriver, expandGlob, renderTemplate, resolvePlatformValue } from '../src/core/gamepacks/DeclarativeDriver';
import { GameDriverRegistry } from '../src/core/drivers/GameDriverRegistry';
import { BUNDLED_GAMES_DIR, createSeededRegistry } from './helpers/packs';
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
  it('validates the optional in-game server icon', () => {
    expect(validateManifest({ ...validManifest, serverIcon: { file: 'icon.png', size: 64 } }).ok).toBe(true);
    for (const serverIcon of [{ file: 'icon.jpg', size: 64 }, { file: '../icon.png', size: 64 }, { file: 'icon.png', size: 4 }]) {
      expect(validateManifest({ ...validManifest, serverIcon }).errors.join(' ')).toMatch(/serverIcon/);
    }
  });

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

  it('registers valid packs and reports invalid ones', () => {
    writePack('valheim', validManifest);
    writePack('broken', { apiVersion: 1, id: 'x' });

    const registry = new GameDriverRegistry();
    const infos = registry.loadPacks(gamesDir);

    expect(registry.hasDriver('valheim')).toBe(true);
    expect(infos.find((i) => i.dir.endsWith('broken'))?.errors.length).toBeGreaterThan(0);
  });

  it('never runs driver.js until the user trusts that exact file', () => {
    const marker = path.join(gamesDir, 'ran.txt').replace(/\\/g, '/');
    const code = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');
      module.exports.createDriver = () => ({ buildStopCommand: () => 'custom-stop\\n' });`;
    writePack('valheim', validManifest, code);

    const registry = new GameDriverRegistry();
    registry.loadPacks(gamesDir);
    expect(fs.existsSync(marker)).toBe(false);
    expect(registry.getPackInfos()[0]).toMatchObject({ hasCode: true, trusted: false, loaded: true });
    expect(registry.getDriver('valheim').buildStopCommand()).toBe('\u0003');

    expect(registry.trustPack('valheim')).toBe(true);
    expect(registry.getPackInfos()[0].trusted).toBe(true);
    expect(registry.getDriver('valheim').buildStopCommand()).toBe('custom-stop\n');

    // Editing the code invalidates the approval.
    fs.appendFileSync(path.join(gamesDir, 'valheim', 'driver.js'), '\n// changed');
    registry.reloadPacks();
    expect(registry.getPackInfos()[0].trusted).toBe(false);
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

describe('pack install, uninstall and seeding', () => {
  it('copies the bundled games into the games folder as packs', () => {
    const registry = createSeededRegistry();
    const ids = registry.getPackInfos().map((pack) => pack.id);
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
    expect(registry.uninstallPack('demo-game')).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('documented example packs', () => {
  it.each(['valheim', 'project-zomboid', 'hytale'])('docs/examples/%s is a valid manifest with its logo', (name) => {
    const dir = path.resolve(__dirname, '../../docs/examples', name);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'hosty-game.json'), 'utf-8'));
    const result = validateManifest(raw);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    if (raw.logo) expect(fs.existsSync(path.join(dir, raw.logo))).toBe(true);
  });
});

describe('extensible manifest surface', () => {
  let dir: string;
  const platform = process.platform as 'win32' | 'linux' | 'darwin';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-discover-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const javaManifest = (extra: Record<string, unknown>) => {
    const result = validateManifest({
      ...validManifest,
      id: 'java-game',
      launch: {
        runtime: 'java',
        executable: 'server.jar',
        args: ['nogui'],
        discover: [
          {
            glob: 'libraries/loader/*/args.txt',
            platform,
            args: [{ arg: '@user_jvm_args.txt', ifExists: 'user_jvm_args.txt' }, '@{{match}}', 'nogui']
          },
          { glob: 'legacy-*.jar', exclude: 'installer', mode: 'jar', args: ['nogui'] }
        ]
      },
      ...extra
    });
    expect(result.errors).toEqual([]);
    return result.manifest!;
  };

  const touch = (relative: string) => {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '');
  };

  it('expands single-segment wildcards in relative globs', () => {
    touch('libraries/loader/1.20.1-47/args.txt');
    touch('libraries/loader/1.21-1/args.txt');
    expect(expandGlob(dir, 'libraries/loader/*/args.txt')).toEqual([
      'libraries/loader/1.20.1-47/args.txt',
      'libraries/loader/1.21-1/args.txt'
    ]);
    expect(expandGlob(dir, 'missing/*/args.txt')).toEqual([]);
  });

  it('launches through a discovered args file and only includes optional args that exist', () => {
    touch('libraries/loader/1.21-1/args.txt');
    const driver = new DeclarativeGameDriver(javaManifest({}), null);
    expect(driver.validateInstallation(dir)).toBe(true);

    const without = driver.buildLaunchPlan({ workingDir: dir });
    expect(without.args).toContain('@libraries/loader/1.21-1/args.txt');
    expect(without.args).not.toContain('@user_jvm_args.txt');
    expect(without.args).not.toContain('-jar');

    touch('user_jvm_args.txt');
    expect(driver.buildLaunchPlan({ workingDir: dir }).args).toContain('@user_jvm_args.txt');
  });

  it('runs a discovered legacy jar with -jar and skips installers', () => {
    touch('legacy-1.12.2-installer.jar');
    touch('legacy-1.12.2.jar');
    const driver = new DeclarativeGameDriver(javaManifest({}), null);
    const plan = driver.buildLaunchPlan({ workingDir: dir });
    expect(plan.args.slice(plan.args.indexOf('-jar'))).toEqual(['-jar', 'legacy-1.12.2.jar', 'nogui']);
  });

  it('keeps the default collector unless the user chose one, and removes duplicate flags', () => {
    touch('server.jar');
    const driver = new DeclarativeGameDriver(javaManifest({}), null);
    const zgc = driver.buildLaunchPlan({ workingDir: dir, jvmArgs: ['-XX:+UseZGC', '-XX:+UseZGC'] });
    expect(zgc.args.filter((arg) => arg === '-XX:+UseZGC')).toHaveLength(1);
    expect(zgc.args).not.toContain('-XX:+UseG1GC');
    expect(driver.buildLaunchPlan({ workingDir: dir }).args).toContain('-XX:+UseG1GC');
  });

  it('polls players with declared queries and applies parsed answers', () => {
    const driver = new DeclarativeGameDriver(
      javaManifest({
        playerQueries: [
          {
            id: 'pos',
            command: 'where {{player}}',
            pattern: '(?<username>\\w+) is at (?<x>-?[\\d.]+),(?<y>-?[\\d.]+)',
            fields: { x: 'number', y: 'number' }
          }
        ]
      }),
      null
    );
    const written: string[] = [];
    const pending = new Set<string>();
    driver.pollPlayerPositions({ write: (chunk: string) => written.push(chunk) } as never, ['Steve'], pending);
    expect(written).toEqual(['where Steve\n']);
    expect(pending.has('Steve:pos')).toBe(true);

    expect(driver.consumeQueryResponse('Steve is at 3.6,-2.2', pending)).toEqual({
      username: 'Steve',
      patch: { x: 4, y: -2 }
    });
    // Unsolicited lines are ignored.
    expect(driver.consumeQueryResponse('Alex is at 1,1', pending)).toBeNull();
  });

  it('rejects malformed discovery, queries and config sync', () => {
    const result = validateManifest({
      ...validManifest,
      launch: { executable: 'x', discover: [{ glob: '../escape/*.txt' }] },
      playerQueries: [{ id: 'q', command: 'c', pattern: '(?<name>.+)', fields: {} }],
      configSync: { file: '/abs.properties', format: 'yaml', map: {} }
    });
    expect(result.ok).toBe(false);
    const joined = result.errors.join(' | ');
    expect(joined).toMatch(/launch\.discover/);
    expect(joined).toMatch(/named group "username"/);
    expect(joined).toMatch(/configSync/);
  });

  it('describes Minecraft entirely through the manifest surface', () => {
    const registry = createSeededRegistry();
    expect(registry.getDefaultGameId()).toBe('minecraft');
    const summary = registry.getDriver('minecraft').summary;
    expect(summary.configSync?.map.port).toBe('server-port');
    expect(summary.bridgeLoaders).toEqual(expect.arrayContaining(['paper', 'fabric']));
    expect(summary.launchDefaults?.memoryMb).toBe(4096);
    expect(summary.serverIcon).toEqual({ file: 'server-icon.png', size: 64 });
    expect(registry.getDriver('project-zomboid').summary.serverIcon).toBeUndefined();
    expect(registry.getManifest('minecraft')?.playerQueries?.length).toBeGreaterThan(0);
  });
});

describe('bundled packs', () => {
  const freshGamesDir = (): string => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-seed-')), 'games');

  it('loads Minecraft, Project Zomboid and Hytale from the games folder with logos', () => {
    const registry = createSeededRegistry();
    for (const id of ['minecraft', 'project-zomboid', 'hytale']) {
      const info = registry.getPackInfos().find((pack) => pack.id === id);
      expect(info, id).toMatchObject({ loaded: true, enabled: true });
      expect(registry.getDriver(id).summary.hasLogo).toBe(true);
      expect(registry.resolvePackFile(id, 'hosty-game.json')).toContain('hosty-games-');
    }
    expect(registry.getPackInfos().find((pack) => pack.id === 'minecraft')).toMatchObject({ hasCode: true, trusted: true });
  });

  it('does not bring back a bundled game the user uninstalled', () => {
    const games = freshGamesDir();
    const registry = new GameDriverRegistry();
    registry.loadPacks(games, BUNDLED_GAMES_DIR);
    expect(registry.uninstallPack('hytale')).toBe(true);

    const restarted = new GameDriverRegistry();
    restarted.loadPacks(games, BUNDLED_GAMES_DIR);
    expect(restarted.hasDriver('hytale')).toBe(false);
    expect(restarted.hasDriver('minecraft')).toBe(true);
  });

  it('replaces a seeded game when the bundled one has a higher version, and only then', () => {
    const bundled = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-bundle-')), 'games');
    const games = freshGamesDir();
    const writeBundled = (version: string, name: string) => {
      fs.mkdirSync(path.join(bundled, 'valheim'), { recursive: true });
      fs.writeFileSync(path.join(bundled, 'valheim', 'hosty-game.json'), JSON.stringify({ ...validManifest, version, name }));
    };
    const installedName = () => JSON.parse(fs.readFileSync(path.join(games, 'valheim', 'hosty-game.json'), 'utf-8')).name;

    writeBundled('1.0.0', 'First');
    new GameDriverRegistry().loadPacks(games, bundled);
    writeBundled('1.0.0', 'Same version');
    new GameDriverRegistry().loadPacks(games, bundled);
    expect(installedName()).toBe('First');

    writeBundled('1.1.0', 'Upgraded');
    new GameDriverRegistry().loadPacks(games, bundled);
    expect(installedName()).toBe('Upgraded');
  });

  it('never overwrites a pack of the same id that the user installed first', () => {
    const bundled = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-bundle-')), 'games');
    const games = freshGamesDir();
    fs.mkdirSync(path.join(bundled, 'valheim'), { recursive: true });
    fs.writeFileSync(path.join(bundled, 'valheim', 'hosty-game.json'), JSON.stringify({ ...validManifest, name: 'Bundled' }));
    fs.mkdirSync(path.join(games, 'valheim'), { recursive: true });
    fs.writeFileSync(path.join(games, 'valheim', 'hosty-game.json'), JSON.stringify({ ...validManifest, name: 'Mine' }));

    new GameDriverRegistry().loadPacks(games, bundled);
    expect(JSON.parse(fs.readFileSync(path.join(games, 'valheim', 'hosty-game.json'), 'utf-8')).name).toBe('Mine');
  });

  it('switches games off and on, remembering the choice', () => {
    const games = freshGamesDir();
    fs.mkdirSync(path.join(games, 'valheim'), { recursive: true });
    fs.writeFileSync(path.join(games, 'valheim', 'hosty-game.json'), JSON.stringify(validManifest));

    const registry = new GameDriverRegistry();
    registry.loadPacks(games, BUNDLED_GAMES_DIR);
    registry.setPackEnabled('hytale', false);
    const infos = registry.setPackEnabled('valheim', false);
    expect(registry.hasDriver('hytale')).toBe(false);
    expect(registry.hasDriver('valheim')).toBe(false);
    expect(registry.listDrivers().map((game) => game.id)).not.toContain('hytale');
    expect(infos.find((pack) => pack.id === 'hytale')).toMatchObject({ enabled: false, loaded: false, errors: [] });

    // Persisted in the games folder and applied on the next start.
    const restarted = new GameDriverRegistry();
    restarted.loadPacks(games, BUNDLED_GAMES_DIR);
    expect(restarted.hasDriver('hytale')).toBe(false);
    expect(restarted.hasDriver('valheim')).toBe(false);

    restarted.setPackEnabled('hytale', true);
    expect(restarted.hasDriver('hytale')).toBe(true);
    expect(() => restarted.setPackEnabled('unknown-game', false)).toThrow(/not installed/);
  });

  it('lets every game be switched off and moves the default away from a disabled one', () => {
    const registry = new GameDriverRegistry();
    registry.loadPacks(freshGamesDir(), BUNDLED_GAMES_DIR);
    registry.setPackEnabled('minecraft', false);
    expect(registry.getDefaultGameId()).not.toBe('minecraft');
    registry.setPackEnabled('hytale', false);
    registry.setPackEnabled('project-zomboid', false);
    expect(registry.listDrivers()).toEqual([]);
    expect(registry.getDefaultGameId()).toBe('');
    expect(() => registry.getDriver()).toThrow(/No game is installed/);
    expect(() => registry.getDriver('minecraft')).toThrow(/not installed/);

    // Turning one back on makes it the default again.
    registry.setPackEnabled('hytale', true);
    expect(registry.getDefaultGameId()).toBe('hytale');
  });

  it('explains an empty games folder instead of failing obscurely', () => {
    const registry = new GameDriverRegistry();
    registry.loadPacks(freshGamesDir());
    expect(() => registry.getDriver()).toThrow(/No game is installed/);
  });
});

describe('declared layout, actions and defaults', () => {
  it('lets the bundled Minecraft pack declare folders, mods layout, bridge targets and actions', () => {
    const summary = createSeededRegistry().getDriver('minecraft').summary;
    expect(summary.instanceFolders).toEqual(['mods', 'config']);
    expect(summary.modLayout).toEqual({ modsDir: 'mods', configDir: 'config', fileTypes: ['.jar'] });
    expect(summary.installer?.variants.map((variant) => variant.id)).toContain('paper');
    expect(summary.dimensions?.find((dimension) => dimension.id === 'the_nether')?.aliases).toContain('minecraft:the_nether');
    expect(summary.playerActions?.filter((action) => action.quick).map((action) => action.id)).toEqual([
      'heal',
      'give',
      'damage',
      'kill'
    ]);
    expect(summary.bridgeTargets?.paper.dir).toBe('plugins');
    expect(summary.playerActions?.map((action) => action.id)).toEqual(expect.arrayContaining(['kick', 'ban', 'tp']));
    expect(summary.creationSettings?.map((setting) => setting.key)).toEqual(['gamemode', 'difficulty']);
  });

  it('picks the default game from the `default` flag, not from a literal', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-default-'));
    for (const [id, isDefault] of [['alpha', false], ['omega', true]] as const) {
      const dir = path.join(root, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'hosty-game.json'),
        JSON.stringify({ ...validManifest, id, name: id, ...(isDefault ? { default: true } : {}) })
      );
    }
    const registry = new GameDriverRegistry();
    registry.loadPacks(root);
    expect(registry.getDefaultGameId()).toBe('omega');
    expect(registry.getDriver().id).toBe('omega');
    expect(() => registry.getDriver('does-not-exist')).toThrow(/not installed/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('accepts an author with an https link and rejects anything else', () => {
    expect(validateManifest({ ...validManifest, author: { name: 'Ana', url: 'https://github.com/ana' } }).ok).toBe(true);
    expect(validateManifest({ ...validManifest, author: { name: 'Ana' } }).ok).toBe(true);
    for (const author of [{ name: '' }, { name: 'Ana', url: 'http://github.com/ana' }, { name: 'Ana', url: 'javascript:alert(1)' }, 'Ana']) {
      expect(validateManifest({ ...validManifest, author }).ok, JSON.stringify(author)).toBe(false);
    }
  });

  it('rejects malformed player actions, folders and bridge targets', () => {
    const result = validateManifest({
      ...validManifest,
      playerActions: [{ id: 'x', label: 'X' }],
      instanceFolders: ['../escape'],
      bridgeTargets: { default: { dir: '/abs', asset: 'a.jar' } },
      creationSettings: [{ id: 'g', label: 'G', type: 'select', file: '../x', key: 'k' }]
    });
    expect(result.ok).toBe(false);
    const joined = result.errors.join(' | ');
    expect(joined).toMatch(/playerActions/);
    expect(joined).toMatch(/instanceFolders/);
    expect(joined).toMatch(/bridgeTargets/);
    expect(joined).toMatch(/creationSettings/);
  });
});

