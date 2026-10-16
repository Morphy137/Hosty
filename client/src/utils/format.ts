const MAX_PERCENT = 100;
const INDEX_PAD_LENGTH = 2;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

export function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(MAX_PERCENT, value);
}

export function calculateRamPercent(ramMb: number, maxRamMb: number): number {
  if (maxRamMb <= 0) return 0;
  return clampPercent(Math.round((ramMb / maxRamMb) * MAX_PERCENT));
}

/** Formats a zero-based row index as a 1-based, zero-padded label ("01", "02", ...). */
export function formatRowIndex(zeroBasedIndex: number): string {
  return String(zeroBasedIndex + 1).padStart(INDEX_PAD_LENGTH, '0');
}

/** Formats an uptime in seconds as a compact "1d 2h 3m 4s" string. */
export function formatUptime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const days = Math.floor(safeSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((safeSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((safeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = safeSeconds % SECONDS_PER_MINUTE;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

const BYTES_PER_KB = 1024;

/** File size for the UI: `820 B`, `11 KB`, `1.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  const kilobytes = bytes / BYTES_PER_KB;
  if (kilobytes < BYTES_PER_KB) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / BYTES_PER_KB).toFixed(1)} MB`;
}
