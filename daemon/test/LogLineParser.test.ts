import { describe, it, expect } from 'vitest';
import {
  isServerReadyLine,
  parsePlayerJoin,
  parsePlayerLeave,
  parsePositionResponse,
  parseDimensionResponse,
  normalizeDimension
} from '../src/extensions/minecraft/LogLineParser';

describe('LogLineParser', () => {
  it('detects server ready signal', () => {
    expect(isServerReadyLine('[Server thread/INFO]: Done (4.120s)! For help, type "help"')).toBe(true);
    expect(isServerReadyLine('[Server thread/INFO]: Starting minecraft server version 1.21')).toBe(false);
  });

  it('parses player join event with dimension and coordinates', () => {
    const line = '[Server thread/INFO]: MorphyCD[/127.0.0.1:54321] logged in with entity id 12 at ([world]-245.5, 68.0, 1120.25)';
    const result = parsePlayerJoin(line);
    expect(result).toEqual({
      username: 'MorphyCD',
      dimension: 'overworld',
      x: -245,
      y: 68,
      z: 1120
    });
  });

  it('parses player join without dimension bracket fallback to overworld', () => {
    const line = '[Server thread/INFO]: Steve[/127.0.0.1:12345] logged in with entity id 42 at (10.0, 64.0, -15.0)';
    const result = parsePlayerJoin(line);
    expect(result).toEqual({
      username: 'Steve',
      dimension: 'overworld',
      x: 10,
      y: 64,
      z: -15
    });
  });

  it('parses player leave event', () => {
    const line = '[Server thread/INFO]: MorphyCD left the game';
    expect(parsePlayerLeave(line)).toBe('MorphyCD');
    expect(parsePlayerLeave('[Server thread/INFO]: Random chat message')).toBeNull();
  });

  it('parses entity position response from query', () => {
    const line = '[Server thread/INFO]: MorphyCD has the following entity data: [120.4d, 72.0d, -450.8d]';
    expect(parsePositionResponse(line)).toEqual({
      username: 'MorphyCD',
      x: 120,
      y: 72,
      z: -451
    });
  });

  it('parses entity dimension response', () => {
    const line = '[Server thread/INFO]: MorphyCD has the following entity data: "minecraft:the_nether"';
    expect(parseDimensionResponse(line)).toEqual({
      username: 'MorphyCD',
      dimension: 'the_nether'
    });
  });

  it('normalizes dimension names', () => {
    expect(normalizeDimension('world')).toBe('overworld');
    expect(normalizeDimension('world_nether')).toBe('the_nether');
    expect(normalizeDimension('world_the_end')).toBe('the_end');
    expect(normalizeDimension('minecraft:the_nether')).toBe('the_nether');
    expect(normalizeDimension(undefined)).toBe('overworld');
  });
});
