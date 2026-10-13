export const DEFAULT_DAEMON_HTTP_URL = 'http://localhost:4000';

const TRAILING_SLASHES_PATTERN = /\/+$/;
const HTTP_SCHEME_PATTERN = /^http(s?):\/\//i;

/** Normalizes the configured daemon URL, falling back to the local default. */
export function resolveDaemonHttpUrl(configuredUrl: string | undefined): string {
  const trimmedUrl = configuredUrl?.trim();
  if (!trimmedUrl) return DEFAULT_DAEMON_HTTP_URL;
  return trimmedUrl.replace(TRAILING_SLASHES_PATTERN, '');
}

/** Derives the WebSocket URL from an HTTP(S) URL (http -> ws, https -> wss). */
export function toWebSocketUrl(httpUrl: string): string {
  return httpUrl.replace(HTTP_SCHEME_PATTERN, (_match, secureSuffix: string) => `ws${secureSuffix.toLowerCase()}://`);
}

export const DAEMON_HTTP_URL = resolveDaemonHttpUrl(import.meta.env.VITE_DAEMON_URL);
export const DAEMON_WS_URL = toWebSocketUrl(DAEMON_HTTP_URL);
