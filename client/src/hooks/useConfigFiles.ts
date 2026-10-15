import { useCallback, useEffect, useState } from 'react';
import { fetchConfigEntries, fetchConfigFiles, saveConfigEntries } from '../api/daemonApi';
import type { ConfigEntry, ConfigFileInfo, ConfigValue, SocketConnectionState } from '../types/daemon';
import { updateEntryValue } from '../utils/configEntries';

export interface ConfigFilesState {
  files: ConfigFileInfo[];
  selectedPath: string;
  selectFile: (path: string) => void;
  entries: ConfigEntry[];
  filter: string;
  setFilter: (filter: string) => void;
  updateEntry: (key: string, value: ConfigValue) => void;
  save: () => Promise<void>;
  /** Selected file is declared by the game but not created yet (before the first server start). */
  isMissing: boolean;
}

/** Loads the config files a game declares and edits the selected one; reloads when the server changes. */
export function useConfigFiles(
  connectionState: SocketConnectionState,
  activeInstanceId: string,
  onError: (error: unknown) => void
): ConfigFilesState {
  const [files, setFiles] = useState<ConfigFileInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    if (connectionState !== 'open' || !activeInstanceId) return;
    let ignore = false;
    fetchConfigFiles()
      .then((list) => {
        if (ignore) return;
        setFiles(list);
        setSelectedPath((current) => (list.some((file) => file.path === current) ? current : (list[0]?.path ?? '')));
      })
      .catch((error: unknown) => {
        if (!ignore) onError(error);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, activeInstanceId, onError]);

  useEffect(() => {
    const selected = files.find((file) => file.path === selectedPath);
    if (!selected || connectionState !== 'open') return;

    let ignore = false;
    if (selected.exists === false) {
      // Declared but not created yet: show an empty editor with a hint instead of an error.
      Promise.resolve().then(() => {
        if (ignore) return;
        setEntries([]);
        setIsMissing(true);
      });
      return () => {
        ignore = true;
      };
    }

    fetchConfigEntries(selected.path)
      .then((loaded) => {
        if (ignore) return;
        setEntries(loaded);
        setIsMissing(false);
      })
      .catch((error: unknown) => {
        if (!ignore) onError(error);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, files, selectedPath, onError]);

  const updateEntry = useCallback((key: string, value: ConfigValue) => {
    setEntries((previous) => updateEntryValue(previous, key, value));
  }, []);

  const save = useCallback(async () => {
    if (!selectedPath) return;
    try {
      await saveConfigEntries(selectedPath, entries);
    } catch (error) {
      onError(error);
    }
  }, [entries, onError, selectedPath]);

  return { files, selectedPath, selectFile: setSelectedPath, entries, filter, setFilter, updateEntry, save, isMissing };
}
