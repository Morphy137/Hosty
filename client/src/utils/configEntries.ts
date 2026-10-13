import type { ConfigEntry, ConfigPayload, ConfigValue } from '../types/daemon';

export function toConfigPayload(entries: ConfigEntry[]): ConfigPayload {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}

export function updateEntryValue(entries: ConfigEntry[], key: string, value: ConfigValue): ConfigEntry[] {
  return entries.map((entry) => (entry.key === key ? { ...entry, value } : entry));
}

export function filterEntriesByKey(entries: ConfigEntry[], filter: string): ConfigEntry[] {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) return entries;
  return entries.filter((entry) => entry.key.toLowerCase().includes(normalizedFilter));
}
