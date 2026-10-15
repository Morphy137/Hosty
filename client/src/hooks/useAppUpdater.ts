import { useState, useEffect, useCallback } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdateCheckResult =
  | { status: 'available'; version: string }
  | { status: 'up_to_date' }
  | { status: 'error'; message: string };

export interface AppUpdaterState {
  isChecking: boolean;
  updateAvailable: boolean;
  updateVersion: string | null;
  updateNotes: string | null;
  isDownloading: boolean;
  downloadProgress: number; // 0 to 100
  downloadComplete: boolean;
  error: string | null;
  /** Resolves with the outcome so a manual check can tell the user what happened. */
  checkForUpdates: () => Promise<UpdateCheckResult>;
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

  const checkForUpdates = useCallback(async (): Promise<UpdateCheckResult> => {
    if (!isTauri) return { status: 'up_to_date' };
    setIsChecking(true);
    setError(null);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setAvailableUpdate(update);
        setUpdateVersion(update.version);
        setUpdateNotes(update.body ?? null);
        return { status: 'available', version: update.version };
      }
      setAvailableUpdate(null);
      setUpdateVersion(null);
      return { status: 'up_to_date' };
    } catch (err: unknown) {
      // Offline, or the release feed is not reachable (e.g. a private repository).
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { status: 'error', message: msg };
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
