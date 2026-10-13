import { useCallback, useEffect, useState } from 'react';
import { fetchLoaderVersions, installServer } from '../api/daemonApi';
import type { ServerLoader, SocketConnectionState } from '../types/daemon';

const DEFAULT_LOADER: ServerLoader = 'fabric';

export interface ProvisioningState {
  selectedLoader: ServerLoader;
  setSelectedLoader: (loader: ServerLoader) => void;
  availableVersions: string[];
  selectedVersion: string;
  setSelectedVersion: (version: string) => void;
  isInstalling: boolean;
  install: (onStart: (loader: ServerLoader, version: string) => void) => Promise<void>;
}

export function useProvisioning(
  connectionState: SocketConnectionState,
  onError: (error: unknown) => void
): ProvisioningState {
  const [selectedLoader, setSelectedLoader] = useState<ServerLoader>(DEFAULT_LOADER);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchLoaderVersions(selectedLoader)
      .then((versions) => {
        if (ignore) return;
        setAvailableVersions(versions);
        setSelectedVersion(versions[0] ?? '');
      })
      .catch((error: unknown) => {
        if (ignore) return;
        setAvailableVersions([]);
        setSelectedVersion('');
        onError(error);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, selectedLoader, onError]);

  const install = useCallback(
    async (onStart: (loader: ServerLoader, version: string) => void) => {
      if (!selectedVersion) return;
      setIsInstalling(true);
      onStart(selectedLoader, selectedVersion);
      try {
        await installServer(selectedLoader, selectedVersion);
      } catch (error) {
        onError(error);
      } finally {
        setIsInstalling(false);
      }
    },
    [selectedLoader, selectedVersion, onError]
  );

  return {
    selectedLoader,
    setSelectedLoader,
    availableVersions,
    selectedVersion,
    setSelectedVersion,
    isInstalling,
    install
  };
}
