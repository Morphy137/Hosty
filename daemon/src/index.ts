import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { finished } from 'stream/promises';
import { loadConfig } from './config/env';
import { ProcessSupervisor, PlayerState, ServerMetrics } from './core/ProcessSupervisor';
import { InstanceManager, type InstanceSettings } from './core/InstanceManager';
import { SupervisorRegistry } from './core/SupervisorRegistry';
import { ModJarManager } from './core/ModJarManager';
import { PropertiesParser } from './parsers/PropertiesParser';
import { ModConfigParser } from './parsers/ModConfigParser';
import { ServerInstaller, LoaderType } from './provisioning/ServerInstaller';
import { parseConfigUpdates } from './parsers/configUpdates';
import { DaemonError, toErrorResponse } from './errors';

const config = loadConfig();

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
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

let isInstalling = false;

// Helper to get currently active working directory
const getActiveDir = () => instanceManager.getActiveInstanceDir();

// Helper to get or create the ProcessSupervisor for the active instance
const getActiveSupervisor = (): ProcessSupervisor => {
  const activeInstance = instanceManager.getInstance(instanceManager.getActiveInstanceId());
  if (activeInstance) {
    return registry.getOrCreateSupervisor(activeInstance);
  }
  return registry.getOrCreateSupervisor({
    id: instanceManager.getActiveInstanceId(),
    dir: instanceManager.getActiveInstanceDir(),
    name: 'default',
    port: 25565,
    motd: 'default',
    hasJar: false,
    hasIcon: false,
    isImported: false,
    createdAt: new Date().toISOString(),
    maxPlayers: 20,
    minRamMb: config.minRamMb,
    maxRamMb: config.maxRamMb,
    jvmArgs: [],
    javaPath: config.javaPath,
    forceSaveOnStop: true,
    autostart: false
  });
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

// Health check endpoint
app.get('/api/health', (_req, res) => {
  const sup = getActiveSupervisor();
  res.json({
    status: 'ok',
    mockEnabled: config.mockEnabled,
    serverStatus: sup.getStatus(),
    activeInstance: instanceManager.getActiveInstanceId()
  });
});

// Instances API
app.get('/api/instances', (_req, res, next) => {
  try {
    const list = instanceManager.listInstances().map((inst) => ({
      ...inst,
      status: registry.getStatus(inst.id),
      onlinePlayersCount: registry.getPlayers(inst.id).length
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
        onlinePlayersCount: sup.getPlayers().length
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
      onlinePlayersCount: registry.getPlayers(instance.id).length
    });
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
    const { path: folderPath, name } = req.body as { path: string; name?: string };
    if (!folderPath) throw new DaemonError('INVALID_PAYLOAD', 'Folder path is required.');

    const imported = instanceManager.importInstance(folderPath, name);
    res.json({ ok: true, instance: imported });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/upload-server-jar', async (req, res, next) => {
  try {
    const instanceId = req.query.instanceId as string;
    const instanceName = (req.query.name as string) || undefined;
    if (!instanceId) {
      throw new DaemonError('INVALID_PAYLOAD', 'instanceId query parameter is required.');
    }

    const sup = registry.getSupervisor(instanceId);
    if (sup && sup.getStatus() !== 'OFFLINE') {
      throw new DaemonError('SERVER_RUNNING', 'Cannot upload server jar while server is running.');
    }

    let targetDir = getActiveDir();
    const existing = instanceManager.getInstance(instanceId);
    if (existing) {
      targetDir = existing.dir;
    } else {
      const created = instanceManager.createInstance(instanceId, instanceName);
      targetDir = created.dir;
    }

    const jarDest = path.join(targetDir, 'server.jar');
    const writeStream = fs.createWriteStream(jarDest);
    await finished(req.pipe(writeStream));

    // Sign EULA and generate full properties if missing
    fs.writeFileSync(path.join(targetDir, 'eula.txt'), 'eula=true\n', 'utf-8');
    const propsPath = path.join(targetDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      PropertiesParser.createDefaultProperties(propsPath, { motd: instanceName || instanceId });
    }

    if (instanceManager.getActiveInstanceId() !== instanceId) {
      instanceManager.setActiveInstanceId(instanceId);
    }

    broadcast('CONSOLE', `[Hypervisor] server.jar uploaded and registered for instance "${instanceId}".\r\n`);
    res.json({ ok: true, instanceId: instanceManager.getActiveInstanceId() });
  } catch (err) {
    next(err);
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

    if (instanceId) {
      const sup = registry.getSupervisor(instanceId);
      if (sup && sup.getStatus() !== 'OFFLINE') {
        throw new DaemonError('SERVER_RUNNING', 'Cannot install server software while server is running.');
      }
    } else {
      const sup = getActiveSupervisor();
      if (sup.getStatus() !== 'OFFLINE') {
        throw new DaemonError('SERVER_RUNNING', 'Cannot install server software while server is running.');
      }
    }

    if (isInstalling) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    let targetDir = getActiveDir();
    if (instanceId) {
      const existing = instanceManager.getInstance(instanceId);
      if (existing) {
        targetDir = existing.dir;
      } else {
        const created = instanceManager.createInstance(instanceId, instanceName, {
          ...settings,
          loader,
          loaderVersion: version
        });
        targetDir = created.dir;
      }
    }

    isInstalling = true;
    try {
      await ServerInstaller.provisionServer(targetDir, loader, version, (msg) => {
        broadcast('CONSOLE', `${msg}\r\n`);
        broadcast('PROVISION_LOG', msg);
      });

      // Update instance settings with loader and version
      if (instanceId) {
        instanceManager.updateInstanceSettings(instanceId, { loader, loaderVersion: version });
      }

      // If installation targeted another instance, auto-select it
      if (instanceId && instanceManager.getActiveInstanceId() !== instanceId) {
        instanceManager.setActiveInstanceId(instanceId);
      }

      res.json({ ok: true, instanceId: instanceManager.getActiveInstanceId() });
    } finally {
      isInstalling = false;
    }
  } catch (err) {
    next(err);
  }
});

// Centralized error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const { status, body } = toErrorResponse(err);
  res.status(status).json(body);
});

// 20 Simulated players for the MOCK action
const MOCK_PLAYERS: PlayerState[] = [
  { username: 'MorphyCD', dimension: 'overworld', x: -245, y: 68, z: 1120 },
  { username: 'Notch', dimension: 'the_nether', x: 42, y: 81, z: -19 },
  { username: 'Jeb_', dimension: 'the_end', x: 0, y: 64, z: 0 },
  { username: 'Dinnerbone', dimension: 'overworld', x: 1024, y: 72, z: -550 },
  { username: 'Grian', dimension: 'overworld', x: 120, y: 85, z: 340 },
  { username: 'MumboJumbo', dimension: 'overworld', x: -80, y: 64, z: 520 },
  { username: 'DanTDM', dimension: 'overworld', x: 310, y: 63, z: -105 },
  { username: 'CaptainSparklez', dimension: 'the_nether', x: 15, y: 70, z: 128 },
  { username: 'Technoblade', dimension: 'the_nether', x: -666, y: 108, z: 420 },
  { username: 'Dream', dimension: 'overworld', x: 890, y: 70, z: -320 },
  { username: 'GeorgeNotFound', dimension: 'overworld', x: 910, y: 71, z: -305 },
  { username: 'Sapnap', dimension: 'the_nether', x: 210, y: 64, z: -88 },
  { username: 'TommyInnit', dimension: 'overworld', x: 50, y: 65, z: 15 },
  { username: 'Philza', dimension: 'the_end', x: 100, y: 49, z: -80 },
  { username: 'WilburSoot', dimension: 'overworld', x: -140, y: 63, z: 230 },
  { username: 'Quackity', dimension: 'overworld', x: 730, y: 68, z: 95 },
  { username: 'Tubbo', dimension: 'overworld', x: 60, y: 66, z: 40 },
  { username: 'Ranboo', dimension: 'the_end', x: 250, y: 55, z: 14 },
  { username: 'Skeppy', dimension: 'overworld', x: -450, y: 64, z: -120 },
  { username: 'BadBoyHalo', dimension: 'the_nether', x: -300, y: 80, z: 75 }
];

// WebSocket Handling
wss.on('connection', (ws) => {
  const activeSup = getActiveSupervisor();
  ws.send(JSON.stringify({ type: 'STATUS', payload: activeSup.getStatus() }));
  ws.send(JSON.stringify({ type: 'PLAYERS', payload: activeSup.getPlayers() }));
  ws.send(
    JSON.stringify({
      type: 'METRICS',
      payload: {
        cpu: 0,
        ramMb: 0,
        maxRamMb: activeSup.getConfig().maxRamMb,
        uptime: 0
      }
    })
  );

  ws.on('message', (raw) => {
    try {
      const { action, data } = JSON.parse(raw.toString());
      const sup = getActiveSupervisor();

      if (action === 'START') sup.start();
      if (action === 'STOP') sup.stop();
      if (action === 'KILL') sup.kill();
      if (action === 'COMMAND' && typeof data === 'string') {
        const sent = sup.sendCommand(data);
        if (sent) broadcast('CONSOLE', `> ${data}\r\n`);
      }
      if (action === 'MOCK' && config.mockEnabled) {
        const mockMetrics: ServerMetrics = {
          cpu: 38.4,
          ramMb: 3120,
          maxRamMb: sup.getConfig().maxRamMb,
          uptime: 7200000
        };
        broadcast('STATUS', 'ONLINE');
        broadcast('METRICS', mockMetrics);
        broadcast('PLAYERS', MOCK_PLAYERS);
        broadcast('CONSOLE', '[Server thread/INFO]: Done (3.850s)! Simulated 20-Player Telemetry Active.\r\n');
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