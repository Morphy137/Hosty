import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GameDriverRegistry, driverRegistry } from '../src/core/drivers/GameDriverRegistry';
import { MinecraftDriver } from '../src/core/drivers/MinecraftDriver';

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
      const registry = new GameDriverRegistry();
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

    it('falls back to minecraft driver on unknown or missing game ID', () => {
      const registry = new GameDriverRegistry();
      const fallback = registry.getDriver(undefined);
      expect(fallback.id).toBe('minecraft');

      const unknown = registry.getDriver('unknown-game-xyz');
      expect(unknown.id).toBe('minecraft');
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
    const driver = new MinecraftDriver();

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
  });

  describe('ProjectZomboidDriver', () => {
    const driver = new GameDriverRegistry().getDriver('project-zomboid');

    it('validates server installation based on Zomboid executables or ini', () => {
      expect(driver.validateInstallation(tmpDir)).toBe(false);

      fs.writeFileSync(path.join(tmpDir, 'servertest.ini'), 'dummy');
      expect(driver.validateInstallation(tmpDir)).toBe(true);
    });

    it('builds launch plan with servername and memory parameters', () => {
      const plan = driver.buildLaunchPlan({
        workingDir: tmpDir,
        maxRamMb: 8192,
        port: 16261
      });

      expect(plan.args).toContain('-servername');
      expect(plan.args).toContain('servertest');
      expect(plan.args).toContain('-memory');
      expect(plan.args).toContain('8192m');
      expect(plan.args).toContain('-port');
      expect(plan.args).toContain('16261');
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
    const driver = new GameDriverRegistry().getDriver('hytale');

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
