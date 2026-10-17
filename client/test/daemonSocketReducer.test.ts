import { describe, it, expect } from 'vitest';
import {
  appendCapped,
  parseDaemonMessage,
  daemonSocketReducer,
  INITIAL_DAEMON_SOCKET_STATE
} from '../src/state/daemonSocketReducer';

describe('daemonSocketReducer', () => {
  it('appends and caps lines to maximum buffer size', () => {
    const initial = ['line 1', 'line 2'];
    const updated = appendCapped(initial, 'line 3', 3);
    expect(updated).toEqual(['line 1', 'line 2', 'line 3']);

    const overflow = appendCapped(updated, 'line 4', 3);
    expect(overflow).toEqual(['line 2', 'line 3', 'line 4']);
  });

  it('parses valid WebSocket messages and rejects invalid ones', () => {
    const valid = JSON.stringify({ type: 'STATUS', payload: 'ONLINE' });
    expect(parseDaemonMessage(valid)).toEqual({ type: 'STATUS', payload: 'ONLINE' });

    expect(parseDaemonMessage('invalid json')).toBeNull();
    expect(parseDaemonMessage(JSON.stringify({ type: 'UNKNOWN_TYPE' }))).toBeNull();
  });

  it('updates state for STATUS, METRICS, and PLAYERS', () => {
    let state = daemonSocketReducer(INITIAL_DAEMON_SOCKET_STATE, {
      kind: 'message',
      message: { type: 'STATUS', payload: 'ONLINE' }
    });
    expect(state.status).toBe('ONLINE');

    state = daemonSocketReducer(state, {
      kind: 'message',
      message: {
        type: 'METRICS',
        payload: { cpu: 15.5, ramMb: 2000, maxRamMb: 4096, uptime: 120 }
      }
    });
    expect(state.metrics.cpu).toBe(15.5);

    state = daemonSocketReducer(state, {
      kind: 'message',
      message: {
        type: 'PLAYERS',
        payload: [{ username: 'Morphy', dimension: 'overworld', x: 0, y: 64, z: 0 }]
      }
    });
    expect(state.players).toHaveLength(1);
    expect(state.players[0].username).toBe('Morphy');
  });

  it('handles error messages and clearError', () => {
    const state = daemonSocketReducer(INITIAL_DAEMON_SOCKET_STATE, {
      kind: 'message',
      message: { type: 'ERROR', payload: { code: 'JAR_MISSING', message: 'Jar not found' } }
    });
    expect(state.lastError?.code).toBe('JAR_MISSING');

    const cleared = daemonSocketReducer(state, { kind: 'clearError' });
    expect(cleared.lastError).toBeNull();
  });

  it('tracks installation job progress and clears it on reset', () => {
    const job = {
      id: 'job-1',
      instanceId: 'survival',
      loader: 'neoforge',
      version: '1.21.1',
      status: 'running' as const,
      phase: 'download' as const,
      bytesReceived: 50,
      bytesTotal: 100,
      percent: 50,
      error: null
    };
    const state = daemonSocketReducer(INITIAL_DAEMON_SOCKET_STATE, {
      kind: 'message',
      message: { type: 'PROVISION_PROGRESS', payload: job }
    });
    expect(state.provisionJob?.percent).toBe(50);

    const reset = daemonSocketReducer(state, { kind: 'resetProvisionLogs', lines: [] });
    expect(reset.provisionJob).toBeNull();
  });

  it('computes RAM suggestions from system memory', async () => {
    const { defaultMinRamMb, maxAllocatableRamMb, recommendedRamMb } = await import('../src/utils/ram');
    expect(defaultMinRamMb(512)).toBe(512);
    expect(defaultMinRamMb(4096)).toBe(1024);
    expect(defaultMinRamMb(16384)).toBe(2048);
    expect(recommendedRamMb(16384)).toBe(8192);
    expect(recommendedRamMb(4096)).toBe(2048);
    expect(maxAllocatableRamMb(16384)).toBe(14336);
  });
});

describe('inventory inspection', () => {
  it('keeps the bridge failure until a new request or an inventory arrives', () => {
    const failed = daemonSocketReducer(INITIAL_DAEMON_SOCKET_STATE, {
      kind: 'message',
      message: { type: 'INVENTORY_ERROR', payload: { username: 'Steve', message: 'Not supported on this Minecraft version' } }
    });
    expect(failed.inventoryError).toBe('Not supported on this Minecraft version');
    expect(daemonSocketReducer(failed, { kind: 'clearInventory' }).inventoryError).toBeNull();

    const inventory = { username: 'Steve', armor: [], offhand: null, hotbar: [], inventory: [] };
    const recovered = daemonSocketReducer(failed, { kind: 'message', message: { type: 'INVENTORY_DATA', payload: inventory } });
    expect(recovered).toMatchObject({ inventory, inventoryError: null });
  });

  it('accepts the new message type from the socket', () => {
    const raw = JSON.stringify({ type: 'INVENTORY_ERROR', payload: { username: 'Steve', message: '' } });
    expect(parseDaemonMessage(raw)).toMatchObject({ type: 'INVENTORY_ERROR' });
  });
});
