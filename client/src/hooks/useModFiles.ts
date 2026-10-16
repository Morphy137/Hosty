import { useCallback, useEffect, useState } from 'react';
import {
  fetchModFiles,
  toggleModFile as apiToggleModFile,
  deleteModFile as apiDeleteModFile
} from '../api/daemonApi';
import type { ModFileInfo, SocketConnectionState } from '../types/daemon';

export interface ModFilesState {
  files: ModFileInfo[];
  filter: string;
  setFilter: (filter: string) => void;
  isLoading: boolean;
  toggleMod: (filename: string) => Promise<void>;
  deleteMod: (filename: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useModFiles(
  connectionState: SocketConnectionState,
  activeInstanceId: string,
  onError: (error: unknown) => void,
  /** Changes whenever files are added outside the Mods tab (e.g. bridge install), so the list refetches. */
  refreshKey: string | number = ''
): ModFilesState {
  const [files, setFiles] = useState<ModFileInfo[]>([]);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchModFiles();
      setFiles(data);
    } catch (err) {
      onError(err);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchModFiles()
      .then((data) => {
        if (!ignore) setFiles(data);
      })
      .catch((err) => {
        if (!ignore) onError(err);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, activeInstanceId, onError, refreshKey]);

  const toggleMod = useCallback(
    async (filename: string) => {
      try {
        await apiToggleModFile(filename);
        await refresh();
      } catch (err) {
        onError(err);
      }
    },
    [onError, refresh]
  );

  const deleteMod = useCallback(
    async (filename: string) => {
      try {
        await apiDeleteModFile(filename);
        await refresh();
      } catch (err) {
        onError(err);
      }
    },
    [onError, refresh]
  );

  return { files, filter, setFilter, isLoading, toggleMod, deleteMod, refresh };
}
