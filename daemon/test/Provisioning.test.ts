import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyJar, inspectJar } from '../src/provisioning/JarInspector';
import {
  forgeMinecraftVersions,
  latestForgeVersion,
  latestNeoForgeVersion,
  neoForgeMinecraftVersions,
  neoForgeToMinecraftVersion,
  parseMavenVersions
} from '../src/provisioning/ModLoaderCatalog';
import { ProvisionJobManager } from '../src/provisioning/ProvisionJobs';
import { MinecraftDriver, resolveMinecraftLaunchTarget } from '../src/core/drivers/MinecraftDriver';
import { InstanceManager } from '../src/core/InstanceManager';

const entries = (files: Record<string, string>) => ({
  names: new Set(Object.keys(files)),
  readText: (name: string) => files[name] ?? null
});

describe('classifyJar', () => {
  it('detects a Forge installer with its Minecraft and loader version', () => {
    const result = classifyJar(
      entries({
        'install_profile.json': JSON.stringify({ minecraft: '1.20.1', version: '1.20.1-forge-47.2.0' }),
        'net/minecraftforge/installer/Main.class': ''
      })
    );
    expect(result).toEqual({ loader: 'forge', mcVersion: '1.20.1', loaderVersion: '47.2.0', kind: 'installer' });
  });

  it('detects a NeoForge installer', () => {
    const result = classifyJar(
      entries({
        'install_profile.json': JSON.stringify({ minecraft: '1.21.1', version: 'neoforge-21.1.172' }),
        'net/neoforged/installer/Main.class': ''
      })
    );
    expect(result.loader).toBe('neoforge');
    expect(result.kind).toBe('installer');
    expect(result.loaderVersion).toBe('21.1.172');
  });

  it('detects Paper and Purpur paperclip jars', () => {
    const paper = classifyJar(
      entries({
        'io/papermc/paperclip/Main.class': '',
        'META-INF/versions.list': 'abc\t1.21.1/paper-1.21.1.jar\n'
      })
    );
    expect(paper).toMatchObject({ loader: 'paper', mcVersion: '1.21.1', kind: 'server' });

    const purpur = classifyJar(
      entries({
        'io/papermc/paperclip/Main.class': '',
        'META-INF/versions.list': 'abc\t1.20.4/purpur-1.20.4.jar\n'
      })
    );
    expect(purpur).toMatchObject({ loader: 'purpur', mcVersion: '1.20.4' });
  });

  it('detects Fabric, Spigot and Vanilla', () => {
    expect(classifyJar(entries({ 'net/fabricmc/loader/Main.class': '' })).loader).toBe('fabric');
    expect(classifyJar(entries({ 'org/bukkit/craftbukkit/Main.class': '' })).loader).toBe('spigot');
    expect(
      classifyJar(
        entries({
          'version.json': JSON.stringify({ id: '1.20.2' }),
          'net/minecraft/bundler/Main.class': ''
        })
      )
    ).toMatchObject({ loader: 'vanilla', mcVersion: '1.20.2', kind: 'server' });
  });

  it('reports unknown jars', () => {
    expect(classifyJar(entries({ 'com/example/App.class': '' }))).toMatchObject({ loader: null, kind: 'unknown' });
  });
});

describe('inspectJar', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-jar-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('reads signatures from a real archive', () => {
    const zip = new AdmZip();
    zip.addFile('install_profile.json', Buffer.from(JSON.stringify({ minecraft: '1.19.4', version: '1.19.4-forge-45.2.0' })));
    zip.addFile('net/minecraftforge/installer/Main.class', Buffer.from('x'));
    const file = path.join(tmp, 'forge.jar');
    zip.writeZip(file);

    expect(inspectJar(file)).toMatchObject({ loader: 'forge', mcVersion: '1.19.4', kind: 'installer' });
  });

  it('treats a non-archive as unknown', () => {
    const file = path.join(tmp, 'broken.jar');
    fs.writeFileSync(file, 'not a zip');
    expect(inspectJar(file).kind).toBe('unknown');
  });
});

