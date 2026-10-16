import type { GameDriverSummary, InstanceInfo } from '../types/daemon';

const DEFAULT_PORT_STRIDE = 1;

/**
 * First port from `base` (in steps of `stride`) whose range `[port, port + stride)` does not overlap another
 * server's range. Games that listen on consecutive ports declare `portStride` (mirrors the daemon's allocation).
 */
export function nextFreePort(
  base: number,
  stride: number | undefined,
  instances: InstanceInfo[],
  games: GameDriverSummary[]
): number {
  const step = stride ?? DEFAULT_PORT_STRIDE;
  const used = new Set<number>();
  for (const instance of instances) {
    const instanceStride = games.find((game) => game.id === instance.gameId)?.portStride ?? DEFAULT_PORT_STRIDE;
    for (let offset = 0; offset < instanceStride; offset += 1) used.add(instance.port + offset);
  }
  const overlaps = (port: number) => Array.from({ length: step }, (_, offset) => port + offset).some((p) => used.has(p));
  let candidate = base;
  while (overlaps(candidate)) candidate += step;
  return candidate;
}
