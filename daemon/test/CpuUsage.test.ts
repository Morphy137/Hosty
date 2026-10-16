import { describe, expect, it } from 'vitest';
import { normalizeCpuPercent } from '../src/core/ProcessSupervisor';

describe('normalizeCpuPercent', () => {
  it('turns per-core percentages into a share of the whole machine', () => {
    expect(normalizeCpuPercent(931, 16)).toBe(58.2);
    expect(normalizeCpuPercent(100, 4)).toBe(25);
    expect(normalizeCpuPercent(0, 8)).toBe(0);
  });

  it('never leaves the 0-100 range', () => {
    expect(normalizeCpuPercent(2000, 8)).toBe(100);
    expect(normalizeCpuPercent(-5, 8)).toBe(0);
  });

  it('uses the machine core count by default and survives a bogus count', () => {
    expect(normalizeCpuPercent(50, 0)).toBe(50);
    expect(normalizeCpuPercent(50)).toBeLessThanOrEqual(50);
  });
});
