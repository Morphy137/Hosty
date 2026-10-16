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
import { ModCatalog, type ModSort } from './provisioning/ModCatalog';
import { buildProvisionRunner } from './provisioning/InstallProviders';
import { ModFileManager, DEFAULT_MOD_LAYOUT, type ModLayout } from './core/ModFileManager';
import { driverRegistry } from './core/drivers/GameDriverRegistry';
import { TelemetryBridgeManager, telemetryBridge } from './core/bridge/TelemetryBridgeManager';
import { ensureBridgeConfig } from './core/bridge/BridgeAuth';
import { tokensMatch } from './core/bridge/BridgeAuth';
import type { PlayerInventoryData } from './core/bridge/BridgeProtocol';
import { ModConfigParser } from './parsers/ModConfigParser';
import type { ProvisionHooks } from './provisioning/download';
import { provisionJobs } from './provisioning/ProvisionJobs';
import type { GameInstaller, InstallFileInfo } from './core/drivers/IGameDriver';
import { parseConfigUpdates } from './parsers/configUpdates';
import { DaemonError, toErrorResponse } from './errors';
import { detectJavaEnvironment, resolveJavaExecutable } from './core/EnvironmentDetector';
import { inspectServerFolder } from './core/FolderInspector';
import { openFolder } from './core/FolderOpener';
import { BackupManager } from './core/BackupManager';
import { fetchPublicIp, firewallRuleName, isValidPort, listLanAddresses, openFirewallPort } from './core/NetworkInfo';
import { createPackFromTemplate } from './core/gamepacks/PackTemplate';
import { renderActionCommands, sanitizeActionValues, toBridgeAction } from './core/PlayerActions';
import { readConfigFile, writeConfigFile, resolveConfigPath } from './core/ConfigFileEditor';
import net from 'net';

const config = loadConfig();
config.javaPath = resolveJavaExecutable(config.javaPath);
driverRegistry.loadPacks(config.gamesDir, config.bundledGamesDir);

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

// Local API token: any process on this machine can reach 127.0.0.1, so the desktop shell generates a
// per-run secret that the UI must present (header, bearer or ?token= for <img> and WebSocket URLs).
const extractRequestToken = (req: Request): string => {
  const bearer = req.header('authorization');
  if (bearer?.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  const header = req.header('x-hosty-token');
  if (header) return header;
  const query = req.query.token;
  return typeof query === 'string' ? query : '';
};

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (!config.apiToken || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (tokensMatch(config.apiToken, extractRequestToken(req))) {
    next();
    return;
  }
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API token.' } });
});

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
// Directory of the active instance. Without one, the instances root must never be treated as a
// server folder (mods/config routes would create stray folders that then show up as servers).
const hasActiveInstance = () => instanceManager.getActiveInstanceId() !== '';
const getActiveDir = () => {
  if (!hasActiveInstance()) {
    throw new DaemonError('CONFIG_NOT_FOUND', 'No server instance is selected.');
  }
  return instanceManager.getActiveInstanceDir();
};

// Helper to get or create the ProcessSupervisor for the active instance
telemetryBridge.setInstanceDirResolver((instanceId) => instanceManager.getInstance(instanceId)?.dir ?? null);
telemetryBridge.setAllowLegacy(config.allowLegacyBridge);
telemetryBridge.on('bridge_rejected', (instanceId, reason) => {
  console.warn(`[TelemetryBridge] Rejected bridge${instanceId ? ` for "${instanceId}"` : ''}: ${reason}`);
  if (instanceId === instanceManager.getActiveInstanceId()) {
    broadcast('CONSOLE', `[Hypervisor] Bridge connection rejected (${reason}).\r\n`);
  }
});

/** Writes <instance>/.hosty/bridge.json so an installed bridge finds the daemon URL and its token. */
const prepareBridgeConfig = (instanceId: string): void => {
  const instance = instanceManager.getInstance(instanceId);
  if (!instance) return;
  try {
    ensureBridgeConfig(instance.dir, instance.id, `ws://127.0.0.1:${config.port}/telemetry/bridge`);
  } catch (err) {
    console.warn('[TelemetryBridge] Could not write bridge config:', err);
  }
};

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

