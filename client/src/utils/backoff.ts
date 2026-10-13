export interface BackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
}

export const RECONNECT_BACKOFF: BackoffOptions = {
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  factor: 2
};

/** Exponential backoff delay for the given zero-based attempt, capped at `maxDelayMs`. */
export function computeBackoffDelay(attempt: number, options: BackoffOptions = RECONNECT_BACKOFF): number {
  const safeAttempt = Math.max(0, attempt);
  return Math.min(options.maxDelayMs, options.baseDelayMs * options.factor ** safeAttempt);
}
