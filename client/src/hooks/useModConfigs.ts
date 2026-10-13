import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchModConfig, fetchModConfigFiles, saveModConfig } from '../api/daemonApi';
import type { ConfigEntry, ConfigValue, SocketConnectionState } from '../types/daemon';
import { updateEntryValue } from '../utils/configEntries';

export interface ModConfigsState {
  files: string[];
  selectedFile: string;
  entries: ConfigEntry[];
  filter: string;
  setFilter: (filter: string) => void;
  selectFile: (filename: string) => void;
  updateEntry: (key: string, value: ConfigValue) => void;
  save: () => Promise<void>;
}

export function useModConfigs(
  connectionState: SocketConnectionState,
  onError: (error: unknown) => void
): ModConfigsState {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [filter, setFilter] = useState('');
  const latestRequestIdRef = useRef(0);

  const selectFile = useCallback(
    (filename: string) => {
      latestRequestIdRef.current += 1;
      const requestId = latestRequestIdRef.current;
      setSelectedFile(filename);
      fetchModConfig(filename)
        .then((loadedEntries) => {
          if (requestId === latestRequestIdRef.current) setEntries(loadedEntries);
        })
        .catch((error: unknown) => {
          if (requestId === latestRequestIdRef.current) onError(error);
        });
    },
    [onError]
  );

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchModConfigFiles()
      .then((loadedFiles) => {
        if (ignore) return;
        setFiles(loadedFiles);
        if (loadedFiles.length > 0) selectFile(loadedFiles[0]);
      })
      .catch((error: unknown) => {
        if (!ignore) onError(error);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, onError, selectFile]);

  const updateEntry = useCallback((key: string, value: ConfigValue) => {
    setEntries((previous) => updateEntryValue(previous, key, value));
  }, []);

  const save = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await saveModConfig(selectedFile, entries);
    } catch (error) {
      onError(error);
    }
  }, [selectedFile, entries, onError]);

  return { files, selectedFile, entries, filter, setFilter, selectFile, updateEntry, save };
}
