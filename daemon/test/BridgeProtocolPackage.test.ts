import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { parseBridgeMessage, STANDARD_ACTIONS, capabilityForAction } from '../src/core/bridge/protocolV1';

const require = createRequire(__filename);
const packagePath = path.resolve(__dirname, '../../packages/bridge-protocol/lib/index.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require(packagePath) as {
  validateMessage: (message: unknown) => { ok: boolean; errors: string[] };
  createTesterServer: (options: Record<string, unknown>) => {
    report: { frames: Array<{ type: string; ok: boolean }>; invalid: number; handshake: { accepted: boolean } | null; capabilities: string[] };
    sendAction: (action: string, player: string, params?: Record<string, unknown>) => { action: string };
    address: () => { port: number };
    close: () => Promise<void>;
  };
  STANDARD_ACTIONS: string[];
  capabilityForAction: (action: string) => string;
};

const hello = {
  type: 'HELLO',
  protocolVersion: 1,
  instanceId: 'dev',
  token: 'secret',
  game: 'minecraft',
  implementation: { name: 'test-bridge', version: '0.0.1' },
  capabilities: ['telemetry.server', 'telemetry.players', 'action.heal']
};

const samples = [
  hello,
  { type: 'TELEMETRY', server: { tps: 20, mspt: 8 }, players: [{ name: 'Steve', position: { x: 1, y: 2, z: 3, world: 'overworld' } }] },
  { type: 'INVENTORY', player: { name: 'Steve' }, containers: [{ id: 'hotbar', slots: [{ index: 0, itemId: 'minecraft:stone', count: 1 }, null] }] },
  { type: 'RESULT', actionId: 'a-1', success: true }
];

const invalid = [
  { type: 'HELLO' },
  { type: 'TELEMETRY', players: [{ ping: 3 }] },
  { type: 'INVENTORY', player: {}, containers: [] },
  { type: 'RESULT' }
];

describe('bridge-protocol package', () => {
  it('JSON Schema and the daemon parser agree on valid and invalid frames', () => {
    for (const frame of samples) {
      expect(pkg.validateMessage(frame).ok, JSON.stringify(frame)).toBe(true);
      expect(parseBridgeMessage(frame).ok, JSON.stringify(frame)).toBe(true);
    }
    for (const frame of invalid) {
      expect(pkg.validateMessage(frame).ok, JSON.stringify(frame)).toBe(false);
      expect(parseBridgeMessage(frame).ok, JSON.stringify(frame)).toBe(false);
    }
  });

  it('keeps the standard action list and capability naming in sync', () => {
    expect(pkg.STANDARD_ACTIONS).toEqual([...STANDARD_ACTIONS]);
    for (const action of STANDARD_ACTIONS) {
      expect(pkg.capabilityForAction(action)).toBe(capabilityForAction(action));
    }
  });

  it('the simulated daemon completes a handshake, validates frames and delivers actions', async () => {
    const tester = pkg.createTesterServer({ port: 0, instanceId: 'dev', token: 'secret' });
    await new Promise((resolve) => tester.wss.once('listening', resolve));
    const { port } = tester.address();

    const client = new WebSocket(`ws://127.0.0.1:${port}/telemetry/bridge`);
    const received: Array<Record<string, unknown>> = [];
    client.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    await new Promise((resolve) => client.once('open', resolve));

    client.send(JSON.stringify(hello));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received[0]).toMatchObject({ type: 'HELLO_ACK', ok: true, protocolVersion: 1 });

    client.send(JSON.stringify(samples[1]));
    client.send(JSON.stringify({ type: 'TELEMETRY', players: [{ ping: 1 }] })); // missing "name"
    tester.sendAction('heal', 'Steve', { amount: 5 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received[1]).toMatchObject({ type: 'ACTION', action: 'heal', target: { type: 'player', name: 'Steve' } });
    expect(tester.report.handshake?.accepted).toBe(true);
    expect(tester.report.capabilities).toContain('action.heal');
    expect(tester.report.invalid).toBe(1);

    client.close();
    await tester.close();
  });

  it('the simulated daemon rejects a bad token like the real daemon', async () => {
    const tester = pkg.createTesterServer({ port: 0, instanceId: 'dev', token: 'secret' });
    await new Promise((resolve) => tester.wss.once('listening', resolve));
    const { port } = tester.address();

    const client = new WebSocket(`ws://127.0.0.1:${port}/telemetry/bridge`);
    const received: Array<Record<string, unknown>> = [];
    client.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    await new Promise((resolve) => client.once('open', resolve));
    client.send(JSON.stringify({ ...hello, token: 'wrong' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received[0]).toMatchObject({ type: 'HELLO_ACK', ok: false, error: { code: 'UNAUTHORIZED' } });
    client.close();
    await tester.close();
  });
});
