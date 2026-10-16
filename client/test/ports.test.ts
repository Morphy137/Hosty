import { describe, expect, it } from 'vitest';
import type { GameDriverSummary, InstanceInfo } from '../src/types/daemon';
import { nextFreePort } from '../src/utils/ports';

const games = [
  { id: 'minecraft', portStride: undefined },
  { id: 'project-zomboid', portStride: 2 }
] as unknown as GameDriverSummary[];
const server = (gameId: string, port: number) => ({ id: `${gameId}-${port}`, gameId, port }) as InstanceInfo;

describe('nextFreePort', () => {
  it('steps by one for single-port games', () => {
    expect(nextFreePort(25565, undefined, [server('minecraft', 25565)], games)).toBe(25566);
  });

  it('keeps multi-port games from overlapping each other', () => {
    // Project Zomboid also listens on port + 1, so the next server cannot use 16262.
    expect(nextFreePort(16261, 2, [server('project-zomboid', 16261)], games)).toBe(16263);
    expect(nextFreePort(16261, 2, [server('minecraft', 16262)], games)).toBe(16263);
  });
});
