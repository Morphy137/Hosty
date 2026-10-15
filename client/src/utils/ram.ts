const MB_PER_GB = 1024;
const MIN_MAX_RAM_MB = 1024;
const MIN_XMS_MB = 512;
const MAX_XMS_MB = 2048;
const OS_RESERVED_MB = 2048;
const FALLBACK_SYSTEM_RAM_MB = 8192;

/** Largest allocation we allow: leave some memory for the OS and the manager itself. */
export function maxAllocatableRamMb(totalMemMb: number | undefined): number {
  const total = totalMemMb && totalMemMb > 0 ? totalMemMb : FALLBACK_SYSTEM_RAM_MB;
  return Math.max(MIN_MAX_RAM_MB, Math.floor((total - OS_RESERVED_MB) / 256) * 256);
}

/** Suggested -Xmx: half of the system RAM, between 2 GB and 8 GB, never above the allocatable limit. */
export function recommendedRamMb(totalMemMb: number | undefined): number {
  const total = totalMemMb && totalMemMb > 0 ? totalMemMb : FALLBACK_SYSTEM_RAM_MB;
  const half = Math.floor(total / 2 / 256) * 256;
  const clamped = Math.min(8 * MB_PER_GB, Math.max(2 * MB_PER_GB, half));
  return Math.min(clamped, maxAllocatableRamMb(totalMemMb));
}

/**
 * Reasonable -Xms for a given -Xmx: a quarter of the maximum, between 512 MB and 2 GB.
 * Reserving the whole heap up front (or a fixed 1 GB on every machine) wastes memory on small
 * hosts and starves the garbage collector on large ones.
 */
export function defaultMinRamMb(maxRamMb: number): number {
  const quarter = Math.round(maxRamMb / 4 / 256) * 256;
  return Math.min(maxRamMb, Math.min(MAX_XMS_MB, Math.max(MIN_XMS_MB, quarter)));
}
