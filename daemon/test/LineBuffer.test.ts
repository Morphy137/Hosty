import { describe, it, expect } from 'vitest';
import { LineBuffer } from '../src/core/LineBuffer';

describe('LineBuffer', () => {
  it('buffers split chunks until a newline arrives', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('Hello ')).toEqual([]);
    expect(buffer.push('World\n')).toEqual(['Hello World']);
  });

  it('handles multiple lines in a single chunk', () => {
    const buffer = new LineBuffer();
    const lines = buffer.push('Line 1\nLine 2\r\nLine 3\n');
    expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
  });

  it('flushes pending text at end of stream', () => {
    const buffer = new LineBuffer();
    buffer.push('Incomplete line');
    expect(buffer.flush()).toEqual(['Incomplete line']);
    expect(buffer.flush()).toEqual([]);
  });
});
