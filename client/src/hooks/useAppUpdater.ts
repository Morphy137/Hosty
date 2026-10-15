import { useState, useEffect, useCallback } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';

export interface AppUpdaterState {
  isChecking: boolean;
  updateAvailable: boolean;
  updateVersion: string | null;
  updateNotes: string | null;
  isDownloading: boolean;
  downloadProgress: number; // 0 to 100
  downloadComplete: boolean;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

export function useAppUpdater(): AppUpdaterState {
  const [isChecking, setIsChecking] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateNotes, setUpdateNotes] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const checkForUpdates = useCallback(async () => {
    if (!isTauri) return;
    setIsChecking(true);
    setError(null);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setAvailableUpdate(update);
        setUpdateVersion(update.version);
        setUpdateNotes(update.body ?? null);
      } else {
        setAvailableUpdate(null);
        setUpdateVersion(null);
      }
    } catch (err: unknown) {
      // In private repos or offline mode, check() might fail; catch silently on auto-check
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsChecking(false);
    }
  }, [isTauri]);

  const installUpdate = useCallback(async () => {
    if (!availableUpdate) return;
    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      let downloadedBytes = 0;
      let totalBytes = 0;

      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data?.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === 'Progress' && event.data?.chunkLength) {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setDownloadProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === 'Finished') {
          setDownloadProgress(100);
        }
      });

      setDownloadComplete(true);
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsDownloading(false);
    }
  }, [availableUpdate]);

  const dismissUpdate = useCallback(() => {
    setAvailableUpdate(null);
    setUpdateVersion(null);
  }, []);

  // Automatic check on launch (3s after startup in production)
  useEffect(() => {
    if (!isTauri || import.meta.env.DEV) return;
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdates, isTauri]);

  return {
    isChecking,
    updateAvailable: availableUpdate !== null,
    updateVersion,
    updateNotes,
    isDownloading,
    downloadProgress,
    downloadComplete,
    error,
    checkForUpdates,
    installUpdate,
    dismissUpdate
  };
}
