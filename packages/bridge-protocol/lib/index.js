'use strict';
// Validation and a simulated daemon for Hosty bridge protocol v1 (see docs/bridge-protocol.md).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020');

const schema = require('../schema/bridge-v1.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const PROTOCOL_VERSION = 1;
const STANDARD_ACTIONS = [
  'heal',
  'damage',
  'kill',
  'kick',
  'teleport',
  'freeze',
  'unfreeze',
  'smite',
  'give_exp',
  'mute',
  'unmute',
  'inventory_view'
];

/** Validates one protocol frame. Returns `{ ok, errors }` with readable messages. */
function validateMessage(message) {
  const ok = validate(message);
  const errors = ok
    ? []
    : (validate.errors || [])
        // oneOf failures repeat once per branch; keep the ones of the branch matching `type`.
        .filter((error) => !error.schemaPath.endsWith('/oneOf'))
        .map((error) => `${error.instancePath || '(root)'} ${error.message}`);
  return { ok: Boolean(ok), errors: [...new Set(errors)] };
}

/** Capability string for an action (`inventory_view` -> `inventory.view`). */
function capabilityForAction(action) {
  return action === 'inventory_view' ? 'inventory.view' : `action.${action}`;
}

/** Writes `<serverDir>/.hosty/bridge.json` exactly like the daemon does before a server starts. */
function writeBridgeConfig(serverDir, { instanceId, url, token = crypto.randomBytes(32).toString('hex') }) {
  const dir = path.join(serverDir, '.hosty');
  fs.mkdirSync(dir, { recursive: true });
  const config = { protocolVersion: PROTOCOL_VERSION, instanceId, token, url };
  fs.writeFileSync(path.join(dir, 'bridge.json'), JSON.stringify(config, null, 2));
  return config;
}

/**
 * Starts a WebSocket server that behaves like the Hosty daemon's bridge endpoint and records every
 * frame with its validation result. Used by the CLI and by tests.
 */
function createTesterServer({ port = 0, instanceId, token, onEvent = () => {} } = {}) {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ port, path: '/telemetry/bridge' });
  const report = { frames: [], invalid: 0, handshake: null, capabilities: [], customActions: [] };
  const sockets = new Set();

  wss.on('connection', (socket) => {
    sockets.add(socket);
    let authenticated = false;

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        report.invalid += 1;
        onEvent({ kind: 'invalid', error: 'not JSON' });
        return;
      }

      const result = validateMessage(message);
      report.frames.push({ type: message.type, ok: result.ok, errors: result.errors });
      if (!result.ok) {
        report.invalid += 1;
        onEvent({ kind: 'invalid', type: message.type, errors: result.errors });
      }

      if (message.type === 'HELLO') {
        const versionOk = message.protocolVersion === PROTOCOL_VERSION;
        const tokenOk = token === undefined || message.token === token;
        const idOk = instanceId === undefined || message.instanceId === instanceId;
        const accepted = result.ok && versionOk && tokenOk && idOk;
        report.handshake = { accepted, versionOk, tokenOk, idOk, implementation: message.implementation };
        authenticated = accepted;
        if (accepted) {
          report.capabilities = message.capabilities;
          report.customActions = message.customActions || [];
        }
        socket.send(
          JSON.stringify(
            accepted
              ? { type: 'HELLO_ACK', ok: true, protocolVersion: PROTOCOL_VERSION }
              : {
                  type: 'HELLO_ACK',
                  ok: false,
                  error: {
                    code: !versionOk ? 'UNSUPPORTED_VERSION' : !tokenOk || !idOk ? 'UNAUTHORIZED' : 'INVALID_MESSAGE',
                    message: 'Handshake rejected by the tester'
                  }
                }
          )
        );
        onEvent({ kind: 'hello', accepted, hello: message });
        return;
      }

      if (!authenticated) {
        report.invalid += 1;
        onEvent({ kind: 'invalid', type: message.type, errors: ['frame sent before an accepted HELLO'] });
        return;
      }
      onEvent({ kind: 'frame', message });
    });

    socket.on('close', () => sockets.delete(socket));
  });

  return {
    wss,
    report,
    /** Sends an ACTION to every connected bridge (only meaningful once authenticated). */
    sendAction(action, playerName, params = {}) {
      const frame = {
        type: 'ACTION',
        actionId: crypto.randomUUID(),
        action,
        target: { type: 'player', name: playerName },
        params
      };
      for (const socket of sockets) socket.send(JSON.stringify(frame));
      return frame;
    },
    address() {
      return wss.address();
    },
    close() {
      return new Promise((resolve) => {
        for (const socket of sockets) socket.close();
        wss.close(() => resolve());
      });
    }
  };
}

module.exports = {
  PROTOCOL_VERSION,
  STANDARD_ACTIONS,
  validateMessage,
  capabilityForAction,
  writeBridgeConfig,
  createTesterServer
};
