import { useCallback, useEffect, useRef, useState } from 'react';

/** Last value per key, kept for the app's lifetime so returning to a tab shows it immediately. */
const cache = new Map<string, unknown>();

export interface CachedResource<T> {
  /** Last known value (cached or fresh); undefined only before the very first load of this key. */
  data: T | undefined;
  /** True only while nothing is known yet: render placeholders, not an empty state. */
  isLoading: boolean;
  /** True while a refresh runs in the background over data that is already shown. */
  isRefreshing: boolean;
  error: unknown;
  /** Fetches again; the current data stays visible meanwhile. */
  refresh: () => Promise<void>;
}

interface Snapshot<T> {
  key: string | null;
  value: T | undefined;
  error: unknown;
  fetching: boolean;
}

/**
 * Stale-while-revalidate data for views that are mounted and unmounted often (tabs): the cached value renders
 * at once and is replaced when the fetch answers, so the layout never flashes empty. `key` null skips fetching.
 */
export function useCachedResource<T>(key: string | null, fetcher: () => Promise<T>): CachedResource<T> {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key: null, value: undefined, error: null, fetching: false });
  const latest = useRef({ key, fetcher });

  useEffect(() => {
    latest.current = { key, fetcher };
  }, [key, fetcher]);

  const refresh = useCallback(async () => {
    const { key: requestedKey, fetcher: fetchValue } = latest.current;
    if (!requestedKey) return;
    setSnapshot((current) =>
      current.key === requestedKey
        ? { ...current, fetching: true }
        : { key: requestedKey, value: undefined, error: null, fetching: true }
    );
    try {
      const value = await fetchValue();
      cache.set(requestedKey, value);
      setSnapshot((current) =>
        current.key === requestedKey ? { key: requestedKey, value, error: null, fetching: false } : current
      );
    } catch (error) {
      setSnapshot((current) => (current.key === requestedKey ? { ...current, error, fetching: false } : current));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [key, refresh]);

  // Until this key's first answer arrives, show what the cache remembers from an earlier visit.
  const own = snapshot.key === key;
  const data = own && snapshot.value !== undefined ? snapshot.value : key ? (cache.get(key) as T | undefined) : undefined;
  const error = own ? snapshot.error : null;

  return {
    data,
    isLoading: data === undefined && error === null,
    isRefreshing: own && snapshot.fetching && data !== undefined,
    error,
    refresh
  };
}

/** Test helper: forgets every cached value. */
export function clearResourceCache(): void {
  cache.clear();
}
