import { useCallback, useEffect, useState } from 'react';
import {
  fetchInstances,
  selectInstance as apiSelectInstance,
  createInstance as apiCreateInstance,
  importInstance as apiImportInstance
} from '../api/daemonApi';
import type { InstanceInfo, SocketConnectionState } from '../types/daemon';

export interface InstancesState {
  instances: InstanceInfo[];
  activeId: string;
  activeInstance: InstanceInfo | null;
  isLoading: boolean;
  selectInstance: (id: string) => Promise<void>;
  createInstance: (id: string, name?: string) => Promise<InstanceInfo>;
  importInstance: (folderPath: string, name?: string) => Promise<InstanceInfo>;
  refresh: () => Promise<void>;
}

export function useInstances(
  connectionState: SocketConnectionState,
  onError: (error: unknown) => void
): InstancesState {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [activeId, setActiveId] = useState<string>('default');
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchInstances();
      setInstances(res.instances);
      setActiveId(res.activeId);
    } catch (err) {
      onError(err);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchInstances()
      .then((res) => {
        if (!ignore) {
          setInstances(res.instances);
          setActiveId(res.activeId);
        }
      })
      .catch((err) => {
        if (!ignore) onError(err);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, onError]);

  const selectInstance = useCallback(
    async (id: string) => {
      try {
        await apiSelectInstance(id);
        setActiveId(id);
        await refresh();
      } catch (err) {
        onError(err);
        throw err;
      }
    },
    [onError, refresh]
  );

  const createInstance = useCallback(
    async (id: string, name?: string): Promise<InstanceInfo> => {
      try {
        const res = await apiCreateInstance(id, name);
        await refresh();
        return res.instance;
      } catch (err) {
        onError(err);
        throw err;
      }
    },
    [onError, refresh]
  );

  const importInstance = useCallback(
    async (folderPath: string, name?: string): Promise<InstanceInfo> => {
      try {
        const res = await apiImportInstance(folderPath, name);
        await refresh();
        return res.instance;
      } catch (err) {
        onError(err);
        throw err;
      }
    },
    [onError, refresh]
  );

  const activeInstance = instances.find((inst) => inst.id === activeId) ?? null;

  return {
    instances,
    activeId,
    activeInstance,
    isLoading,
    selectInstance,
    createInstance,
    importInstance,
    refresh
  };
}
