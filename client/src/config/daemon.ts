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

let activeDaemonHttpUrl = resolveDaemonHttpUrl(import.meta.env.VITE_DAEMON_URL);

/** Current daemon base URL. Updated at startup when the desktop shell picks the sidecar port. */
export const getDaemonHttpUrl = (): string => activeDaemonHttpUrl;
export const getDaemonWsUrl = (): string => toWebSocketUrl(activeDaemonHttpUrl);

export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Resolves the daemon URL at runtime. Inside the desktop shell the Rust side owns the sidecar
 * and its port; in browser/dev mode `VITE_DAEMON_URL` (or the default) is used.
 */
export async function resolveRuntimeDaemonUrl(): Promise<string> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    activeDaemonHttpUrl = resolveDaemonHttpUrl(await invoke<string>('get_daemon_url'));
  }
  return activeDaemonHttpUrl;
}

/** Opens the folder holding the sidecar log (desktop shell only). */
export async function openDaemonLogs(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_daemon_logs');
}
