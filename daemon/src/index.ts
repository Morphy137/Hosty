import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { finished } from 'stream/promises';
import { loadConfig } from './config/env';
import { ProcessSupervisor, PlayerState, ServerMetrics } from './core/ProcessSupervisor';
import { InstanceManager, type InstanceSettings } from './core/InstanceManager';
import { SupervisorRegistry } from './core/SupervisorRegistry';
import { ModJarManager } from './core/ModJarManager';
import { driverRegistry } from './core/drivers/GameDriverRegistry';
import { telemetryBridge } from './core/bridge/TelemetryBridgeManager';
import type { PlayerInventoryData } from './core/bridge/BridgeProtocol';
import { PropertiesParser } from './parsers/PropertiesParser';
import { ModConfigParser } from './parsers/ModConfigParser';
import { ServerInstaller, LoaderType, type ProvisionHooks } from './provisioning/ServerInstaller';
import { provisionJobs } from './provisioning/ProvisionJobs';
import { inspectJar, type JarInspection } from './provisioning/JarInspector';
import { runServerInstaller } from './provisioning/JavaInstallerRunner';
import { parseConfigUpdates } from './parsers/configUpdates';
import { DaemonError, toErrorResponse } from './errors';
import { detectJavaEnvironment } from './core/EnvironmentDetector';

const config = loadConfig();

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        config.allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('tauri://') ||
        origin.startsWith('http://tauri.localhost') ||
        origin.startsWith('https://tauri.localhost')
      ) {
        callback(null, true);
      } else {
        callback(new DaemonError('INVALID_PAYLOAD', `Origin ${origin} not allowed by CORS`));
      }
    }
  })
);
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Instance Manager oversees all folders under instances/
const instancesRootDir = path.dirname(config.instanceDir);
const instanceManager = new InstanceManager(instancesRootDir, config.instanceId);

// Supervisor Registry for multi-instance process management
const registry = new SupervisorRegistry({
  defaultJavaPath: config.javaPath,
  defaultJarFile: config.jarFile,
  stopTimeoutMs: config.stopTimeoutMs,
  metricsIntervalMs: config.metricsIntervalMs,
  positionPollIntervalMs: config.positionPollIntervalMs
});

// Helper to get currently active working directory
const getActiveDir = () => instanceManager.getActiveInstanceDir();

// Helper to get or create the ProcessSupervisor for the active instance
const getActiveSupervisor = (): ProcessSupervisor | null => {
  const activeId = instanceManager.getActiveInstanceId();
  if (!activeId) return null;
  const activeInstance = instanceManager.getInstance(activeId);
  if (activeInstance) {
    return registry.getOrCreateSupervisor(activeInstance);
  }
  return null;
};

const broadcast = (type: string, payload: unknown) => {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Wire Supervisor Registry events to WebSocket broadcast
registry.on('status', (instanceId, status) => {
  broadcast('INSTANCE_STATUS', { instanceId, status });
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('STATUS', status);
  }
});

registry.on('metrics', (instanceId, metrics) => {
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('METRICS', metrics);
  }
});

registry.on('players', (instanceId, players) => {
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('PLAYERS', players);
  }
});

registry.on('console', (instanceId, line) => {
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('CONSOLE', line);
  }
});

registry.on('failure', (instanceId, failure) => {
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('ERROR', failure);
  }
});

telemetryBridge.on('inventory_data', (instanceId, inventory) => {
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('INVENTORY_DATA', inventory);
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  const sup = getActiveSupervisor();
  res.json({
    status: 'ok',
    mockEnabled: config.mockEnabled,
    serverStatus: sup ? sup.getStatus() : 'OFFLINE',
    activeInstance: instanceManager.getActiveInstanceId() || null
  });
});

// System Environment Check API
app.get('/api/system/environment', (_req, res) => {
  const javaInfo = detectJavaEnvironment(config.javaPath);
  res.json({
    java: javaInfo,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemMb: Math.round(os.freemem() / (1024 * 1024))
  });
});

// Game Drivers API
app.get('/api/games', (_req, res) => {
  res.json({
    games: driverRegistry.listDrivers()
  });
});

