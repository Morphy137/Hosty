// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearResourceCache, useCachedResource } from '../src/hooks/useCachedResource';

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