// Reports whether a TCP port can be bound on this machine (used by the creation wizard)
app.get('/api/system/ports/:port', (req, res, next) => {
  const port = Number(req.params.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    next(new DaemonError('INVALID_PAYLOAD', 'Port must be an integer between 1 and 65535.'));
    return;
  }
  const probe = net.createServer();
  probe.once('error', () => res.json({ port, inUse: true }));
  probe.once('listening', () => probe.close(() => res.json({ port, inUse: false })));
  probe.listen(port, '0.0.0.0');
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
      bridgeConnected: registry.isBridgeConnected(inst.id),
      bridgeCapabilities: telemetryBridge.getSession(inst.id)?.capabilities ?? []
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

app.delete('/api/instances/:id/bridge', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    }
    if (registry.getSupervisor(instance.id)?.isRunning()) {
      throw new DaemonError('SERVER_RUNNING', 'Stop the server before removing the bridge.');
    }
    const targets = driverRegistry.getDriver(instance.gameId).summary.bridgeTargets ?? { default: { dir: 'mods' } };
    const folders = Array.from(new Set(Object.values(targets).map((target) => target.dir)));
    const removed = TelemetryBridgeManager.removeBridge(instance.dir, folders);
    res.json({ ok: true, removed });
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
    const bridgeLoaders = driverRegistry.getDriver(instance.gameId).summary.bridgeLoaders ?? [];
    if (bridgeLoaders.length === 0 || (instance.loader && !bridgeLoaders.includes(instance.loader))) {
      throw new DaemonError(
        'INVALID_LOADER',
        `There is no Hosty bridge for "${instance.loader ?? instance.gameId}" yet. Supported: ${bridgeLoaders.join(', ') || 'none'}.`
      );
    }
    const installedPath = telemetryBridge.installBridge(
      instance.dir,
      instance.loader,
      driverRegistry.getDriver(instance.gameId).summary.bridgeTargets
    );
    prepareBridgeConfig(instance.id);
    broadcast('CONSOLE', `[Hypervisor] MC-Nexus Bridge installed for "${instance.name}".

`);
    const serverRunning = registry.getSupervisor(instance.id)?.isRunning() ?? false;
    res.json({ ok: true, path: installedPath, serverRunning });
  } catch (err) {
    next(err);
  }
});

const requireInstance = (id: string) => {
  const instance = instanceManager.getInstance(id);
  if (!instance) throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${id}" does not exist.`);
  return instance;
};

