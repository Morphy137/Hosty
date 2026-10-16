// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearResourceCache, useCachedResource } from '../src/hooks/useCachedResource';
import { daemonSocketReducer, INITIAL_DAEMON_SOCKET_STATE } from '../src/state/daemonSocketReducer';
import type { ModFileInfo, PlayerState } from '../src/types/daemon';
import { sortModFiles } from '../src/utils/modSort';

const mod = (originalName: string, sizeBytes: number, modifiedAt: string, enabled = true): ModFileInfo => ({
  filename: `${originalName}.jar`,
  originalName,
  sizeBytes,
  sizeFormatted: `${sizeBytes} B`,
  modifiedAt,
  enabled,
  hasConfig: false
});

describe('sortModFiles', () => {
  const files = [
    mod('sodium', 300, '2026-03-01T00:00:00Z'),
    mod('Fabric API', 900, '2026-01-01T00:00:00Z', false),
    mod('lithium', 100, '2026-05-01T00:00:00Z')
  ];
  const names = (sorted: ModFileInfo[]) => sorted.map((file) => file.originalName);

  it('sorts by name, date, size and status without touching the input', () => {
    expect(names(sortModFiles(files, 'name_asc'))).toEqual(['Fabric API', 'lithium', 'sodium']);
    expect(names(sortModFiles(files, 'name_desc'))).toEqual(['sodium', 'lithium', 'Fabric API']);
    expect(names(sortModFiles(files, 'newest'))).toEqual(['lithium', 'sodium', 'Fabric API']);
    expect(names(sortModFiles(files, 'oldest'))).toEqual(['Fabric API', 'sodium', 'lithium']);
    expect(names(sortModFiles(files, 'size_desc'))).toEqual(['Fabric API', 'sodium', 'lithium']);
    expect(names(sortModFiles(files, 'size_asc'))).toEqual(['lithium', 'sodium', 'Fabric API']);
    expect(names(sortModFiles(files, 'enabled_first'))).toEqual(['lithium', 'sodium', 'Fabric API']);
    expect(names(files)).toEqual(['sodium', 'Fabric API', 'lithium']);
  });
});

describe('useCachedResource', () => {
  afterEach(() => clearResourceCache());

  it('shows the cached value at once when a view mounts again, then refreshes it', async () => {
    let answer = 'first';
    const first = renderHook(() => useCachedResource('backups:a', async () => answer));
    expect(first.result.current.isLoading).toBe(true);
    await waitFor(() => expect(first.result.current.data).toBe('first'));
    first.unmount();

    answer = 'second';
    const again = renderHook(() => useCachedResource('backups:a', async () => answer));
    // No empty frame: the previous value is there before the new answer.
    expect(again.result.current.data).toBe('first');
    expect(again.result.current.isLoading).toBe(false);
    await waitFor(() => expect(again.result.current.data).toBe('second'));
  });

  it("never shows one key's data under another key", async () => {
    const { result, rerender } = renderHook(({ key }) => useCachedResource(key, async () => key), {
      initialProps: { key: 'backups:a' }
    });
    await waitFor(() => expect(result.current.data).toBe('backups:a'));
    rerender({ key: 'backups:b' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBe('backups:b'));
    await act(async () => result.current.refresh());
    expect(result.current.data).toBe('backups:b');
  });
});

describe('resetInstanceView', () => {
  const player = { username: 'Steve' } as PlayerState;
  const live = daemonSocketReducer(
    daemonSocketReducer(INITIAL_DAEMON_SOCKET_STATE, { kind: 'message', message: { type: 'STATUS', payload: 'ONLINE' } }),
    { kind: 'message', message: { type: 'PLAYERS', payload: [player] } }
  );

  it('keeps the live data the socket already sent when the same server is shown again', () => {
    const state = daemonSocketReducer(live, { kind: 'resetInstanceView', lines: ['a'], status: 'ONLINE', keepLive: true });
    expect(state.status).toBe('ONLINE');
    expect(state.players).toEqual([player]);
    expect(state.logs).toEqual(['a']);
  });

  it("clears the previous server's data when switching servers", () => {
    const state = daemonSocketReducer(live, { kind: 'resetInstanceView', lines: [], status: 'OFFLINE' });
    expect(state.players).toEqual([]);
    expect(state.status).toBe('OFFLINE');
  });
});
