import { getDaemonHttpUrl, getDaemonToken, withDaemonToken } from '../config/daemon';
import type {
  ConfigEntry,
  ConfigPayload,
  DaemonErrorPayload,
  HealthResponse,
  InstanceInfo,
  InstancesResponse,
  ModFileInfo,
  ServerLoader,
  InstanceSettings,
  GameDriverSummary,
  JarInspection,
  FolderInspection,
  ConfigFileInfo,
  GamePackInfo,
  ProvisionJobState
} from '../types/daemon';
import { toConfigPayload } from '../utils/configEntries';

export const UNKNOWN_ERROR_CODE = 'UNKNOWN';
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
const NETWORK_ERROR_STATUS = 0;

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Typed error raised for any failed daemon REST call. */
export class DaemonApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'DaemonApiError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorPayload(body: unknown): DaemonErrorPayload | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message } = body.error;
  if (typeof code !== 'string') return null;
  return { code, message: typeof message === 'string' ? message : '' };
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Builds a DaemonApiError from a non-2xx response body `{ error: { code, message } }`. */
export async function parseErrorResponse(response: Response): Promise<DaemonApiError> {
  const body = parseJsonSafely(await response.text());
  const payload = extractErrorPayload(body);
  if (!payload) {
    return new DaemonApiError(UNKNOWN_ERROR_CODE, response.statusText, response.status);
  }
  return new DaemonApiError(payload.code, payload.message, response.status);
}

