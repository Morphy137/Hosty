import { describe, expect, it } from 'vitest';
import { INITIAL_DAEMON_SOCKET_STATE, daemonSocketReducer } from '../src/state/daemonSocketReducer';

describe('instance view reset', () => {
  it('drops the previous server state and adopts the new console and status', () => {
    const dirty = {
      ...INITIAL_DAEMON_SOCKET_STATE,
      logs: ['old line\r\n'],
      status: 'ONLINE' as const,
      players: [{ username: 'Bob' }] as never
    };
    const next = daemonSocketReducer(dirty, { kind: 'resetInstanceView', lines: ['new\r\n'], status: 'OFFLINE' });

    expect(next.logs).toEqual(['new\r\n']);
    expect(next.status).toBe('OFFLINE');
    expect(next.players).toEqual([]);
    expect(next.inventory).toBeNull();
  });

  it('keeps the live data the socket already sent when the same server is shown again', () => {
    const live = daemonSocketReducer(INITIAL_DAEMON_SOCKET_STATE, { kind: 'message', message: { type: 'STATUS', payload: 'ONLINE' } });
    const state = daemonSocketReducer(live, { kind: 'resetInstanceView', lines: ['a'], status: 'ONLINE', keepLive: true });

    expect(state.status).toBe('ONLINE');
    expect(state.logs).toEqual(['a']);
  });
});
