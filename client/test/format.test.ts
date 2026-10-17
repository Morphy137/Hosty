import { describe, it, expect } from 'vitest';
import {
  clampPercent,
  calculateRamPercent,
  formatDecimal,
  formatRowIndex,
  formatUptime
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
});

describe('formatBytes', () => {
  it('uses bytes, kilobytes and megabytes', async () => {
    const { formatBytes } = await import('../src/utils/format');
    expect(formatBytes(820)).toBe('820 B');
    expect(formatBytes(11167)).toBe('11 KB');
    expect(formatBytes(544372)).toBe('532 KB');
    expect(formatBytes(1_468_006)).toBe('1.4 MB');
  });
});

describe('formatDecimal', () => {
  it('rounds to one decimal and drops a trailing zero', () => {
    expect(formatDecimal(62.22842788696289, 'en')).toBe('62.2');
    expect(formatDecimal(20, 'en')).toBe('20');
    expect(formatDecimal(10.54, 'es')).toBe('10,5');
  });

  it('keeps the decimal when asked for fixed width and never groups digits', () => {
    expect(formatDecimal(223, 'en', true)).toBe('223.0');
    expect(formatDecimal(-9025.123, 'en', true)).toBe('-9025.1');
    expect(formatDecimal(Number.NaN, 'en')).toBe('-');
  });
});
