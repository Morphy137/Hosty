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

const KNOWN_DIMENSIONS: Record<string, string> = {
  overworld: 'overview.players.dimension.overworld',
  'minecraft:overworld': 'overview.players.dimension.overworld',
  the_nether: 'overview.players.dimension.the_nether',
  nether: 'overview.players.dimension.the_nether',
  'minecraft:the_nether': 'overview.players.dimension.the_nether',
  the_end: 'overview.players.dimension.the_end',
  end: 'overview.players.dimension.the_end',
  'minecraft:the_end': 'overview.players.dimension.the_end'
};

const KNOWN_MOD_DIMENSION_NAMES: Record<string, string> = {
  'twilightforest:twilight_forest': 'The Twilight Forest',
  'aether:the_aether': 'The Aether',
  'deeperdarker:otherside': 'The Otherside',
  'undergarden:undergarden': 'The Undergarden',
  'the_undergarden:undergarden': 'The Undergarden',
  'blue_skies:everdawn': 'Everdawn',
  'blue_skies:everbright': 'Everbright'
};

/** Formats vanilla and modded dimension identifiers into human-friendly translated names. */
export function formatDimensionName(
  dimension: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!dimension) return t('overview.players.dimension.overworld');
  const norm = dimension.toLowerCase().trim();

  const knownKey = KNOWN_DIMENSIONS[norm];
  if (knownKey) {
    return t(knownKey);
  }

  const knownMod = KNOWN_MOD_DIMENSION_NAMES[norm];
  if (knownMod) {
    return knownMod;
  }

  if (norm.includes(':')) {
    const parts = norm.split(':');
    const path = parts[1] || '';
    const formatted = path
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return formatted || norm;
  }

  return norm.charAt(0).toUpperCase() + norm.slice(1);
}

