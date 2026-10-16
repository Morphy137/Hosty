import { describe, expect, it } from 'vitest';
import { flattenMotdLines, motdSegments } from '../src/utils/motd';

describe('motd helpers', () => {
  it('turns literal and real line breaks into spaces', () => {
    expect(flattenMotdLines('Top\n§8Bottom')).toBe('Top §8Bottom');
    expect(flattenMotdLines('A\r\nB')).toBe('A B');
  });

  it('styles formatting codes only when the game enables them', () => {
    const styled = motdSegments('§6Hi §lthere', true);
    expect(styled.map((segment) => segment.text)).toEqual(['Hi ', 'there']);
    expect(styled[1].bold).toBe(true);
    expect(motdSegments('§6Hi', false)).toHaveLength(1);
    expect(motdSegments('', true)).toEqual([]);
  });
});