/** Normalizes any thrown value into a displayable `{ code, message }` payload. */
export function toErrorPayload(error: unknown): DaemonErrorPayload {
  if (error instanceof DaemonApiError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: UNKNOWN_ERROR_CODE, message: error.message };
  return { code: UNKNOWN_ERROR_CODE, message: String(error) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = getDaemonToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set('x-hosty-token', token);
    response = await fetch(`${getDaemonHttpUrl()}${path}`, { ...init, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DaemonApiError(NETWORK_ERROR_CODE, message, NETWORK_ERROR_STATUS);
  }

  if (!response.ok) throw await parseErrorResponse(response);

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

function deleteRequest<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

// Instances
export function fetchInstances(): Promise<InstancesResponse> {
  return request<InstancesResponse>('/api/instances');
}

export async function selectInstance(id: string): Promise<void> {
  await postJson<unknown>('/api/instances/select', { id });
}

export function createInstance(
  id: string,
  name?: string,
  settings?: Partial<InstanceSettings>
): Promise<{ ok: boolean; instance: InstanceInfo }> {
  return postJson<{ ok: boolean; instance: InstanceInfo }>('/api/instances/create', { id, name, settings });
}

export function fetchSupportedGames(): Promise<{ games: GameDriverSummary[] }> {
  return request<{ games: GameDriverSummary[] }>('/api/games');
}

/** Whether a TCP port is already bound on this machine. */
export async function isPortInUse(port: number): Promise<boolean> {
  const response = await request<{ port: number; inUse: boolean }>(`/api/system/ports/${port}`);
  return response.inUse;
}

/** Identifies the game and loader of an existing server folder. */
export function inspectFolder(folderPath: string): Promise<FolderInspection> {
  return postJson<FolderInspection>('/api/instances/inspect-folder', { path: folderPath });
}

// Generic config files (declared by the game's driver)
export function fetchConfigFiles(): Promise<ConfigFileInfo[]> {
  return request<ConfigFileInfo[]>('/api/config-files');
}

export function fetchConfigEntries(filePath: string): Promise<ConfigEntry[]> {
  return request<ConfigEntry[]>(`/api/config-files/entries?path=${encodeURIComponent(filePath)}`);
}

export async function saveConfigEntries(filePath: string, entries: ConfigEntry[]): Promise<void> {
  await postJson<unknown>(`/api/config-files/entries?path=${encodeURIComponent(filePath)}`, toConfigPayload(entries));
}

/** Starts the SteamCMD installation of a Steam-based game for an existing instance. */
export function provisionInstance(id: string): Promise<InstallStarted> {
  return postJson<InstallStarted>(`/api/instances/${encodeURIComponent(id)}/provision`, {});
}

// Game packs
export function fetchGamePacks(): Promise<{ gamesDir: string; packs: GamePackInfo[] }> {
  return request<{ gamesDir: string; packs: GamePackInfo[] }>('/api/game-packs');
}

export function reloadGamePacks(): Promise<{ gamesDir: string; packs: GamePackInfo[] }> {
  return postJson<{ gamesDir: string; packs: GamePackInfo[] }>('/api/game-packs/reload', {});
}

export function trustGamePack(packId: string): Promise<{ ok: boolean; packs: GamePackInfo[] }> {
  return postJson<{ ok: boolean; packs: GamePackInfo[] }>(`/api/game-packs/${encodeURIComponent(packId)}/trust`, {});
}

export function getGameLogoUrl(gameId: string): string {
  return withDaemonToken(`${getDaemonHttpUrl()}/api/games/${encodeURIComponent(gameId)}/logo`);
}

export function importInstance(folderPath: string, name?: string): Promise<{ ok: boolean; instance: InstanceInfo }> {
  return postJson<{ ok: boolean; instance: InstanceInfo }>('/api/instances/import', { path: folderPath, name });
}

export function fetchInstanceSettings(id: string): Promise<InstanceInfo> {
  return request<InstanceInfo>(`/api/instances/${encodeURIComponent(id)}/settings`);
}

export function updateInstanceSettings(
  id: string,
  settings: Partial<InstanceSettings>
): Promise<{ ok: boolean; instance: InstanceInfo }> {
  return postJson<{ ok: boolean; instance: InstanceInfo }>(
    `/api/instances/${encodeURIComponent(id)}/settings`,
    settings
  );
}

export function restartInstance(id: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/api/instances/${encodeURIComponent(id)}/restart`, {});
}

export function uploadInstanceIcon(id: string, imageBase64: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>(`/api/instances/${encodeURIComponent(id)}/icon`, { imageBase64 });
}

export function deleteInstanceIcon(id: string): Promise<{ ok: boolean }> {
  return deleteRequest<{ ok: boolean }>(`/api/instances/${encodeURIComponent(id)}/icon`);
}

export function installInstanceBridge(id: string): Promise<{ ok: boolean; serverRunning: boolean }> {
  return postJson<{ ok: boolean; serverRunning: boolean }>(`/api/instances/${encodeURIComponent(id)}/bridge/install`, {});
}

export function getInstanceIconUrl(id: string): string {
  return withDaemonToken(`${getDaemonHttpUrl()}/api/instances/${encodeURIComponent(id)}/icon`);
}

// Properties
export function fetchServerProperties(): Promise<ConfigEntry[]> {
  return request<ConfigEntry[]>('/api/properties');
}

export async function saveServerProperties(entries: ConfigEntry[]): Promise<void> {
  await postJson<unknown>('/api/properties', toConfigPayload(entries));
}

// Physical Mods .jar Files
export function fetchModFiles(): Promise<ModFileInfo[]> {
  return request<ModFileInfo[]>('/api/mods/files');
}

export function toggleModFile(filename: string): Promise<{ ok: boolean; file: ModFileInfo }> {
  return postJson<{ ok: boolean; file: ModFileInfo }>('/api/mods/files/toggle', { filename });
}

export async function deleteModFile(filename: string): Promise<void> {
  await deleteRequest<unknown>(`/api/mods/files/${encodeURIComponent(filename)}`);
}

// Mod Configurations (/config)
export function fetchModConfigFiles(): Promise<string[]> {
  return request<string[]>('/api/mods/configs');
}

export function fetchModConfig(filename: string): Promise<ConfigEntry[]> {
  return request<ConfigEntry[]>(`/api/mods/configs/${encodeURIComponent(filename)}`);
}

export async function saveModConfig(filename: string, entries: ConfigEntry[]): Promise<void> {
  const payload: ConfigPayload = toConfigPayload(entries);
  await postJson<unknown>(`/api/mods/configs/${encodeURIComponent(filename)}`, payload);
}

const FALLBACK_MC_VERSIONS = [
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.2',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.16.5'
];

// Provisioning
export async function fetchLoaderVersions(loader: ServerLoader): Promise<string[]> {
  try {
    const data = await request<string[]>(`/api/provisioning/versions/${encodeURIComponent(loader)}`);
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch {
    // Daemon offline or request failed; try direct upstream fetch
  }

  try {
    if (loader === 'fabric') {
      const res = await fetch('https://meta.fabricmc.net/v2/versions/game');
      if (res.ok) {
        const data = (await res.json()) as Array<{ version: string; stable: boolean }>;
        const stable = data.filter((v) => v.stable).map((v) => v.version);
        if (stable.length > 0) return stable;
      }
    } else if (loader === 'vanilla') {
      const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      if (res.ok) {
        const data = (await res.json()) as { versions: Array<{ id: string; type: string }> };
        const releases = data.versions.filter((v) => v.type === 'release').map((v) => v.id);
        if (releases.length > 0) return releases;
      }
    }
  } catch {
    // Direct upstream failed; fall back to static list
  }

  return [...FALLBACK_MC_VERSIONS];
}

export interface InstallStarted {
  jobId: string;
  instanceId: string;
}

/** Starts a background installation job; progress arrives over the socket and via `waitForProvisionJob`. */
export async function installServer(
  loader: ServerLoader,
  version: string,
  instanceId?: string,
  instanceName?: string,
  settings?: Partial<InstanceSettings>
): Promise<InstallStarted> {
  return postJson<InstallStarted>('/api/provisioning/install', {
    loader,
    version,
    instanceId,
    instanceName,
    settings
  });
}

export interface UploadResult {
  ok: boolean;
  instanceId: string;
  /** Present when the jar was an installer that now runs as a background job. */
  jobId: string | null;
  inspection: JarInspection;
}

export interface UploadOverrides {
  loader?: ServerLoader;
  loaderVersion?: string;
}

/** Uploads a server jar; settings are applied in the same request that creates the instance. */
export async function uploadServerJar(
  file: File,
  instanceId: string,
  instanceName?: string,
  settings?: Partial<InstanceSettings>,
  overrides?: UploadOverrides
): Promise<UploadResult> {
  const query = new URLSearchParams({ instanceId });
  if (instanceName) query.set('name', instanceName);
  if (settings) query.set('settings', JSON.stringify(settings));
  if (overrides?.loader) query.set('loader', overrides.loader);
  if (overrides?.loaderVersion) query.set('loaderVersion', overrides.loaderVersion);

  return request<UploadResult>(`/api/instances/upload-server-jar?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file
  });
}

/** Asks the daemon to identify a jar (loader, Minecraft version, installer vs server). */
export async function inspectServerJar(file: File): Promise<JarInspection> {
  return request<JarInspection>('/api/provisioning/inspect-jar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file
  });
}

