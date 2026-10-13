import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { loadConfig } from './config/env';
import { ProcessSupervisor, PlayerState, ServerMetrics, ServerStatus } from './core/ProcessSupervisor';
import { InstanceManager } from './core/InstanceManager';
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
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Instance Manager oversees all folders under instances/
const instancesRootDir = path.dirname(config.instanceDir);
const instanceManager = new InstanceManager(instancesRootDir, config.instanceId);

const supervisor = new ProcessSupervisor({
  id: instanceManager.getActiveInstanceId(),
  workingDir: instanceManager.getActiveInstanceDir(),
  jarFile: config.jarFile,
  javaPath: config.javaPath,
  minRamMb: config.minRamMb,
  maxRamMb: config.maxRamMb,
  stopTimeoutMs: config.stopTimeoutMs,
  metricsIntervalMs: config.metricsIntervalMs,
  positionPollIntervalMs: config.positionPollIntervalMs
});

let currentStatus: ServerStatus = 'OFFLINE';
let currentPlayers: PlayerState[] = [];
let currentMetrics: ServerMetrics = {
  cpu: 0,
  ramMb: 0,
  maxRamMb: config.maxRamMb,
  uptime: 0
};
let isInstalling = false;

const broadcast = (type: string, payload: unknown) => {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

supervisor.on('console', (line) => broadcast('CONSOLE', line));
supervisor.on('status', (status) => {
  currentStatus = status;
  broadcast('STATUS', status);
});
supervisor.on('metrics', (metrics) => {
  currentMetrics = metrics;
  broadcast('METRICS', metrics);
});
supervisor.on('players', (players) => {
  currentPlayers = players;
  broadcast('PLAYERS', players);
});
supervisor.on('failure', (failure) => {
  broadcast('ERROR', failure);
});

// Helper to get currently active working directory
const getActiveDir = () => instanceManager.getActiveInstanceDir();

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mockEnabled: config.mockEnabled,
    serverStatus: currentStatus,
    activeInstance: instanceManager.getActiveInstanceId()
  });
});

// Instances API
app.get('/api/instances', (_req, res, next) => {
  try {
    res.json({
      instances: instanceManager.listInstances(),
      activeId: instanceManager.getActiveInstanceId()
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/select', (req, res, next) => {
  try {
    if (supervisor.getStatus() !== 'OFFLINE') {
      throw new DaemonError('SERVER_RUNNING', 'Cannot change active server while server is running.');
    }
    const { id } = req.body as { id: string };
    if (!id) throw new DaemonError('INVALID_PAYLOAD', 'Instance ID is required.');

    const selected = instanceManager.setActiveInstanceId(id);
    supervisor.setInstance(selected.id, selected.dir);
    broadcast('CONSOLE', `[Hypervisor] Switched active instance to "${selected.name}" (${selected.id})\r\n`);

    res.json({ ok: true, activeInstance: selected });
  } catch (err) {
    next(err);
  }
});

app.post('/api/instances/create', (req, res, next) => {
  try {
    const { id, name } = req.body as { id: string; name?: string };
    if (!id) throw new DaemonError('INVALID_PAYLOAD', 'Instance ID is required.');

    const created = instanceManager.createInstance(id, name);
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
    if (supervisor.getStatus() !== 'OFFLINE') {
      throw new DaemonError('SERVER_RUNNING', 'Cannot install server software while server is running.');
    }
    if (isInstalling) {
      throw new DaemonError('INSTALL_IN_PROGRESS', 'An installation is already in progress.');
    }

    const { loader, version, instanceId, instanceName } = req.body as {
      loader: LoaderType;
      version: string;
      instanceId?: string;
      instanceName?: string;
    };

    let targetDir = getActiveDir();
    if (instanceId) {
      const existing = instanceManager.getInstance(instanceId);
      if (existing) {
        targetDir = existing.dir;
      } else {
        const created = instanceManager.createInstance(instanceId, instanceName);
        targetDir = created.dir;
      }
    }

    isInstalling = true;
    try {
      await ServerInstaller.provisionServer(targetDir, loader, version, (msg) => {
        broadcast('CONSOLE', `${msg}\r\n`);
        broadcast('PROVISION_LOG', msg);
      });

      // If installation targeted another instance, auto-select it
      if (instanceId && instanceManager.getActiveInstanceId() !== instanceId) {
        instanceManager.setActiveInstanceId(instanceId);
        supervisor.setInstance(instanceId, targetDir);
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

// WebSocket Handling
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'STATUS', payload: currentStatus }));
  ws.send(JSON.stringify({ type: 'PLAYERS', payload: currentPlayers }));
  ws.send(JSON.stringify({ type: 'METRICS', payload: currentMetrics }));

  ws.on('message', (raw) => {
    try {
      const { action, data } = JSON.parse(raw.toString());
      if (action === 'START') supervisor.start();
      if (action === 'STOP') supervisor.stop();
      if (action === 'KILL') supervisor.kill();
      if (action === 'COMMAND' && typeof data === 'string') {
        const sent = supervisor.sendCommand(data);
        if (sent) broadcast('CONSOLE', `> ${data}\r\n`);
      }
      if (action === 'MOCK' && config.mockEnabled) {
        currentStatus = 'ONLINE';
        currentMetrics = { cpu: 34.8, ramMb: 2680, maxRamMb: config.maxRamMb, uptime: 5400000 };
        currentPlayers = [
          { username: 'MorphyCD', dimension: 'overworld', x: -245, y: 68, z: 1120 },
          { username: 'Notch', dimension: 'the_nether', x: 42, y: 81, z: -19 },
          { username: 'Jeb_', dimension: 'the_end', x: 0, y: 64, z: 0 }
        ];
        broadcast('STATUS', currentStatus);
        broadcast('METRICS', currentMetrics);
        broadcast('PLAYERS', currentPlayers);
        broadcast('CONSOLE', '[Server thread/INFO]: Done (4.120s)! Simulated Telemetry Active.\r\n');
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