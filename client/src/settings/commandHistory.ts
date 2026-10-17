const HISTORY_STORAGE_KEY = 'hosty.commandHistory';

type HistoryMap = Record<string, string[]>;

function readAll(): HistoryMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      ])
    );
  } catch {
    return {};
  }
}

/** Console commands sent to one server, oldest first. */
export function loadCommandHistory(instanceId: string): string[] {
  return readAll()[instanceId] ?? [];
}

export function saveCommandHistory(instanceId: string, history: string[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ ...readAll(), [instanceId]: history }));
  } catch {
    // Storage unavailable: history lasts for this session only.
  }
}

export function clearAllCommandHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
