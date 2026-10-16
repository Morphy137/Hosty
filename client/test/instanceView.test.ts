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
});
