import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { driverRegistry } from '../src/core/drivers/GameDriverRegistry';
import { createSeededRegistry } from './helpers/packs';

describe('Game Drivers Architecture', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-drivers-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GameDriverRegistry', () => {
    it('registers and resolves default supported game drivers', () => {
      const registry = createSeededRegistry();
      expect(registry.hasDriver('minecraft')).toBe(true);
      expect(registry.hasDriver('project-zomboid')).toBe(true);
      expect(registry.hasDriver('hytale')).toBe(true);

      const mcDriver = registry.getDriver('minecraft');
      expect(mcDriver.id).toBe('minecraft');

      const pzDriver = registry.getDriver('project-zomboid');
      expect(pzDriver.id).toBe('project-zomboid');

      const hyDriver = registry.getDriver('hytale');
      expect(hyDriver.id).toBe('hytale');
    });

    it('uses the default game only when no game ID is given', () => {
      const registry = createSeededRegistry();
      expect(registry.getDriver(undefined).id).toBe('minecraft');

      // Another game's driver must never run an unknown game's server.
      expect(() => registry.getDriver('unknown-game-xyz')).toThrow(/not installed/);
      expect(registry.findDriver('unknown-game-xyz')).toBeNull();
      expect(registry.findDriver('MINECRAFT')?.id).toBe('minecraft');
    });

    it('lists summaries of all registered drivers with metadata', () => {
      const list = driverRegistry.listDrivers();
      expect(list.length).toBeGreaterThanOrEqual(3);

      const mcSummary = list.find((d) => d.id === 'minecraft');
      expect(mcSummary).toBeDefined();
      expect(mcSummary?.defaultPort).toBe(25565);
      expect(mcSummary?.supportsMods).toBe(true);

      const pzSummary = list.find((d) => d.id === 'project-zomboid');
      expect(pzSummary).toBeDefined();
      expect(pzSummary?.defaultPort).toBe(16261);
      expect(pzSummary?.category).toBe('survival');

      const hySummary = list.find((d) => d.id === 'hytale');
      expect(hySummary).toBeDefined();
      expect(hySummary?.category).toBe('voxel');
    });
  });

  describe('MinecraftDriver', () => {
    const driver = createSeededRegistry().getDriver('minecraft');

    it('does not add G1 when the user picked another collector, and deduplicates flags', () => {
      fs.writeFileSync(path.join(tmpDir, 'server.jar'), '');
      const zgc = driver.buildLaunchPlan({ workingDir: tmpDir, jvmArgs: ['-XX:+UseZGC', '-XX:+UseZGC'] });
      expect(zgc.args.filter((arg) => arg === '-XX:+UseZGC')).toHaveLength(1);
      expect(zgc.args).not.toContain('-XX:+UseG1GC');

      const plain = driver.buildLaunchPlan({ workingDir: tmpDir, jvmArgs: ['-XX:+UseG1GC'] });
      expect(plain.args.filter((arg) => arg === '-XX:+UseG1GC')).toHaveLength(1);
    });

    it('declares launch defaults and flag presets in its summary', () => {
      expect(driver.summary.launchDefaults?.memoryMb).toBeGreaterThan(0);
      expect(driver.summary.jvmFlagPresets?.map((preset) => preset.id)).toContain('aikar');
    });

    it('validates server installation based on server.jar existence', () => {
      expect(driver.validateInstallation(tmpDir)).toBe(false);

      fs.writeFileSync(path.join(tmpDir, 'server.jar'), 'dummy');
      expect(driver.validateInstallation(tmpDir)).toBe(true);
    });

    it('builds launch plan with JVM flags, RAM allocation and nogui', () => {
      const plan = driver.buildLaunchPlan({
        workingDir: tmpDir,
        javaPath: 'java.exe',
        jarFile: 'server.jar',
        minRamMb: 2048,
        maxRamMb: 6144,
        jvmArgs: ['-Dterminal.jline=false']
      });

      expect(plan.executable).toBe('java.exe');
      expect(plan.args).toContain('-Xms2048M');
      expect(plan.args).toContain('-Xmx6144M');
      expect(plan.args).toContain('-XX:+UseG1GC');
      expect(plan.args).toContain('-Dterminal.jline=false');
      expect(plan.args).toContain('-jar');
      expect(plan.args).toContain('server.jar');
      expect(plan.args).toContain('nogui');
    });

    it('builds standard Minecraft save and stop commands', () => {
      expect(driver.buildSaveCommand()).toBe('save-all\n');
      expect(driver.buildStopCommand()).toBe('stop\n');
    });

    it('parses Minecraft logs for ready state, join and leave events', () => {
      expect(driver.parseLogLine('[Server thread/INFO]: Done (4.215s)! For help, type "help"')).toEqual({
        isReady: true
      });

      const joinEvent = driver.parseLogLine('[Server thread/INFO]: MorphyCD joined the game');
      expect(joinEvent?.playerJoin?.username).toBe('MorphyCD');

      const leaveEvent = driver.parseLogLine('[Server thread/INFO]: MorphyCD left the game');
      expect(leaveEvent?.playerLeave).toBe('MorphyCD');
    });

    it('launches the installed variant, not files left behind by a previous loader', () => {
      const argsName = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
      const forgeDir = (version: string) => path.join(tmpDir, 'libraries', 'net', 'minecraftforge', 'forge', version);
      const writeArgs = (version: string, mtime: Date) => {
        fs.mkdirSync(forgeDir(version), { recursive: true });
        const file = path.join(forgeDir(version), argsName);
        fs.writeFileSync(file, '');
        fs.utimesSync(file, mtime, mtime);
      };
      writeArgs('1.20.1-47.2.0', new Date('2026-01-01'));
      fs.writeFileSync(path.join(tmpDir, 'server.jar'), '');

      // Switched from Forge to Paper: the leftover Forge libraries must not win.
      const paper = driver.buildLaunchPlan({ workingDir: tmpDir, loader: 'paper' });
      expect(paper.args).toEqual(expect.arrayContaining(['-jar', 'server.jar']));
      expect(paper.args.some((arg) => arg.includes(argsName))).toBe(false);

      // Two Forge versions installed: the most recent installation is launched.
      writeArgs('1.21.1-52.0.10', new Date('2025-01-01'));
      writeArgs('1.20.4-49.0.1', new Date('2026-06-01'));
      const forge = driver.buildLaunchPlan({ workingDir: tmpDir, loader: 'forge' });
      expect(forge.args).toContain(`@libraries/net/minecraftforge/forge/1.20.4-49.0.1/${argsName}`);
    });

    it('reads positions and dimensions from the declared player queries', () => {
      const pending = new Set<string>();
      const written: string[] = [];
      const stdin = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
      driver.pollPlayerPositions?.(stdin, ['MorphyCD'], pending);
      expect(written).toEqual(['data get entity MorphyCD Pos\n', 'data get entity MorphyCD Dimension\n']);

      const position = driver.consumeQueryResponse?.(
        '[12:00:00 INFO]: MorphyCD has the following entity data: [120.4d, 72.0d, -4.508E2d]',
        pending
      );
      expect(position).toEqual({ username: 'MorphyCD', patch: { x: 120, y: 72, z: -451 } });

      const dimension = driver.consumeQueryResponse?.(
        '[12:00:00 INFO]: MorphyCD has the following entity data: "minecraft:the_nether"',
        pending
      );
      expect(dimension).toEqual({ username: 'MorphyCD', patch: { dimension: 'the_nether' } });
      expect(pending.size).toBe(0);
    });
  });

  describe('ProjectZomboidDriver', () => {
    const driver = createSeededRegistry().getDriver('project-zomboid');

    it('validates server installation based on Zomboid executables or ini', () => {
      expect(driver.validateInstallation(tmpDir)).toBe(false);

      fs.writeFileSync(path.join(tmpDir, 'servertest.ini'), 'dummy');
      expect(driver.validateInstallation(tmpDir)).toBe(true);
    });

    it('builds launch plan with servername and memory parameters', () => {
      const plan = driver.buildLaunchPlan({
        workingDir: tmpDir,
        maxRamMb: 8192,
        port: 16261,
        gameConfig: { adminPassword: 's3cret' }
      });

      expect(plan.args).toContain('-servername');
      expect(plan.args).toContain('servertest');
      expect(plan.args).toContain('-memory');
      expect(plan.args).toContain('8192m');
      expect(plan.args).toContain('-port');
      expect(plan.args).toContain('16261');
      expect(plan.args.join(' ')).toContain('-udpport 16262');
      expect(plan.args.join(' ')).toContain('-adminpassword s3cret');
    });

    it('keeps its data and config inside the server folder, one port range per server', () => {
      const plan = driver.buildLaunchPlan({ workingDir: tmpDir, port: 16261 });
      expect(plan.args).toContain(`-cachedir=${path.resolve(tmpDir)}/Zomboid`);
      expect(driver.summary.configFiles.map((file) => file.path)).toEqual(['Zomboid/Server/servertest.ini']);
      expect(driver.summary.configSync?.file).toBe('Zomboid/Server/servertest.ini');
      expect(driver.summary.portStride).toBe(2);
      // Mods are Workshop ids in the ini, not files in mods/.
      expect(driver.summary.capabilities.mods).toBe(false);
      expect(driver.summary.setupSchema.find((field) => field.id === 'adminPassword')).toMatchObject({
        type: 'secret',
        required: true
      });
    });

    it('builds Zomboid save and quit commands', () => {
      expect(driver.buildSaveCommand()).toBe('save\n');
      expect(driver.buildStopCommand()).toBe('quit\n');
    });

    it('parses Zomboid logs for server ready, player connection and disconnect', () => {
      expect(driver.parseLogLine('*** SERVER STARTED ***')).toEqual({ isReady: true });
      expect(driver.parseLogLine('Server is now listening on port 16261')).toEqual({ isReady: true });

      const join = driver.parseLogLine('user "SurvivorBob" is connected');
      expect(join?.playerJoin?.username).toBe('SurvivorBob');
      expect(join?.playerJoin?.dimension).toBe('knox_county');

      const leave = driver.parseLogLine('user "SurvivorBob" disconnected');
      expect(leave?.playerLeave).toBe('SurvivorBob');
    });
  });

  describe('HytaleDriver', () => {
    const driver = createSeededRegistry().getDriver('hytale');

    it('validates server installation based on HytaleServer.jar or config.json', () => {
      expect(driver.validateInstallation(tmpDir)).toBe(false);

      fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
      expect(driver.validateInstallation(tmpDir)).toBe(true);
    });

    it('builds launch plan with Java, HytaleServer.jar and custom port', () => {
      const plan = driver.buildLaunchPlan({
        workingDir: tmpDir,
        javaPath: 'java',
        minRamMb: 4096,
        maxRamMb: 8192,
        port: 25570
      });

      expect(plan.executable).toBe('java');
      expect(plan.args).toContain('-Xms4096M');
      expect(plan.args).toContain('-Xmx8192M');
      expect(plan.args).toContain('-jar');
      expect(plan.args).toContain('HytaleServer.jar');
      expect(plan.args).toContain('--port');
      expect(plan.args).toContain('25570');
    });

    it('parses Hytale logs for server ready and player events', () => {
      expect(driver.parseLogLine('Hytale Server started successfully')).toEqual({ isReady: true });

      const join = driver.parseLogLine('Player "HeroKweebec" joined the world');
      expect(join?.playerJoin?.username).toBe('HeroKweebec');
      expect(join?.playerJoin?.dimension).toBe('orbis');

      const leave = driver.parseLogLine('Player "HeroKweebec" left the world');
      expect(leave?.playerLeave).toBe('HeroKweebec');
    });
  });
});
