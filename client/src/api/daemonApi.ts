import { DAEMON_HTTP_URL } from '../config/daemon';
import type {
  ConfigEntry,
  ConfigPayload,
  DaemonErrorPayload,
  HealthResponse,
  InstanceInfo,
  InstancesResponse,
  ModFileInfo,
  ServerLoader,
  InstanceSettings
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
    response = await fetch(`${DAEMON_HTTP_URL}${path}`, init);
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

export function getInstanceIconUrl(id: string): string {
  return `${DAEMON_HTTP_URL}/api/instances/${encodeURIComponent(id)}/icon`;
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

// Provisioning
export function fetchLoaderVersions(loader: ServerLoader): Promise<string[]> {
  return request<string[]>(`/api/provisioning/versions/${encodeURIComponent(loader)}`);
}

export async function installServer(
  loader: ServerLoader,
  version: string,
  instanceId?: string,
  instanceName?: string,
  settings?: Partial<InstanceSettings>
): Promise<void> {
  await postJson<unknown>('/api/provisioning/install', {
    loader,
    version,
    instanceId,
    instanceName,
    settings
  });
}

export async function uploadServerJar(
  file: File,
  instanceId: string,
  instanceName?: string
): Promise<{ ok: boolean; instanceId: string }> {
  const query = new URLSearchParams({ instanceId });
  if (instanceName) query.set('name', instanceName);

  return request<{ ok: boolean; instanceId: string }>(
    `/api/instances/upload-server-jar?${query.toString()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file
    }
  );
}