export function fetchProvisionJob(jobId: string): Promise<ProvisionJobState> {
  return request<ProvisionJobState>(`/api/provisioning/jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelProvisionJob(jobId: string): Promise<void> {
  await postJson<unknown>(`/api/provisioning/jobs/${encodeURIComponent(jobId)}/cancel`, {});
}

const JOB_POLL_INTERVAL_MS = 500;

/** Resolves when the job succeeds; rejects with the job error (or a cancellation error) otherwise. */
export async function waitForProvisionJob(
  jobId: string,
  onUpdate?: (job: ProvisionJobState) => void
): Promise<ProvisionJobState> {
  for (;;) {
    const job = await fetchProvisionJob(jobId);
    onUpdate?.(job);
    if (job.status === 'done') return job;
    if (job.status === 'cancelled') {
      throw new DaemonApiError('INSTALL_CANCELLED', 'Installation cancelled.', 409);
    }
    if (job.status === 'failed') {
      throw new DaemonApiError(job.error?.code ?? UNKNOWN_ERROR_CODE, job.error?.message ?? 'Installation failed', 500);
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
  }
}

export async function fetchSystemEnvironment(): Promise<import('../types/daemon').SystemEnvironmentResponse> {
  return request<import('../types/daemon').SystemEnvironmentResponse>('/api/system/environment');
}
