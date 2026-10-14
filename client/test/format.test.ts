import { describe, it, expect } from 'vitest';
import {
  clampPercent,
  calculateRamPercent,
  formatRowIndex,
  formatUptime,
  formatDimensionName,
  normalizeDimension
} from '../src/utils/format';

describe('Format utilities', () => {
  it('clamps percentages within 0 and 100', () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(45)).toBe(45);
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(NaN)).toBe(0);
  });

  it('calculates RAM usage percentage', () => {
    expect(calculateRamPercent(2048, 4096)).toBe(50);
    expect(calculateRamPercent(0, 4096)).toBe(0);
    expect(calculateRamPercent(4096, 4096)).toBe(100);
    expect(calculateRamPercent(1000, 0)).toBe(0);
  });

  it('formats 0-based indices as zero-padded labels', () => {
    expect(formatRowIndex(0)).toBe('01');
    expect(formatRowIndex(9)).toBe('10');
    expect(formatRowIndex(41)).toBe('42');
  });

  it('formats uptime correctly', () => {
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(125)).toBe('2m 5s');
    expect(formatUptime(3665)).toBe('1h 1m 5s');
    expect(formatUptime(90061)).toBe('1d 1h 1m 1s');
  });

  it('normalizes dimension strings', () => {
    expect(normalizeDimension('minecraft:overworld')).toBe('overworld');
    expect(normalizeDimension('overworld')).toBe('overworld');
    expect(normalizeDimension('minecraft:the_nether')).toBe('the_nether');
    expect(normalizeDimension('nether')).toBe('the_nether');
    expect(normalizeDimension('minecraft:the_end')).toBe('the_end');
    expect(normalizeDimension('twilightforest:twilight_forest')).toBe('twilightforest:twilight_forest');
  });

  it('formats dimension names', () => {
    const mockT = (key: string) => key;
    expect(formatDimensionName('minecraft:overworld', mockT)).toBe('overview.players.dimension.overworld');
    expect(formatDimensionName('twilightforest:twilight_forest', mockT)).toBe('The Twilight Forest');
    expect(formatDimensionName('custom_mod:deep_caverns', mockT)).toBe('Deep Caverns');
  });
});
