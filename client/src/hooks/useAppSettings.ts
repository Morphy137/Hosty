import { useCallback, useEffect, useState } from 'react';
import { fetchAppSettings, updateAppSettings, type AppSettings, type AppSettingsResponse } from '../api/daemonApi';
import type { SocketConnectionState } from '../types/daemon';

export interface AppSettingsState {
  data: AppSettingsResponse | null;
  /** Saves a change and returns the stored settings; throws the daemon error so the caller can show it. */
  save: (patch: Partial<AppSettings>) => Promise<AppSettings>;
}

/** Daemon-side app settings, loaded whenever the daemon connection opens. */
export function useAppSettings(connectionState: SocketConnectionState): AppSettingsState {
  const [data, setData] = useState<AppSettingsResponse | null>(null);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchAppSettings()
      .then((response) => {
        if (!ignore) setData(response);
      })
      .catch(() => {
        // An older daemon without the endpoint: the section stays unavailable.
      });
    return () => {
      ignore = true;
    };
  }, [connectionState]);

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    const response = await updateAppSettings(patch);
    setData(response);
    return response.settings;
  }, []);

  return { data, save };
}
