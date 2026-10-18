import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchModConfig, fetchModConfigFiles, saveModConfig, saveModConfigText } from '../api/daemonApi';
import type { ConfigEntry, ConfigValue, ModConfigFormat, SocketConnectionState } from '../types/daemon';
import { updateEntryValue } from '../utils/configEntries';

export type ModConfigEditorMode = 'form' | 'text';

export interface ModConfigsState {
  /** Config files as `/` paths from the config folder (`sodium/options.json`). */
  files: string[];
  selectedFile: string;
  format: ModConfigFormat;
  /** `form` (key/value rows) is only available for toml/json; every other file is edited as text. */
  editorMode: ModConfigEditorMode;
  setEditorMode: (mode: ModConfigEditorMode) => void;
  entries: ConfigEntry[];
  content: string;
  setContent: (content: string) => void;
  filter: string;
  setFilter: (filter: string) => void;
  fileFilter: string;
  setFileFilter: (filter: string) => void;
  selectFile: (filePath: string) => void;
  updateEntry: (key: string, value: ConfigValue) => void;
  save: () => Promise<void>;
}

export function useModConfigs(
  connectionState: SocketConnectionState,
  onError: (error: unknown) => void,
  /** Changes when the viewed server or its installed add-ons change, so the list refetches. */
  refreshKey: string | number = ''
): ModConfigsState {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [format, setFormat] = useState<ModConfigFormat>('text');
  const [preferredMode, setPreferredMode] = useState<ModConfigEditorMode>('form');
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [content, setContent] = useState('');
  const [filter, setFilter] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const latestRequestIdRef = useRef(0);

  const editorMode: ModConfigEditorMode = format === 'text' ? 'text' : preferredMode;

  const loadFile = useCallback(
    (filePath: string) => {
      latestRequestIdRef.current += 1;
      const requestId = latestRequestIdRef.current;
      setSelectedFile(filePath);
      return fetchModConfig(filePath)
        .then((file) => {
          if (requestId !== latestRequestIdRef.current) return;
          setFormat(file.format);
          setEntries(file.entries);
          setContent(file.content);
        })
        .catch((error: unknown) => {
          if (requestId === latestRequestIdRef.current) onError(error);
        });
    },
    [onError]
  );

  const selectFile = useCallback(
    (filePath: string) => {
      setPreferredMode('form');
      void loadFile(filePath);
    },
    [loadFile]
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
  }, [connectionState, onError, selectFile, refreshKey]);

  /** Switching views reloads the file, so both views always start from what is on disk. */
  const setEditorMode = useCallback(
    (mode: ModConfigEditorMode) => {
      setPreferredMode(mode);
      if (selectedFile) void loadFile(selectedFile);
    },
    [loadFile, selectedFile]
  );

  const updateEntry = useCallback((key: string, value: ConfigValue) => {
    setEntries((previous) => updateEntryValue(previous, key, value));
  }, []);

  const save = useCallback(async () => {
    if (!selectedFile) return;
    try {
      if (editorMode === 'text') {
        await saveModConfigText(selectedFile, content);
        await loadFile(selectedFile);
      } else {
        await saveModConfig(selectedFile, entries);
      }
    } catch (error) {
      onError(error);
    }
  }, [selectedFile, editorMode, content, entries, loadFile, onError]);

  return {
    files,
    selectedFile,
    format,
    editorMode,
    setEditorMode,
    entries,
    content,
    setContent,
    filter,
    setFilter,
    fileFilter,
    setFileFilter,
    selectFile,
    updateEntry,
    save
  };
}