app.get('/api/games/:gameId', (req, res, next) => {
  try {
    const { gameId } = req.params;
    if (!driverRegistry.hasDriver(gameId)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game driver "${gameId}" not supported.`);
    }
    const driver = driverRegistry.getDriver(gameId);
    res.json(driver.summary);
  } catch (err) {
    next(err);
  }
});

// Instances API
app.get('/api/instances', (_req, res, next) => {
  try {
    const list = instanceManager.listInstances().map((inst) => ({
      ...inst,
      status: registry.getStatus(inst.id),
      onlinePlayersCount: registry.getPlayers(inst.id).length,
      bridgeConnected: registry.isBridgeConnected(inst.id)
    }));
    res.json({
      instances: list,
      activeId: instanceManager.getActiveInstanceId()
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/select', (req, res, next) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) throw new DaemonError('INVALID_PAYLOAD', 'Instance ID is required.');

    const selected = instanceManager.setActiveInstanceId(id);
    const sup = registry.getOrCreateSupervisor(selected);

    broadcast('STATUS', sup.getStatus());
    broadcast('PLAYERS', sup.getPlayers());
    broadcast('CONSOLE', `[Hypervisor] Switched active view to "${selected.name}" (${selected.id})\r\n`);

    res.json({
      ok: true,
      activeInstance: {
        ...selected,
        status: sup.getStatus(),
        onlinePlayersCount: sup.getPlayers().length,
        bridgeConnected: registry.isBridgeConnected(selected.id)
      }
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/instances/:id/settings', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    }
    res.json({
      ...instance,
      status: registry.getStatus(instance.id),
      onlinePlayersCount: registry.getPlayers(instance.id).length,
      bridgeConnected: registry.isBridgeConnected(instance.id)
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/bridge/install', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    }
    const ok = telemetryBridge.installBridge(instance.dir, instance.loader);
    broadcast('CONSOLE', `[Hypervisor] MC-Nexus Bridge installed for "${instance.name}".\r\n`);
    res.json({ ok });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/settings', (req, res, next) => {
  try {
    const updated = instanceManager.updateInstanceSettings(req.params.id, req.body as Partial<InstanceSettings>);
    const sup = registry.getSupervisor(req.params.id);
    if (sup) {
      sup.updateConfig({
        javaPath: updated.javaPath || config.javaPath,
        minRamMb: updated.minRamMb,
        maxRamMb: updated.maxRamMb,
        jvmArgs: updated.jvmArgs,
        forceSaveOnStop: updated.forceSaveOnStop
      });
    }
    broadcast('CONSOLE', `[Hypervisor] Settings updated for server "${updated.name}".\r\n`);
    res.json({
      ok: true,
      instance: {
        ...updated,
        status: registry.getStatus(updated.id),
        onlinePlayersCount: registry.getPlayers(updated.id).length
      }
    });
  } catch (err) {
    next(err);
  }
});

// Server Icon Endpoints
app.get('/api/instances/:id/icon', (req, res, next) => {
  try {
    const iconPath = instanceManager.getInstanceIconPath(req.params.id);
    if (!iconPath) {
      res.status(404).send('Icon not found');
      return;
    }
    res.sendFile(iconPath);
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/icon', (req, res, next) => {
  try {
    const { imageBase64 } = req.body as { imageBase64?: string };
    if (!imageBase64) {
      throw new DaemonError('INVALID_PAYLOAD', 'imageBase64 is required.');
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    instanceManager.saveInstanceIcon(req.params.id, buffer);
    broadcast('CONSOLE', `[Hypervisor] Server icon updated for "${req.params.id}".\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/instances/:id/icon', (req, res, next) => {
  try {
    instanceManager.deleteInstanceIcon(req.params.id);
    broadcast('CONSOLE', `[Hypervisor] Server icon removed for "${req.params.id}".\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Restart endpoint
app.post('/api/instances/:id/restart', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    }
    const sup = registry.getOrCreateSupervisor(instance);
    sup.restart();
    broadcast('CONSOLE', `[Hypervisor] Restarting server "${instance.name}"...\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Console Buffer retrieval
app.get('/api/instances/:id/console', (req, res, next) => {
  try {
    const lines = registry.getConsoleBuffer(req.params.id);
    res.json({ lines });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/create', (req, res, next) => {
  try {
    const { id, name, settings } = req.body as {
      id: string;
      name?: string;
      settings?: Partial<InstanceSettings>;
    };
    if (!id) throw new DaemonError('INVALID_PAYLOAD', 'Instance ID is required.');

    const created = instanceManager.createInstance(id, name, settings);
    res.json({ ok: true, instance: created });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/import', (req, res, next) => {
  try {
    const { path: folderPath, name, gameId } = req.body as { path: string; name?: string; gameId?: string };
    if (!folderPath) throw new DaemonError('INVALID_PAYLOAD', 'Folder path is required.');

    const imported = instanceManager.importInstance(folderPath, name, gameId);
    res.json({ ok: true, instance: imported });
  } catch (err) {
    next(err);
  }
});

/** Parses the optional `settings` query parameter (URL-encoded JSON) sent with raw jar uploads. */
const parseSettingsQuery = (raw: unknown): Partial<InstanceSettings> => {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<InstanceSettings>) : {};
  } catch {
    throw new DaemonError('INVALID_PAYLOAD', 'The "settings" query parameter must be valid JSON.');
  }
};

/** Streams the raw request body to a temporary file and classifies it. */
const inspectRequestJar = async (req: Request): Promise<{ tempPath: string; inspection: JarInspection }> => {
  const tempPath = path.join(os.tmpdir(), `hosty-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.jar`);
  await finished(req.pipe(fs.createWriteStream(tempPath)));
  return { tempPath, inspection: inspectJar(tempPath) };
};

let lastProgressBroadcast = 0;
provisionJobs.on('update', (job) => {
  const now = Date.now();
  const isFinal = job.status !== 'running';
  // Byte-level updates arrive per chunk; keep the socket quiet unless something meaningful changed.
  if (!isFinal && job.phase === 'download' && now - lastProgressBroadcast < 150) return;
  lastProgressBroadcast = now;
  broadcast('PROVISION_PROGRESS', job);
});

interface ProvisionRunContext {
  instanceId: string;
  loader: string;
  version: string;
  /** When set, a failed or cancelled job removes the instance this request created. */
  rollbackInstanceId?: string;
  run: (hooks: ProvisionHooks) => Promise<void>;
  javaPath: string;
}

/** Starts a tracked background provisioning job and returns its id immediately. */
const startProvisionJob = (ctx: ProvisionRunContext): string => {
  const { job, signal } = provisionJobs.create({
    instanceId: ctx.instanceId,
    loader: ctx.loader,
    version: ctx.version
  });

  const log = (msg: string) => {
    broadcast('CONSOLE', `${msg}\r\n`);
    broadcast('PROVISION_LOG', msg);
  };

  void (async () => {
    try {
      await ctx.run({
        signal,
        javaPath: ctx.javaPath,
        onLog: log,
        onPhase: (phase) => provisionJobs.update(job.id, { phase }),
        onBytes: (received, total) => provisionJobs.update(job.id, { bytesReceived: received, bytesTotal: total })
      });

      if (instanceManager.getActiveInstanceId() !== ctx.instanceId) {
        instanceManager.setActiveInstanceId(ctx.instanceId);
      }
      provisionJobs.finish(job.id, 'done');
    } catch (err) {
      if (ctx.rollbackInstanceId) {
        try {
          instanceManager.deleteInstance(ctx.rollbackInstanceId);
        } catch (rollbackErr) {
          console.error('Failed to roll back instance after failed install:', rollbackErr);
        }
      }
      const cancelled = err instanceof DaemonError && err.code === 'INSTALL_CANCELLED';
      const { body } = toErrorResponse(err);
      log(`[Provisioner] ${cancelled ? 'Installation cancelled.' : `Installation failed: ${body.error.message}`}`);
      provisionJobs.finish(job.id, cancelled ? 'cancelled' : 'failed', body.error);
    }
  })();

  return job.id;
};

const assertInstanceIdle = (instanceId: string | undefined, action: string): void => {
  const sup = instanceId ? registry.getSupervisor(instanceId) : getActiveSupervisor();
  if (sup && sup.getStatus() !== 'OFFLINE') {
    throw new DaemonError('SERVER_RUNNING', `Cannot ${action} while server is running.`);
  }
};

app.post('/api/provisioning/inspect-jar', async (req, res, next) => {
  let tempPath: string | null = null;
  try {
    const result = await inspectRequestJar(req);
    tempPath = result.tempPath;
    res.json(result.inspection);
  } catch (err) {
    next(err);
  } finally {
    if (tempPath) fs.rmSync(tempPath, { force: true });
  }
});

app.post('/api/instances/upload-server-jar', async (req, res, next) => {
  let tempPath: string | null = null;
  let createdInstanceId: string | undefined;
  try {
    const instanceId = req.query.instanceId as string;
    const instanceName = (req.query.name as string) || undefined;
    if (!instanceId) {
      throw new DaemonError('INVALID_PAYLOAD', 'instanceId query parameter is required.');
    }
    assertInstanceIdle(instanceId, 'upload a server jar');
    if (provisionJobs.hasRunning()) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    const settings = parseSettingsQuery(req.query.settings);
    const overrideLoader = typeof req.query.loader === 'string' ? req.query.loader : undefined;
    const overrideVersion = typeof req.query.loaderVersion === 'string' ? req.query.loaderVersion : undefined;

    const inspected = await inspectRequestJar(req);
    tempPath = inspected.tempPath;
    const { inspection } = inspected;

    const loader = overrideLoader || inspection.loader || settings.loader || undefined;
    const loaderVersion = overrideVersion || inspection.mcVersion || settings.loaderVersion || undefined;
    const mergedSettings: Partial<InstanceSettings> = { ...settings, loader, loaderVersion };

    let target = instanceManager.getInstance(instanceId);
    if (!target) {
      target = instanceManager.createInstance(instanceId, instanceName, mergedSettings);
      createdInstanceId = target.id;
    } else if (loader || loaderVersion) {
      instanceManager.updateInstanceSettings(instanceId, { loader, loaderVersion });
    }
    const targetDir = target.dir;

    const destName = inspection.kind === 'installer' ? 'installer.jar' : 'server.jar';
    const jarDest = path.join(targetDir, destName);
    fs.copyFileSync(tempPath, jarDest);

    const propsPath = path.join(targetDir, 'server.properties');
    fs.writeFileSync(path.join(targetDir, 'eula.txt'), 'eula=true\n', 'utf-8');
    if (!fs.existsSync(propsPath)) {
      PropertiesParser.createDefaultProperties(propsPath, { motd: instanceName || instanceId });
    }

    let jobId: string | null = null;
    if (inspection.kind === 'installer') {
      const javaPath = target.javaPath || config.javaPath;
      jobId = startProvisionJob({
        instanceId: target.id,
        loader: loader || 'forge',
        version: loaderVersion || '',
        rollbackInstanceId: createdInstanceId,
        javaPath,
        run: async (hooks) => {
          hooks.onPhase?.('install');
          hooks.onLog('[Provisioner] Running the uploaded installer (this can take a few minutes)...');
          try {
            await runServerInstaller({
              javaPath: hooks.javaPath || 'java',
              installerJar: jarDest,
              cwd: targetDir,
              signal: hooks.signal,
              onLine: (line) => hooks.onLog(`[Installer] ${line}`)
            });
          } finally {
            fs.rmSync(jarDest, { force: true });
            fs.rmSync(path.join(targetDir, 'installer.jar.log'), { force: true });
          }
          hooks.onPhase?.('configure');
        }
      });
      createdInstanceId = undefined; // ownership moved to the job (rolled back there on failure)
    } else if (instanceManager.getActiveInstanceId() !== target.id) {
      instanceManager.setActiveInstanceId(target.id);
    }

    broadcast('CONSOLE', `[Hypervisor] Server jar uploaded and registered for instance "${target.id}".\r\n`);
    res.json({ ok: true, instanceId: target.id, jobId, inspection });
  } catch (err) {
    if (createdInstanceId) {
      try {
        instanceManager.deleteInstance(createdInstanceId);
      } catch {
        // Best effort rollback
      }
    }
    next(err);
  } finally {
    if (tempPath) fs.rmSync(tempPath, { force: true });
  }
});

// Server Properties API
app.get('/api/properties', (_req, res, next) => {
  try {
    res.json(PropertiesParser.parseFile(getActiveDir()));
  } catch (err) {
    next(err);
  }
});

app.post('/api/properties', (req, res, next) => {
  try {
    const updates = parseConfigUpdates(req.body);
    PropertiesParser.saveFile(getActiveDir(), updates);
    broadcast('CONSOLE', '[Hypervisor] server.properties updated on disk.\r\n');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Physical Mods .jar Files API
app.get('/api/mods/files', (_req, res, next) => {
  try {
    res.json(ModJarManager.listModFiles(getActiveDir()));
  } catch (err) {
    next(err);
  }
});

app.post('/api/mods/files/toggle', (req, res, next) => {
  try {
    const { filename } = req.body as { filename: string };
    const updated = ModJarManager.toggleMod(getActiveDir(), filename);
    const action = updated.enabled ? 'enabled' : 'disabled';
    broadcast('CONSOLE', `[Hypervisor] Mod "${updated.originalName}" ${action}.\r\n`);
    res.json({ ok: true, file: updated });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/mods/files/:filename', (req, res, next) => {
  try {
    ModJarManager.deleteMod(getActiveDir(), req.params.filename);
    broadcast('CONSOLE', `[Hypervisor] Mod file "${req.params.filename}" deleted.\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Mod Configurations API (/config/*.toml, *.json)
app.get('/api/mods/configs', (_req, res, next) => {
  try {
    res.json(ModConfigParser.listConfigs(getActiveDir()));
  } catch (err) {
    next(err);
  }
});

app.get('/api/mods/configs/:filename', (req, res, next) => {
  try {
    res.json(ModConfigParser.parseConfig(getActiveDir(), req.params.filename));
  } catch (err) {
    next(err);
  }
});

app.post('/api/mods/configs/:filename', (req, res, next) => {
  try {
    ModConfigParser.saveConfig(getActiveDir(), req.params.filename, req.body);
    broadcast('CONSOLE', `[Hypervisor] Mod config ${req.params.filename} saved.\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Server Provisioning / Installation API
app.get('/api/provisioning/versions/:loader', async (req, res, next) => {
  try {
    const loader = req.params.loader as LoaderType;
    const versions = await ServerInstaller.getVersions(loader);
    res.json(versions);
  } catch (err) {
    next(err);
  }
});

app.post('/api/provisioning/install', async (req, res, next) => {
  try {
    const { loader, version, instanceId, instanceName, settings } = req.body as {
      loader: LoaderType;
      version: string;
      instanceId?: string;
      instanceName?: string;
      settings?: Partial<InstanceSettings>;
    };

    assertInstanceIdle(instanceId, 'install server software');
    if (provisionJobs.hasRunning()) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    let target = instanceId ? instanceManager.getInstance(instanceId) : instanceManager.getInstance(instanceManager.getActiveInstanceId());
    let createdInstanceId: string | undefined;
    if (!target && instanceId) {
      // Loader and version are persisted in the same step that creates the instance.
      target = instanceManager.createInstance(instanceId, instanceName, {
        ...settings,
        loader,
        loaderVersion: version
      });
      createdInstanceId = target.id;
    } else if (target) {
      instanceManager.updateInstanceSettings(target.id, { loader, loaderVersion: version });
    }
    if (!target) {
      throw new DaemonError('CONFIG_NOT_FOUND', 'No instance available to install into.');
    }

    const targetDir = target.dir;
    const jobId = startProvisionJob({
      instanceId: target.id,
      loader,
      version,
      rollbackInstanceId: createdInstanceId,
      javaPath: target.javaPath || config.javaPath,
      run: (hooks) => ServerInstaller.provisionServer(targetDir, loader, version, hooks)
    });

    res.status(202).json({ ok: true, jobId, instanceId: target.id });
  } catch (err) {
    next(err);
  }
});

app.get('/api/provisioning/jobs/:jobId', (req, res, next) => {
  try {
    const job = provisionJobs.get(req.params.jobId);
    if (!job) throw new DaemonError('CONFIG_NOT_FOUND', `Installation job "${req.params.jobId}" not found.`);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

app.post('/api/provisioning/jobs/:jobId/cancel', (req, res, next) => {
  try {
    if (!provisionJobs.get(req.params.jobId)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Installation job "${req.params.jobId}" not found.`);
    }
    res.json({ ok: provisionJobs.cancel(req.params.jobId) });
  } catch (err) {
    next(err);
  }
});

// Centralized error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const { status, body } = toErrorResponse(err);
  res.status(status).json(body);
});

// 20 Simulated players for the MOCK action with rich telemetry & modded dimensions
const MOCK_PLAYERS: PlayerState[] = [
  { username: 'MorphyCD', dimension: 'minecraft:overworld', x: -245, y: 68, z: 1120, health: 20, maxHealth: 20, food: 20, ping: 12, isOp: true },
  { username: 'Notch', dimension: 'minecraft:the_nether', x: 42, y: 81, z: -19, health: 18, maxHealth: 20, food: 17, ping: 45, isOp: true },
  { username: 'Jeb_', dimension: 'minecraft:the_end', x: 0, y: 64, z: 0, health: 15, maxHealth: 20, food: 14, ping: 28, isOp: true },
  { username: 'Dinnerbone', dimension: 'minecraft:overworld', x: 1024, y: 72, z: -550, health: 20, maxHealth: 20, food: 20, ping: 64, isOp: false },
  { username: 'Grian', dimension: 'minecraft:overworld', x: 120, y: 85, z: 340, health: 14, maxHealth: 20, food: 18, ping: 32, isOp: false },
  { username: 'MumboJumbo', dimension: 'minecraft:overworld', x: -80, y: 64, z: 520, health: 19, maxHealth: 20, food: 19, ping: 19, isOp: false },
  { username: 'DanTDM', dimension: 'minecraft:overworld', x: 310, y: 63, z: -105, health: 20, maxHealth: 20, food: 16, ping: 51, isOp: false },
  { username: 'CaptainSparklez', dimension: 'twilightforest:twilight_forest', x: 15, y: 70, z: 128, health: 12, maxHealth: 20, food: 10, ping: 38, isOp: false },
  { username: 'Technoblade', dimension: 'minecraft:the_nether', x: -666, y: 108, z: 420, health: 20, maxHealth: 20, food: 20, ping: 22, isOp: true },
  { username: 'Dream', dimension: 'minecraft:overworld', x: 890, y: 70, z: -320, health: 16, maxHealth: 20, food: 15, ping: 15, isOp: false },
  { username: 'GeorgeNotFound', dimension: 'deeperdarker:otherside', x: 910, y: 71, z: -305, health: 17, maxHealth: 20, food: 13, ping: 82, isOp: false },
  { username: 'Sapnap', dimension: 'minecraft:the_nether', x: 210, y: 64, z: -88, health: 20, maxHealth: 20, food: 18, ping: 26, isOp: false },
  { username: 'TommyInnit', dimension: 'minecraft:overworld', x: 50, y: 65, z: 15, health: 8, maxHealth: 20, food: 8, ping: 41, isOp: false, isFrozen: true },
  { username: 'Philza', dimension: 'minecraft:the_end', x: 100, y: 49, z: -80, health: 20, maxHealth: 20, food: 20, ping: 30, isOp: true },
  { username: 'WilburSoot', dimension: 'minecraft:overworld', x: -140, y: 63, z: 230, health: 11, maxHealth: 20, food: 12, ping: 95, isOp: false },
  { username: 'Quackity', dimension: 'minecraft:overworld', x: 730, y: 68, z: 95, health: 13, maxHealth: 20, food: 15, ping: 110, isOp: false },
  { username: 'Tubbo', dimension: 'minecraft:overworld', x: 60, y: 66, z: 40, health: 18, maxHealth: 20, food: 16, ping: 36, isOp: false },
  { username: 'Ranboo', dimension: 'aether:the_aether', x: 250, y: 55, z: 14, health: 20, maxHealth: 20, food: 19, ping: 44, isOp: false },
  { username: 'Skeppy', dimension: 'minecraft:overworld', x: -450, y: 64, z: -120, health: 15, maxHealth: 20, food: 14, ping: 58, isOp: false },
  { username: 'BadBoyHalo', dimension: 'minecraft:the_nether', x: -300, y: 80, z: 75, health: 20, maxHealth: 20, food: 20, ping: 52, isOp: false, isMuted: true }
];

function createMockInventory(username: string): PlayerInventoryData {
  return {
    username,
    uuid: `mock-${username}`,
    armor: [
      { slot: 39, id: 'minecraft:netherite_helmet', count: 1, damage: 45, maxDamage: 407, enchantments: [{ id: 'Protection', level: 4 }, { id: 'Unbreaking', level: 3 }] },
      { slot: 38, id: 'minecraft:netherite_chestplate', count: 1, damage: 120, maxDamage: 592, customName: 'Chestplate of Fortitude', enchantments: [{ id: 'Protection', level: 4 }, { id: 'Mending', level: 1 }] },
      { slot: 37, id: 'minecraft:netherite_leggings', count: 1, damage: 80, maxDamage: 555, enchantments: [{ id: 'Protection', level: 4 }] },
      { slot: 36, id: 'minecraft:netherite_boots', count: 1, damage: 15, maxDamage: 481, enchantments: [{ id: 'Feather Falling', level: 4 }, { id: 'Soul Speed', level: 3 }] }
    ],
    offhand: { slot: 40, id: 'minecraft:totem_of_undying', count: 1 },
    hotbar: [
      { slot: 0, id: 'minecraft:netherite_sword', count: 1, damage: 110, maxDamage: 2031, customName: 'Excalibur', enchantments: [{ id: 'Sharpness', level: 5 }, { id: 'Looting', level: 3 }, { id: 'Fire Aspect', level: 2 }] },
      { slot: 1, id: 'minecraft:netherite_pickaxe', count: 1, damage: 320, maxDamage: 2031, enchantments: [{ id: 'Efficiency', level: 5 }, { id: 'Fortune', level: 3 }] },
      { slot: 2, id: 'minecraft:netherite_axe', count: 1, damage: 90, maxDamage: 2031 },
      { slot: 3, id: 'minecraft:golden_apple', count: 16 },
      { slot: 4, id: 'minecraft:ender_pearl', count: 16 },
      { slot: 5, id: 'minecraft:cooked_beef', count: 64 },
      { slot: 6, id: 'minecraft:firework_rocket', count: 64 },
      { slot: 7, id: 'create:wrench', count: 1, customName: 'Engineer Wrench' },
      { slot: 8, id: 'twilightforest:fiery_sword', count: 1, damage: 25, maxDamage: 1024, enchantments: [{ id: 'Fire Aspect', level: 3 }] }
    ],
    inventory: [
      { slot: 9, id: 'minecraft:diamond', count: 64 },
      { slot: 10, id: 'minecraft:emerald', count: 32 },
      { slot: 11, id: 'minecraft:iron_ingot', count: 64 },
      { slot: 12, id: 'minecraft:gold_ingot', count: 48 },
      { slot: 13, id: 'minecraft:oak_log', count: 64 },
      { slot: 14, id: 'minecraft:cobblestone', count: 64 },
      { slot: 15, id: 'minecraft:torch', count: 64 },
      { slot: 16, id: 'minecraft:water_bucket', count: 1 },
      { slot: 17, id: 'minecraft:bow', count: 1, damage: 180, maxDamage: 384, enchantments: [{ id: 'Power', level: 5 }] },
      { slot: 18, id: 'minecraft:arrow', count: 64 },
      { slot: 19, id: 'minecraft:experience_bottle', count: 32 },
      null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null, null
    ]
  };
}

// WebSocket Handling
wss.on('connection', (ws, req) => {
  const url = req?.url || '/';
  if (url.startsWith('/telemetry/bridge') || url.startsWith('/bridge')) {
    telemetryBridge.handleConnection(ws);
    return;
  }

  const activeSup = getActiveSupervisor();
  const activeId = instanceManager.getActiveInstanceId();
  ws.send(JSON.stringify({ type: 'STATUS', payload: activeSup ? activeSup.getStatus() : 'OFFLINE' }));
  ws.send(JSON.stringify({ type: 'PLAYERS', payload: activeSup ? activeSup.getPlayers() : [] }));
  ws.send(
    JSON.stringify({
      type: 'METRICS',
      payload: {
        cpu: 0,
        ramMb: 0,
        maxRamMb: activeSup ? activeSup.getConfig().maxRamMb : config.maxRamMb,
        uptime: 0,
        bridgeConnected: activeId ? registry.isBridgeConnected(activeId) : false
      }
    })
  );

  ws.on('message', (raw) => {
    try {
      const { action, data } = JSON.parse(raw.toString());
      const sup = getActiveSupervisor();

      if (!sup) {
        if (action === 'START' || action === 'STOP' || action === 'COMMAND') {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { code: 'CONFIG_NOT_FOUND', message: 'No server configured or active.' }
            })
          );
        }
        return;
      }

      if (action === 'START') sup.start();
      if (action === 'STOP') sup.stop();
      if (action === 'KILL') sup.kill();
      if (action === 'COMMAND' && typeof data === 'string') {
        const sent = sup.sendCommand(data);
        if (sent) broadcast('CONSOLE', `> ${data}\r\n`);
      }
      if (action === 'ACTION' && data && typeof data === 'object') {
        const activeId = instanceManager.getActiveInstanceId();
        const actionData = data as {
          action:
            | 'HEAL'
            | 'DAMAGE'
            | 'KILL'
            | 'KICK'
            | 'TELEPORT'
            | 'INVENTORY_VIEW'
            | 'FREEZE'
            | 'UNFREEZE'
            | 'SMITE'
            | 'GIVE_EXP'
            | 'MUTE'
            | 'UNMUTE';
          username: string;
          amount?: number;
          feed?: boolean;
          reason?: string;
          levels?: number;
          expType?: 'levels' | 'points';
          mode?: 'add' | 'set';
          x?: number;
          y?: number;
          z?: number;
          targetPlayer?: string;
        };

        const sent = registry.sendBridgeAction(activeId, actionData);
        if (sent) {
          broadcast('CONSOLE', `[Hypervisor] Action ${actionData.action} applied to player ${actionData.username} via Bridge.\r\n`);
        } else {
          // Fallback to vanilla commands / mock handling
          if (actionData.action === 'INVENTORY_VIEW') {
            if (config.mockEnabled) {
              broadcast('INVENTORY_DATA', createMockInventory(actionData.username));
            }
          } else if (actionData.action === 'FREEZE') {
            sup.sendCommand(`effect give ${actionData.username} minecraft:slowness infinite 255 true`);
            sup.sendCommand(`effect give ${actionData.username} minecraft:jump_boost infinite 250 true`);
            broadcast('CONSOLE', `[Hypervisor] Player ${actionData.username} frozen.\r\n`);
          } else if (actionData.action === 'UNFREEZE') {
            sup.sendCommand(`effect clear ${actionData.username} minecraft:slowness`);
            sup.sendCommand(`effect clear ${actionData.username} minecraft:jump_boost`);
            broadcast('CONSOLE', `[Hypervisor] Player ${actionData.username} unfrozen.\r\n`);
          } else if (actionData.action === 'SMITE') {
            sup.sendCommand(`execute at ${actionData.username} run summon lightning_bolt ~ ~ ~`);
            broadcast('CONSOLE', `[Hypervisor] Lightning struck player ${actionData.username}.\r\n`);
          } else if (actionData.action === 'GIVE_EXP') {
            const amount = actionData.amount ?? actionData.levels ?? 5;
            const expType = actionData.expType === 'points' ? 'points' : 'levels';
            const mode = actionData.mode === 'set' ? 'set' : 'add';
            sup.sendCommand(`experience ${mode} ${actionData.username} ${amount} ${expType}`);
            broadcast('CONSOLE', `[Hypervisor] ${mode === 'set' ? 'Set' : 'Granted'} ${amount} ${expType} for ${actionData.username}.\r\n`);
          } else if (actionData.action === 'MUTE') {
            sup.sendCommand(`tag ${actionData.username} add muted`);
            broadcast('CONSOLE', `[Hypervisor] Player ${actionData.username} muted.\r\n`);
          } else if (actionData.action === 'UNMUTE') {
            sup.sendCommand(`tag ${actionData.username} remove muted`);
            broadcast('CONSOLE', `[Hypervisor] Player ${actionData.username} unmuted.\r\n`);
          } else if (actionData.action === 'HEAL') {
            sup.sendCommand(`effect give ${actionData.username} instant_health 1 ${Math.min(255, actionData.amount || 20)}`);
            if (actionData.feed) sup.sendCommand(`effect give ${actionData.username} saturation 1 20`);
          } else if (actionData.action === 'DAMAGE') {
            sup.sendCommand(`damage ${actionData.username} ${actionData.amount || 4}`);
          } else if (actionData.action === 'KILL') {
            sup.sendCommand(`kill ${actionData.username}`);
          } else if (actionData.action === 'KICK') {
            sup.sendCommand(`kick ${actionData.username} ${actionData.reason || 'Kicked by administrator'}`);
          } else if (actionData.action === 'TELEPORT') {
            if (actionData.targetPlayer) {
              sup.sendCommand(`tp ${actionData.username} ${actionData.targetPlayer}`);
            } else {
              sup.sendCommand(`tp ${actionData.username} ${actionData.x ?? 0} ${actionData.y ?? 70} ${actionData.z ?? 0}`);
            }
          }
        }
      }
      if (action === 'MOCK' && config.mockEnabled) {
        const mockMetrics: ServerMetrics = {
          cpu: 38.4,
          ramMb: 3120,
          maxRamMb: sup.getConfig().maxRamMb,
          uptime: 7200000,
          tps: 20.0,
          mspt: 12.4,
          loadedChunks: 1048,
          entitiesCount: 342,
          bridgeConnected: true
        };
        broadcast('STATUS', 'ONLINE');
        broadcast('METRICS', mockMetrics);
        broadcast('PLAYERS', MOCK_PLAYERS);
        broadcast('CONSOLE', '[Server thread/INFO]: Done (3.850s)! Simulated 20-Player Telemetry Active (Bridge: Connected, TPS: 20.0, MSPT: 12.4ms).\r\n');
      }
    } catch (err) {
      console.error('Invalid WS payload:', err);
    }
  });

  ws.on('error', (err) => {
    console.error('WS client error:', err);
  });
});

server.listen(config.port, config.host, () => {
  console.log(`[MC-Nexus Daemon] Listening on http://${config.host}:${config.port}`);
});

let isShuttingDown = false;

/** Stops every managed game server gracefully, then exits the daemon process. */
const shutdown = async (reason: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[MC-Nexus Daemon] Shutting down (${reason})...`);
  try {
    await registry.stopAllAndWait(config.stopTimeoutMs + 5_000);
  } catch (err) {
    console.error('Error while stopping servers:', err);
  }
  wss.clients.forEach((client) => client.close());
  server.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// When supervised by the desktop shell, the parent asks for a graceful stop through stdin
// (Windows has no portable SIGTERM). A closed stdin means the parent is gone.
// Opt-in via MC_NEXUS_PARENT_SUPERVISED so detached/CI runs are not affected.
if (process.env.MC_NEXUS_PARENT_SUPERVISED === '1') {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    if (chunk.split('\n').some((line) => line.trim() === 'shutdown')) {
      void shutdown('parent request');
    }
  });
  process.stdin.on('end', () => void shutdown('parent exited'));
  process.stdin.resume();
}