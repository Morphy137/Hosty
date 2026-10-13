import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { loadConfig } from './config/env';
import { ProcessSupervisor, PlayerState, ServerMetrics, ServerStatus } from './core/ProcessSupervisor';
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
      // Allow requests with no origin (like local curl, mobile apps, or Postman)
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

const supervisor = new ProcessSupervisor({
  id: config.instanceId,
  workingDir: config.instanceDir,
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

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mockEnabled: config.mockEnabled,
    serverStatus: currentStatus
  });
});

// Server Properties API
app.get('/api/properties', (_req, res, next) => {
  try {
    res.json(PropertiesParser.parseFile(config.instanceDir));
  } catch (err) {
    next(err);
  }
});

app.post('/api/properties', (req, res, next) => {
  try {
    const updates = parseConfigUpdates(req.body);
    PropertiesParser.saveFile(config.instanceDir, updates);
    broadcast('CONSOLE', '[Hypervisor] server.properties updated on disk.\r\n');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Mod Configs API
app.get('/api/mods/configs', (_req, res, next) => {
  try {
    res.json(ModConfigParser.listConfigs(config.instanceDir));
  } catch (err) {
    next(err);
  }
});

app.get('/api/mods/configs/:filename', (req, res, next) => {
  try {
    res.json(ModConfigParser.parseConfig(config.instanceDir, req.params.filename));
  } catch (err) {
    next(err);
  }
});

app.post('/api/mods/configs/:filename', (req, res, next) => {
  try {
    ModConfigParser.saveConfig(config.instanceDir, req.params.filename, req.body);
    broadcast('CONSOLE', `[Hypervisor] Mod config ${req.params.filename} saved.\r\n`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Server Provisioning API
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

    const { loader, version } = req.body as { loader: LoaderType; version: string };
    isInstalling = true;
    try {
      await ServerInstaller.provisionServer(config.instanceDir, loader, version, (msg) => {
        broadcast('CONSOLE', `${msg}\r\n`);
        broadcast('PROVISION_LOG', msg);
      });
      res.json({ ok: true });
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