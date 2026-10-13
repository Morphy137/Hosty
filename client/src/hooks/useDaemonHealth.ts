import { useEffect, useState } from 'react';
import { fetchHealth } from '../api/daemonApi';
import type { HealthResponse, SocketConnectionState } from '../types/daemon';

/** Fetches daemon health (feature flags) whenever the socket (re)connects. */
export function useDaemonHealth(connectionState: SocketConnectionState): HealthResponse | null {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchHealth()
      .then((response) => {
        if (!ignore) setHealth(response);
      })
      .catch(() => {
        // Health is advisory; a failure keeps optional features hidden.
        if (!ignore) setHealth(null);
      });
    return () => {
      ignore = true;
    };
  }, [connectionState]);

  return health;
}