describe('ModLoaderCatalog', () => {
  const forgeXml = `<metadata><versioning><latest>1.21.1-52.0.0</latest><versions>
    <version>1.7.10-10.13.4.1614</version>
    <version>1.12.2-14.23.5.2860</version>
    <version>1.20.1-47.1.0</version>
    <version>1.20.1-47.2.0</version>
    <version>1.21.1-52.0.0</version>
  </versions></versioning></metadata>`;

  it('lists Minecraft versions newest first and skips ancient releases', () => {
    const versions = parseMavenVersions(forgeXml);
    expect(forgeMinecraftVersions(versions)).toEqual(['1.21.1', '1.20.1', '1.12.2']);
    expect(latestForgeVersion(versions, '1.20.1')).toBe('1.20.1-47.2.0');
    expect(latestForgeVersion(versions, '1.19')).toBeNull();
  });

  it('maps NeoForge versions to Minecraft versions', () => {
    expect(neoForgeToMinecraftVersion('21.1.172')).toBe('1.21.1');
    expect(neoForgeToMinecraftVersion('21.0.5')).toBe('1.21');
    expect(neoForgeToMinecraftVersion('20.4.237')).toBe('1.20.4');
    expect(neoForgeToMinecraftVersion('26.1.2.117')).toBe('26.1.2');
    expect(neoForgeToMinecraftVersion('26.3.0.77')).toBe('26.3');

    const versions = ['20.4.1', '21.1.5', '21.1.172', '21.1.173-beta'];
    expect(neoForgeMinecraftVersions(versions)).toEqual(['1.21.1', '1.20.4']);
    expect(latestNeoForgeVersion(versions, '1.21.1')).toBe('21.1.172');
  });
});

describe('MinecraftDriver launch targets', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-mc-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const driver = new MinecraftDriver();

  it('launches server.jar with -jar', () => {
    fs.writeFileSync(path.join(dir, 'server.jar'), '');
    const plan = driver.buildLaunchPlan({ workingDir: dir, minRamMb: 512, maxRamMb: 2048 });
    expect(plan.args).toContain('-jar');
    expect(plan.args).toContain('server.jar');
    expect(driver.validateInstallation(dir)).toBe(true);
  });

  it('prefers the Forge/NeoForge args file produced by the installer', () => {
    const argsName = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    const argsDir = path.join(dir, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.172');
    fs.mkdirSync(argsDir, { recursive: true });
    fs.writeFileSync(path.join(argsDir, argsName), '');
    fs.writeFileSync(path.join(dir, 'user_jvm_args.txt'), '');

    expect(resolveMinecraftLaunchTarget(dir)?.mode).toBe('argsFile');
    const plan = driver.buildLaunchPlan({ workingDir: dir });
    expect(plan.args).not.toContain('-jar');
    expect(plan.args).toContain('@user_jvm_args.txt');
    expect(plan.args).toContain(`@libraries/net/neoforged/neoforge/21.1.172/${argsName}`);
    expect(driver.validateInstallation(dir)).toBe(true);
  });

  it('is not installed when no launch target exists', () => {
    expect(driver.validateInstallation(dir)).toBe(false);
  });
});

describe('ProvisionJobManager', () => {
  it('tracks progress, completion and cancellation', () => {
    const jobs = new ProvisionJobManager();
    const updates: number[] = [];
    jobs.on('update', (job) => {
      if (job.percent !== null) updates.push(job.percent);
    });

    const { job, signal } = jobs.create({ instanceId: 'a', loader: 'paper', version: '1.21.1' });
    expect(jobs.hasRunning()).toBe(true);

    jobs.update(job.id, { phase: 'download', bytesReceived: 50, bytesTotal: 200 });
    expect(jobs.get(job.id)?.percent).toBe(25);

    expect(jobs.cancel(job.id)).toBe(true);
    expect(signal.aborted).toBe(true);

    jobs.finish(job.id, 'cancelled');
    expect(jobs.hasRunning()).toBe(false);
    expect(jobs.cancel(job.id)).toBe(false);
    expect(updates).toContain(25);
  });
});

describe('InstanceManager.deleteInstance', () => {
  it('removes instances created by Hosty', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-inst-'));
    try {
      const manager = new InstanceManager(base);
      manager.createInstance('temp-server', 'Temp');
      expect(manager.getInstance('temp-server')).not.toBeNull();
      manager.deleteInstance('temp-server');
      expect(manager.getInstance('temp-server')).toBeNull();
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