app.get('/api/instances/:id/backups', (req, res, next) => {
  try {
    const instance = requireInstance(req.params.id);
    res.json({ backups: new BackupManager(instance.dir).list() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/backups', (req, res, next) => {
  try {
    const instance = requireInstance(req.params.id);
    const driver = driverRegistry.getDriver(instance.gameId);
    // Flush the world to disk first when the server is running.
    const sup = registry.getSupervisor(instance.id);
    if (sup?.getStatus() === 'ONLINE') sup.sendCommand(driver.buildSaveCommand().trim());
    const backup = new BackupManager(instance.dir).create(driver.backupPaths?.(), instance.backupsKept);
    res.json({ ok: true, backup });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/backups/:name/restore', (req, res, next) => {
  try {
    const instance = requireInstance(req.params.id);
    if (registry.getSupervisor(instance.id)?.isRunning()) {
      throw new DaemonError('SERVER_RUNNING', 'Stop the server before restoring a backup.');
    }
    const manager = new BackupManager(instance.dir);
    const driver = driverRegistry.getDriver(instance.gameId);
    // Safety copy so a wrong restore is never destructive.
    manager.create(driver.backupPaths?.(), instance.backupsKept + 1, 'prerestore');
    try {
      manager.restore(req.params.name);
    } catch (error) {
      throw new DaemonError('INVALID_PAYLOAD', error instanceof Error ? error.message : String(error));
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/instances/:id/backups/:name', (req, res, next) => {
  try {
    const instance = requireInstance(req.params.id);
    try {
      new BackupManager(instance.dir).remove(req.params.name);
    } catch (error) {
      throw new DaemonError('INVALID_PAYLOAD', error instanceof Error ? error.message : String(error));
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/system/network', async (_req, res, next) => {
  try {
    res.json({ lanAddresses: listLanAddresses(), publicIp: await fetchPublicIp() });
  } catch (err) {
    next(err);
  }
});

// Allows inbound traffic for the server port in the Windows firewall (needs administrator rights).
app.post('/api/instances/:id/firewall', async (req, res, next) => {
  try {
    const instance = requireInstance(req.params.id);
    if (!isValidPort(instance.port)) throw new DaemonError('INVALID_PAYLOAD', 'The server has no valid port.');
    try {
      await openFirewallPort(firewallRuleName(instance.name, instance.port), instance.port);
    } catch (error) {
      throw new DaemonError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
    }
    res.json({ ok: true, port: instance.port });
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
        forceSaveOnStop: updated.forceSaveOnStop,
        autoRestart: updated.autoRestart,
        scheduledRestartHours: updated.scheduledRestartHours
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
    // Hosty's own copy lives in `<instance>/.hosty/`, which sendFile refuses by default.
    res.sendFile(iconPath, { dotfiles: 'allow' });
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
    const gameIcon = instanceManager.saveInstanceIcon(req.params.id, buffer);
    broadcast('CONSOLE', `[Hypervisor] Server icon updated for "${req.params.id}".\r\n`);
    res.json({ ok: true, gameIcon });
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
// Removes an instance from Hosty. Imported folders are only unregistered (files are kept).
app.delete('/api/instances/:id', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    }
    if (registry.getSupervisor(instance.id)?.isRunning()) {
      throw new DaemonError('SERVER_RUNNING', 'Stop the server before removing it.');
    }
    instanceManager.deleteInstance(instance.id);
    registry.removeSupervisor(instance.id);
    res.json({ ok: true, keptFiles: Boolean(instance.isImported) });
  } catch (err) {
    next(err);
  }
});

// ---- Mod catalog: sources are declared by the game driver, the core stays game-agnostic ----------
const modSourcesOf = (gameId: string) =>
  (driverRegistry.getDriver(gameId).summary.modSources ?? []).filter((source) => ModCatalog.supports(source));

const resolveModSource = (instanceId: string, sourceId: unknown) => {
  const instance = instanceManager.getInstance(instanceId);
  if (!instance) throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${instanceId}" not found.`);
  const sources = modSourcesOf(instance.gameId);
  const source = sources.find((candidate) => candidate.id === sourceId) ?? sources[0];
  if (!source) throw new DaemonError('INVALID_PAYLOAD', 'This game has no mod catalog.');
  return { instance, source, sources };
};

app.get('/api/instances/:id/mods/sources', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    res.json({ sources: modSourcesOf(instance.gameId) });
  } catch (err) {
    next(err);
  }
});

const modContextOf = (instance: { dir: string; loader?: string; loaderVersion?: string }) => ({
  dir: instance.dir,
  loader: instance.loader,
  gameVersion: instance.loaderVersion
});

/** `any` clears the filter (null); missing falls back to the instance's own loader / version. */
const parseAnyFilter = (value: unknown): string | null | undefined => {
  if (typeof value !== 'string' || value === '') return undefined;
  return value === 'any' ? null : value;
};

app.get('/api/instances/:id/mods/facets', async (req, res, next) => {
  try {
    const { instance, source } = resolveModSource(req.params.id, req.query.source);
    res.json({
      ...(await ModCatalog.getFacets(source)),
      instance: { loader: instance.loader ?? null, gameVersion: instance.loaderVersion ?? null }
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/instances/:id/mods/search', async (req, res, next) => {
  try {
    const { instance, source } = resolveModSource(req.params.id, req.query.source);
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const offset = Number(req.query.offset) || 0;
    const sort = typeof req.query.sort === 'string' ? (req.query.sort as ModSort) : undefined;
    const categories =
      typeof req.query.categories === 'string'
        ? req.query.categories.split(',').filter((entry) => /^[a-z0-9_-]{1,40}$/i.test(entry)).slice(0, 8)
        : [];
    const environment = req.query.environment === 'client' || req.query.environment === 'server' ? req.query.environment : undefined;
    res.json(
      await ModCatalog.search(source, modContextOf(instance), query, offset, {
        sort,
        categories,
        environment,
        gameVersion: parseAnyFilter(req.query.gameVersion),
        loader: parseAnyFilter(req.query.loader)
      })
    );
  } catch (err) {
    next(err);
  }
});

app.get('/api/instances/:id/mods/versions', async (req, res, next) => {
  try {
    const { instance, source } = resolveModSource(req.params.id, req.query.source);
    const project = typeof req.query.project === 'string' ? req.query.project : '';
    if (!project) throw new DaemonError('INVALID_PAYLOAD', 'project is required.');
    res.json({
      versions: await ModCatalog.listVersions(source, modContextOf(instance), project, {
        gameVersion: parseAnyFilter(req.query.gameVersion),
        loader: parseAnyFilter(req.query.loader)
      })
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/instances/:id/mods/icon', async (req, res, next) => {
  try {
    const { source } = resolveModSource(req.params.id, req.query.source);
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    const icon = await ModCatalog.fetchIcon(source, url);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(icon.type).send(icon.data);
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/mods/install', async (req, res, next) => {
  try {
    const { source: sourceId, projectId, versionId } = req.body as {
      source?: string;
      projectId?: string;
      versionId?: string;
    };
    if (!projectId) throw new DaemonError('INVALID_PAYLOAD', 'projectId is required.');
    const { instance, source } = resolveModSource(req.params.id, sourceId);
    const installed = await ModCatalog.install(source, modContextOf(instance), projectId, versionId);
    res.json({ ok: true, ...installed, restartRequired: registry.getSupervisor(instance.id)?.isRunning() ?? false });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/:id/open-folder', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" not found.`);
    try {
      openFolder(instance.dir);
    } catch (error) {
      throw new DaemonError('INVALID_FOLDER', error instanceof Error ? error.message : String(error));
    }
    res.json({ ok: true, dir: instance.dir });
  } catch (err) {
    next(err);
  }
});

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

app.post('/api/instances/inspect-folder', (req, res, next) => {
  try {
    const { path: folderPath, gameId } = req.body as { path?: string; gameId?: string };
    if (!folderPath) throw new DaemonError('INVALID_PAYLOAD', 'Folder path is required.');
    res.json(inspectServerFolder(folderPath, gameId));
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/import', (req, res, next) => {
  try {
    const { path: folderPath, name, gameId } = req.body as { path: string; name?: string; gameId?: string };
    if (!folderPath) throw new DaemonError('INVALID_PAYLOAD', 'Folder path is required.');

    // Only folders a driver recognises can be imported: anything else would never start.
    const inspection = inspectServerFolder(folderPath, gameId);
    if (!inspection.gameId) {
      throw new DaemonError('INVALID_FOLDER', 'This folder does not look like a supported game server.');
    }
    if (gameId && gameId !== inspection.gameId) {
      throw new DaemonError(
        'INVALID_FOLDER',
        `This folder was detected as "${inspection.gameId}", not "${gameId}".`
      );
    }

    const imported = instanceManager.importInstance(inspection.path, name, inspection.gameId);
    const detected: Partial<InstanceSettings> = {
      gameId: inspection.gameId,
      ...(inspection.launchFile ? { launchFile: inspection.launchFile } : {}),
      ...(inspection.variant ? { loader: inspection.variant } : {}),
      ...(inspection.gameVersion ? { loaderVersion: inspection.gameVersion } : {})
    };
    const persisted = instanceManager.updateInstanceSettings(imported.id, detected);
    res.json({ ok: true, instance: persisted ?? imported });
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

/** The installer a game's extension implements (variants, versions, uploaded server files). */
const installerOf = (gameId: string): GameInstaller => {
  const installer = driverRegistry.hasDriver(gameId) ? driverRegistry.getDriver(gameId).installer : undefined;
  if (!installer) throw new DaemonError('INVALID_PAYLOAD', `"${gameId}" has no server installer.`);
  return installer;
};

/** Streams the raw request body to a temporary file and lets the game's installer classify it. */
const inspectRequestFile = async (
  req: Request,
  installer: GameInstaller
): Promise<{ tempPath: string; inspection: InstallFileInfo }> => {
  const tempPath = path.join(os.tmpdir(), `hosty-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await finished(req.pipe(fs.createWriteStream(tempPath)));
  return { tempPath, inspection: installer.inspectFile(tempPath) };
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

app.post('/api/games/:gameId/installer/inspect-file', async (req, res, next) => {
  let tempPath: string | null = null;
  try {
    const result = await inspectRequestFile(req, installerOf(req.params.gameId));
    tempPath = result.tempPath;
    res.json(result.inspection);
  } catch (err) {
    next(err);
  } finally {
    if (tempPath) fs.rmSync(tempPath, { force: true });
  }
});

// The user brings the server file: the game's installer says what it is and puts it in place.
app.post('/api/instances/upload-server-file', async (req, res, next) => {
  let tempPath: string | null = null;
  let createdInstanceId: string | undefined;
  try {
    const instanceId = req.query.instanceId as string;
    const instanceName = (req.query.name as string) || undefined;
    if (!instanceId) {
      throw new DaemonError('INVALID_PAYLOAD', 'instanceId query parameter is required.');
    }
    assertInstanceIdle(instanceId, 'upload a server file');
    if (provisionJobs.hasRunning()) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    const settings = parseSettingsQuery(req.query.settings);
    const existing = instanceManager.getInstance(instanceId);
    const gameId = existing?.gameId ?? settings.gameId ?? driverRegistry.getDefaultGameId();
    const installer = installerOf(gameId);
    const overrideVariant = typeof req.query.variant === 'string' ? req.query.variant : undefined;
    const overrideVersion = typeof req.query.gameVersion === 'string' ? req.query.gameVersion : undefined;

    const inspected = await inspectRequestFile(req, installer);
    tempPath = inspected.tempPath;
    const { inspection } = inspected;

    const loader = overrideVariant || inspection.variant || settings.loader || undefined;
    const loaderVersion = overrideVersion || inspection.gameVersion || settings.loaderVersion || undefined;
    const mergedSettings: Partial<InstanceSettings> = { ...settings, gameId, loader, loaderVersion };

    let target = existing;
    if (!target) {
      target = instanceManager.createInstance(instanceId, instanceName, mergedSettings);
      createdInstanceId = target.id;
    } else if (loader || loaderVersion) {
      instanceManager.updateInstanceSettings(instanceId, { loader, loaderVersion });
    }
    const targetDir = target.dir;
    const placed = installer.placeFile(targetDir, tempPath, inspection);

    // First-run files (default config, licence acceptance...) are the game's business, not core's.
    driverRegistry.getDriver(target.gameId).scaffoldInstance?.(targetDir, {
      port: target.port,
      motd: instanceName || instanceId,
      maxPlayers: target.maxPlayers
    });

    let jobId: string | null = null;
    if (placed.run) {
      jobId = startProvisionJob({
        instanceId: target.id,
        loader: loader || gameId,
        version: loaderVersion || '',
        rollbackInstanceId: createdInstanceId,
        javaPath: target.javaPath || config.javaPath,
        run: placed.run
      });
      createdInstanceId = undefined; // ownership moved to the job (rolled back there on failure)
    } else if (instanceManager.getActiveInstanceId() !== target.id) {
      instanceManager.setActiveInstanceId(target.id);
    }

    broadcast('CONSOLE', `[Hypervisor] Server file uploaded and registered for instance "${target.id}".\r\n`);
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

app.get('/api/mods/files', (_req, res, next) => {
  try {
    res.json(hasActiveInstance() ? ModFileManager.listModFiles(getActiveDir(), activeModLayout()) : []);
  } catch (err) {
    next(err);
  }
});

app.post('/api/mods/files/toggle', (req, res, next) => {
  try {
    const { filename } = req.body as { filename: string };
    const updated = ModFileManager.toggleMod(getActiveDir(), filename, activeModLayout());
    const action = updated.enabled ? 'enabled' : 'disabled';
    broadcast('CONSOLE', `[Hypervisor] Mod "${updated.originalName}" ${action}.\r\n`);
    res.json({ ok: true, file: updated });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/mods/files/:filename', (req, res, next) => {
  try {
    ModFileManager.deleteMod(getActiveDir(), req.params.filename, activeModLayout());
    broadcast('CONSOLE', `[Hypervisor] Mod file "${req.params.filename}" deleted.\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Mods/config folders of the active instance, as declared by its game.
const activeModLayout = (): ModLayout => {
  const instance = instanceManager.getInstance(instanceManager.getActiveInstanceId());
  const declared = instance ? driverRegistry.getDriver(instance.gameId).summary.modLayout : undefined;
  return { ...DEFAULT_MOD_LAYOUT, ...declared };
};

// Mod Configurations API (/config/*.toml, *.json)
app.get('/api/mods/configs', (_req, res, next) => {
  try {
    res.json(hasActiveInstance() ? ModConfigParser.listConfigs(getActiveDir(), activeModLayout().configDir) : []);
  } catch (err) {
    next(err);
  }
});

app.get('/api/mods/configs/:filename', (req, res, next) => {
  try {
    res.json(ModConfigParser.parseConfig(getActiveDir(), req.params.filename, activeModLayout().configDir));
  } catch (err) {
    next(err);
  }
});

app.post('/api/mods/configs/:filename', (req, res, next) => {
  try {
    ModConfigParser.saveConfig(getActiveDir(), req.params.filename, req.body, activeModLayout().configDir);
    broadcast('CONSOLE', `[Hypervisor] Mod config ${req.params.filename} saved.\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Game packs: logos, setup schema, pack management ------------------------------------------
app.get('/api/games/:gameId/logo', (req, res, next) => {
  try {
    const { gameId } = req.params;
    const manifest = driverRegistry.getManifest(gameId);
    const file = manifest?.logo ? driverRegistry.resolvePackFile(gameId, manifest.logo) : null;
    if (!file || !fs.existsSync(file)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game "${gameId}" has no logo.`);
    }
    res.sendFile(path.resolve(file));
  } catch (err) {
    next(err);
  }
});

// Images a pack ships (dimension icons, ...): only image files inside the pack folder are served.
const PACK_IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
app.get('/api/games/:gameId/files', (req, res, next) => {
  try {
    const { gameId } = req.params;
    const relative = typeof req.query.path === 'string' ? req.query.path : '';
    const file = PACK_IMAGE.test(relative) ? driverRegistry.resolvePackFile(gameId, relative) : null;
    const packDir = driverRegistry.resolvePackFile(gameId, '.');
    const rel = file && packDir ? path.relative(path.resolve(packDir), path.resolve(file)) : '..';
    const inside = Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
    if (!file || !inside || !fs.existsSync(file)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game "${gameId}" has no file "${relative}".`);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.resolve(file));
  } catch (err) {
    next(err);
  }
});

app.get('/api/games/:gameId/setup-schema', (req, res, next) => {
  try {
    const { gameId } = req.params;
    if (!driverRegistry.hasDriver(gameId)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game driver "${gameId}" not supported.`);
    }
    res.json({ gameId, fields: driverRegistry.getDriver(gameId).summary.setupSchema });
  } catch (err) {
    next(err);
  }
});

app.get('/api/game-packs', (_req, res) => {
  res.json({ gamesDir: config.gamesDir, packs: driverRegistry.getPackInfos() });
});

app.post('/api/game-packs/reload', (_req, res) => {
  res.json({ gamesDir: config.gamesDir, packs: driverRegistry.reloadAll() });
});

// Declarative manifest of a game (built-ins included) so authors can use it as a template.
app.get('/api/game-packs/:packId/manifest', (req, res, next) => {
  try {
    const manifest = driverRegistry.getManifest(req.params.packId);
    if (!manifest) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game "${req.params.packId}" has no declarative manifest.`);
    }
    res.json(manifest);
  } catch (err) {
    next(err);
  }
});

app.post('/api/game-packs/open-folder', (_req, res, next) => {
  try {
    fs.mkdirSync(config.gamesDir, { recursive: true });
    try {
      openFolder(config.gamesDir);
    } catch (error) {
      throw new DaemonError('INVALID_FOLDER', error instanceof Error ? error.message : String(error));
    }
    res.json({ ok: true, gamesDir: config.gamesDir });
  } catch (err) {
    next(err);
  }
});

app.post('/api/game-packs/from-template', (req, res, next) => {
  try {
    const { id, name } = req.body as { id?: unknown; name?: unknown };
    if (typeof id !== 'string' || !id) throw new DaemonError('INVALID_PAYLOAD', 'Pack id is required.');
    try {
      createPackFromTemplate(config.gamesDir, config.packTemplateDir, id, typeof name === 'string' ? name : undefined);
    } catch (error) {
      throw new DaemonError('INVALID_PAYLOAD', error instanceof Error ? error.message : String(error));
    }
    res.json({ ok: true, gamesDir: config.gamesDir, packs: driverRegistry.reloadAll() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/game-packs/install', (req, res, next) => {
  try {
    const { path: sourcePath } = req.body as { path?: string };
    if (!sourcePath) throw new DaemonError('INVALID_PAYLOAD', 'Pack folder path is required.');
    try {
      const packs = driverRegistry.installPack(sourcePath);
      res.json({ ok: true, gamesDir: config.gamesDir, packs });
    } catch (error) {
      throw new DaemonError('INVALID_FOLDER', error instanceof Error ? error.message : String(error));
    }
  } catch (err) {
    next(err);
  }
});

app.post('/api/game-packs/:packId/enabled', (req, res, next) => {
  try {
    const packId = req.params.packId;
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') throw new DaemonError('INVALID_PAYLOAD', '"enabled" must be a boolean.');
    if (!enabled) {
      const inUse = instanceManager.listInstances().some((instance) => instance.gameId.toLowerCase() === packId.toLowerCase());
      if (inUse) {
        throw new DaemonError('SERVER_RUNNING', `Remove the "${packId}" servers before disabling this game.`);
      }
    }
    try {
      const packs = driverRegistry.setPackEnabled(packId, enabled);
      res.json({ ok: true, gamesDir: config.gamesDir, packs });
    } catch (error) {
      throw new DaemonError('INVALID_PAYLOAD', error instanceof Error ? error.message : String(error));
    }
  } catch (err) {
    next(err);
  }
});

app.delete('/api/game-packs/:packId', (req, res, next) => {
  try {
    const packId = req.params.packId;
    const inUse = instanceManager.listInstances().some((instance) => instance.gameId === packId);
    if (inUse) {
      throw new DaemonError('SERVER_RUNNING', `Remove the "${packId}" servers before uninstalling this game pack.`);
    }
    if (!driverRegistry.uninstallPack(packId)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game pack "${packId}" is not an installed pack.`);
    }
    res.json({ ok: true, gamesDir: config.gamesDir, packs: driverRegistry.getPackInfos() });
  } catch (err) {
    next(err);
  }
});

// ---- UI translation packs: <localesDir>/<code>.json (user) over bundled packs --------------------
// A pack may declare `_meta: { name, extends }`; `extends` merges it over a base pack so regional
// variants only need the keys that differ.
const LOCALE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
type LocaleFile = { _meta?: { name?: string; extends?: string } } & Record<string, unknown>;

const readLocaleFile = (code: string): LocaleFile | null => {
  if (!LOCALE_CODE.test(code)) return null;
  for (const dir of [config.localesDir, config.bundledLocalesDir]) {
    const file = path.join(dir, `${code}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as LocaleFile;
    } catch {
      return null;
    }
  }
  return null;
};

const mergeLocale = (base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    result[key] =
      value && typeof value === 'object' && current && typeof current === 'object'
        ? mergeLocale(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return result;
};

const resolveLocale = (code: string, depth = 0): LocaleFile | null => {
  const file = readLocaleFile(code);
  if (!file) return null;
  const parent = file._meta?.extends;
  if (!parent || depth > 3) return file;
  const base = resolveLocale(parent, depth + 1);
  return base ? ({ ...mergeLocale(base, file), _meta: file._meta } as LocaleFile) : file;
};

app.get('/api/locales', (_req, res) => {
  const codes = new Set<string>();
  for (const dir of [config.bundledLocalesDir, config.localesDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json') && LOCALE_CODE.test(file.slice(0, -5))) codes.add(file.slice(0, -5));
    }
  }
  const locales = [...codes]
    .map((code) => ({ code, name: readLocaleFile(code)?._meta?.name ?? code, valid: readLocaleFile(code) !== null }))
    .filter((locale) => locale.valid)
    .map(({ code, name }) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ localesDir: config.localesDir, locales });
});

app.get('/api/locales/:code', (req, res, next) => {
  try {
    const locale = resolveLocale(req.params.code);
    if (!locale) throw new DaemonError('CONFIG_NOT_FOUND', `Locale "${req.params.code}" not found.`);
    res.json(locale);
  } catch (err) {
    next(err);
  }
});

app.post('/api/game-packs/:packId/trust', (req, res, next) => {
  try {
    if (!driverRegistry.trustPack(req.params.packId)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Game pack "${req.params.packId}" has no driver to trust.`);
    }
    res.json({ ok: true, packs: driverRegistry.getPackInfos() });
  } catch (err) {
    next(err);
  }
});

// ---- Generic config file editor (driven by the game's `configFiles`) ----------------------------
const getDeclaredConfigFile = (relativePath: unknown) => {
  const instance = instanceManager.getInstance(instanceManager.getActiveInstanceId());
  if (!instance) throw new DaemonError('CONFIG_NOT_FOUND', 'No server instance is selected.');
  const declared = driverRegistry
    .getDriver(instance.gameId)
    .summary.configFiles.find((file) => file.path === relativePath);
  if (!declared) throw new DaemonError('INVALID_FILENAME', 'That file is not an editable config file of this game.');
  return { file: resolveConfigPath(instance.dir, declared.path), format: declared.format, instance };
};

app.get('/api/config-files', (_req, res, next) => {
  try {
    const instance = instanceManager.getInstance(instanceManager.getActiveInstanceId());
    if (!instance) {
      res.json([]);
      return;
    }
    const files = driverRegistry.getDriver(instance.gameId).summary.configFiles.map((declared) => ({
      ...declared,
      exists: fs.existsSync(resolveConfigPath(instance.dir, declared.path))
    }));
    res.json(files);
  } catch (err) {
    next(err);
  }
});

app.get('/api/config-files/entries', (req, res, next) => {
  try {
    const { file, format } = getDeclaredConfigFile(req.query.path);
    res.json(readConfigFile(file, format));
  } catch (err) {
    next(err);
  }
});

app.post('/api/config-files/entries', (req, res, next) => {
  try {
    const { file, format } = getDeclaredConfigFile(req.query.path);
    const updates = parseConfigUpdates(req.body);
    writeConfigFile(file, format, updates);
    broadcast('CONSOLE', `[Hypervisor] ${path.basename(file)} updated on disk.\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Installs a Steam-based game with SteamCMD for an existing instance (as a tracked job)
app.post('/api/instances/:id/provision', (req, res, next) => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) throw new DaemonError('CONFIG_NOT_FOUND', `Instance "${req.params.id}" does not exist.`);

    const provision = driverRegistry.getDriver(instance.gameId).summary.provision;
    const branchField = provision?.type === 'steamcmd' ? provision.branchField : undefined;
    const branchValue = branchField ? instance.gameConfig?.[branchField] : undefined;
    const branch = typeof branchValue === 'string' ? branchValue : undefined;
    // The game declares how its server files are obtained (steamcmd, download...); core only dispatches.
    const runner = buildProvisionRunner(provision, {
      instanceDir: instance.dir,
      toolsDir: path.join(path.dirname(instancesRootDir), 'tools', 'steamcmd'),
      branch
    });
    if (!runner) {
      throw new DaemonError('INVALID_PAYLOAD', 'This game does not declare a server installation step.');
    }
    assertInstanceIdle(instance.id, 'install server software');
    if (provisionJobs.hasRunning()) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    const jobId = startProvisionJob({
      instanceId: instance.id,
      loader: runner.provider,
      version: runner.version,
      javaPath: instance.javaPath || config.javaPath,
      run: runner.run
    });
    res.status(202).json({ ok: true, jobId, instanceId: instance.id });
  } catch (err) {
    next(err);
  }
});

// Server software installation, implemented by the game's extension (`installer`); core only tracks the job.
app.get('/api/games/:gameId/installer/versions/:variant', async (req, res, next) => {
  try {
    res.json(await installerOf(req.params.gameId).listVersions(req.params.variant));
  } catch (err) {
    next(err);
  }
});

app.post('/api/provisioning/install', async (req, res, next) => {
  try {
    const { variant, version, instanceId, instanceName, settings } = req.body as {
      variant?: string;
      version?: string;
      instanceId?: string;
      instanceName?: string;
      settings?: Partial<InstanceSettings>;
    };
    if (!variant || !version) throw new DaemonError('INVALID_PAYLOAD', 'variant and version are required.');

    assertInstanceIdle(instanceId, 'install server software');
    if (provisionJobs.hasRunning()) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    let target = instanceId
      ? instanceManager.getInstance(instanceId)
      : instanceManager.getInstance(instanceManager.getActiveInstanceId());
    const gameId = target?.gameId ?? settings?.gameId ?? driverRegistry.getDefaultGameId();
    const installer = installerOf(gameId);
    let createdInstanceId: string | undefined;
    if (!target && instanceId) {
      // Variant and version are persisted in the same step that creates the instance.
      target = instanceManager.createInstance(instanceId, instanceName, {
        ...settings,
        gameId,
        loader: variant,
        loaderVersion: version
      });
      createdInstanceId = target.id;
    } else if (target) {
      // Changing the version of an existing server: keep a restorable copy first.
      try {
        new BackupManager(target.dir).create(driverRegistry.getDriver(gameId).backupPaths?.(), target.backupsKept + 1, 'preupdate');
      } catch (error) {
        throw new DaemonError('INVALID_PAYLOAD', `Could not back up before updating: ${error instanceof Error ? error.message : String(error)}`);
      }
      instanceManager.updateInstanceSettings(target.id, { loader: variant, loaderVersion: version });
    }
    if (!target) {
      throw new DaemonError('CONFIG_NOT_FOUND', 'No instance available to install into.');
    }

    const targetDir = target.dir;
    const jobId = startProvisionJob({
      instanceId: target.id,
      loader: variant,
      version,
      rollbackInstanceId: createdInstanceId,
      javaPath: target.javaPath || config.javaPath,
      run: (hooks) => installer.install(targetDir, variant, version, hooks)
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

// Simulated telemetry for development (`MOCK`): sample players and inventory come from the active game's pack
// (`devMock` in its manifest); games without one get a few anonymous players.
interface DevMockData {
  players: PlayerState[];
  inventory?: Omit<PlayerInventoryData, 'username' | 'uuid'>;
}

const readDevMock = (): DevMockData => {
  const instance = instanceManager.getInstance(instanceManager.getActiveInstanceId());
  const gameId = instance?.gameId ?? '';
  const declared = gameId ? driverRegistry.getManifest(gameId)?.devMock : undefined;
  const file = declared ? driverRegistry.resolvePackFile(gameId, declared) : null;
  if (file && fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as DevMockData;
    } catch {
      // Fall through to the generic sample
    }
  }
  return {
    players: ['Alex', 'Sam', 'Robin'].map((username, index) => ({
      username,
      dimension: '',
      x: index * 10,
      y: 0,
      z: index * -10,
      ping: 20 + index * 15
    }))
  };
};

function createMockInventory(username: string): PlayerInventoryData {
  const inventory = readDevMock().inventory ?? { armor: [], offhand: null, hotbar: [], inventory: [] };
  return { ...inventory, username, uuid: `mock-${username}` } as PlayerInventoryData;
}

// WebSocket Handling
wss.on('connection', (ws, req) => {
  const url = req?.url || '/';
  if (url.startsWith('/telemetry/bridge') || url.startsWith('/bridge')) {
    telemetryBridge.handleConnection(ws);
    return;
  }

  if (config.apiToken) {
    const supplied = new URL(url, 'http://localhost').searchParams.get('token') ?? '';
    if (!tokensMatch(config.apiToken, supplied)) {
      ws.close(1008, 'UNAUTHORIZED');
      return;
    }
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

      if (action === 'START') {
        prepareBridgeConfig(instanceManager.getActiveInstanceId());
        sup.start();
      }
      if (action === 'STOP') sup.stop();
      if (action === 'KILL') sup.kill();
      if (action === 'COMMAND' && typeof data === 'string') {
        const sent = sup.sendCommand(data);
        if (sent) broadcast('CONSOLE', `> ${data}\r\n`);
      }
      // Player actions are declared by the game (`playerActions`): the bridge runs them when it advertises the
      // action, otherwise their console commands are sent. Nothing here knows any game's commands.
      if (action === 'PLAYER_ACTION' && data && typeof data === 'object') {
        const { actionId, username, values } = data as { actionId?: unknown; username?: unknown; values?: unknown };
        const instance = instanceManager.getInstance(instanceManager.getActiveInstanceId());
        const spec = instance
          ? driverRegistry.getDriver(instance.gameId).summary.playerActions?.find((candidate) => candidate.id === actionId)
          : undefined;
        if (!spec || typeof username !== 'string' || !/^[\w.\- ]{1,64}$/.test(username)) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { code: 'INVALID_PAYLOAD', message: 'Unknown player action.' } }));
          return;
        }
        const actionValues = sanitizeActionValues(spec, values);
        if (spec.bridgeAction && registry.sendBridgeAction(instance!.id, toBridgeAction(spec, username, actionValues))) {
          broadcast('CONSOLE', `[Hypervisor] ${spec.id} applied to ${username} via Bridge.
`);
          return;
        }
        const commands = renderActionCommands(spec, username, actionValues);
        if (commands.length === 0) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { code: 'INVALID_PAYLOAD', message: `"${spec.id}" needs the Telemetry Bridge to be connected.` }
            })
          );
          return;
        }
        for (const command of commands) {
          if (sup.sendCommand(command)) broadcast('CONSOLE', `> ${command}
`);
        }
      }
      // Inventory inspection is a bridge capability (`inventory.view`), shared by every game that implements it.
      if (action === 'INVENTORY_VIEW' && data && typeof data === 'object') {
        const { username } = data as { username?: unknown };
        if (typeof username !== 'string') return;
        const sent = registry.sendBridgeAction(instanceManager.getActiveInstanceId(), { action: 'INVENTORY_VIEW', username });
        if (!sent && config.mockEnabled) broadcast('INVENTORY_DATA', createMockInventory(username));
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
        broadcast('PLAYERS', readDevMock().players);
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
  startAutostartInstances();
});

/** Starts every instance flagged "start with Hosty", one after another to avoid a CPU spike. */
function startAutostartInstances(): void {
  const pending = instanceManager.listInstances().filter((instance) => instance.autostart);
  pending.forEach((instance, index) => {
    setTimeout(() => {
      try {
        prepareBridgeConfig(instance.id);
        registry.getOrCreateSupervisor(instance).start();
        console.log(`[MC-Nexus Daemon] Autostarted "${instance.name}".`);
      } catch (err) {
        console.error(`Autostart failed for "${instance.name}":`, err);
      }
    }, 1500 + index * 4000);
  });
}

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