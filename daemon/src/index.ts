import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { ProcessSupervisor, PlayerState } from './core/ProcessSupervisor';
import { PropertiesParser } from './parsers/PropertiesParser';
import { ModConfigParser } from './parsers/ModConfigParser';
import { ServerInstaller, LoaderType } from './provisioning/ServerInstaller';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const instanceDir = path.join(__dirname, '../../instances/default');

const supervisor = new ProcessSupervisor({
  id: 'survival-main',
  workingDir: instanceDir,
  jarFile: 'server.jar',
  minRamMb: 2048,
  maxRamMb: 4096
});

let currentStatus = 'OFFLINE';
let currentPlayers: PlayerState[] = [];
let currentMetrics = { cpu: 0, ramMb: 0, maxRamMb: 4096, uptime: 0 };

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

// Server Properties API
app.get('/api/properties', (_req, res) => {
  res.json(PropertiesParser.parseFile(instanceDir));
});

app.post('/api/properties', (req, res) => {
  PropertiesParser.saveFile(instanceDir, req.body);
  broadcast('CONSOLE', '[Hypervisor] server.properties updated on disk.\r\n');
  res.json({ ok: true });
});

// Mod Configs API
app.get('/api/mods/configs', (_req, res) => {
  res.json(ModConfigParser.listConfigs(instanceDir));
});

app.get('/api/mods/configs/:filename', (req, res) => {
  res.json(ModConfigParser.parseConfig(instanceDir, req.params.filename));
});

app.post('/api/mods/configs/:filename', (req, res) => {
  ModConfigParser.saveConfig(instanceDir, req.params.filename, req.body);
  broadcast('CONSOLE', `[Hypervisor] Mod config ${req.params.filename} saved.\r\n`);
  res.json({ ok: true });
});

// Server Provisioning API
app.get('/api/provisioning/versions/:loader', async (req, res) => {
  try {
    const loader = req.params.loader as LoaderType;
    const versions = await ServerInstaller.getVersions(loader);
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/provisioning/install', async (req, res) => {
  const { loader, version } = req.body as { loader: LoaderType; version: string };
  try {
    await ServerInstaller.provisionServer(instanceDir, loader, version, (msg) => {
      broadcast('CONSOLE', `${msg}\r\n`);
      broadcast('PROVISION_LOG', msg);
    });
    res.json({ ok: true });
  } catch (err: any) {
    broadcast('PROVISION_LOG', `[Error] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

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
      if (action === 'COMMAND') {
        supervisor.sendCommand(data);
        broadcast('CONSOLE', `> ${data}\r\n`);
      }
      if (action === 'MOCK') {
        currentStatus = 'ONLINE';
        currentMetrics = { cpu: 34.8, ramMb: 2680, maxRamMb: 4096, uptime: 5400000 };
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
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`[MC-Nexus Daemon] Listening on ws://localhost:${PORT}`);
});