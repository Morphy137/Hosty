import { useCallback, useEffect, useState } from 'react';
import { getDaemonToken, resolveRuntimeDaemonUrl } from '../config/daemon';

export const BOOTSTRAP_MAX_ATTEMPTS = 40;
export const BOOTSTRAP_RETRY_DELAY_MS = 500;

export type DaemonBootstrapState =
  | { phase: 'starting'; attempt: number }
  | { phase: 'ready' }
  | { phase: 'failed'; reason: string };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitForHealth(
  baseUrl: string,
  onAttempt: (attempt: number) => void,
  isCancelled: () => boolean
): Promise<void> {
  let lastReason = 'Daemon did not respond';
  for (let attempt = 1; attempt <= BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    if (isCancelled()) return;
    onAttempt(attempt);
    try {
      const token = getDaemonToken();
      const response = await fetch(`${baseUrl}/api/health`, token ? { headers: { 'x-hosty-token': token } } : undefined);
      if (response.ok) return;
      lastReason = `Health check returned HTTP ${response.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    await delay(BOOTSTRAP_RETRY_DELAY_MS);
  }
  throw new Error(lastReason);
}

/**
 * Resolves the daemon URL (the desktop shell chooses the sidecar port at runtime) and waits
 * until the daemon answers its health check before the rest of the app mounts.
 */
export function useDaemonBootstrap(): { state: DaemonBootstrapState; retry: () => void } {
  const [state, setState] = useState<DaemonBootstrapState>({ phase: 'starting', attempt: 1 });
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const baseUrl = await resolveRuntimeDaemonUrl();
        await waitForHealth(
          baseUrl,
          (attempt) => {
            if (!cancelled) setState({ phase: 'starting', attempt });
          },
          () => cancelled
        );
        if (!cancelled) setState({ phase: 'ready' });
      } catch (error) {
        if (!cancelled) {
          setState({ phase: 'failed', reason: error instanceof Error ? error.message : String(error) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const retry = useCallback(() => {
    setState({ phase: 'starting', attempt: 1 });
    setRunId((value) => value + 1);
  }, []);
  return { state, retry };
}
