import { useCallback, useEffect, useState } from 'react';
import { fetchServerProperties, saveServerProperties } from '../api/daemonApi';
import type { ConfigEntry, ConfigValue, SocketConnectionState } from '../types/daemon';
import { updateEntryValue } from '../utils/configEntries';

export interface ServerPropertiesState {
  entries: ConfigEntry[];
  filter: string;
  setFilter: (filter: string) => void;
  updateEntry: (key: string, value: ConfigValue) => void;
  save: () => Promise<void>;
}

export function useServerProperties(
  connectionState: SocketConnectionState,
  onError: (error: unknown) => void
): ServerPropertiesState {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchServerProperties()
      .then((loadedEntries) => {
        if (!ignore) setEntries(loadedEntries);
      })
      .catch((error: unknown) => {
        if (!ignore) onError(error);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, onError]);

  const updateEntry = useCallback((key: string, value: ConfigValue) => {
    setEntries((previous) => updateEntryValue(previous, key, value));
  }, []);

  const save = useCallback(async () => {
    try {
      await saveServerProperties(entries);
    } catch (error) {
      onError(error);
    }
  }, [entries, onError]);

  return { entries, filter, setFilter, updateEntry, save };
}
