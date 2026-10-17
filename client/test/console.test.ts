import { describe, expect, it } from 'vitest';
import {
  CONSOLE_COLOR_CLASSES,
  CONSOLE_LINE_CLASSES,
  compileHighlightRules,
  getConsoleLineClass,
  isValidRulePattern,
  pushHistory,
  stripTimestamp
} from '../src/utils/console';
import { resolveQuickCommands } from '../src/utils/quickCommands';
import { daemonSocketReducer, INITIAL_DAEMON_SOCKET_STATE } from '../src/state/daemonSocketReducer';

describe('console line colours', () => {
  it('colours log levels and echoed commands by default', () => {
    expect(getConsoleLineClass('[12:00:00 WARN]: x')).toBe(CONSOLE_LINE_CLASSES.warning);
    expect(getConsoleLineClass('[12:00:00 ERROR]: x')).toBe(CONSOLE_LINE_CLASSES.error);
    expect(getConsoleLineClass('> list')).toBe(CONSOLE_LINE_CLASSES.command);
    expect(getConsoleLineClass('[12:00:00 INFO]: x')).toBe(CONSOLE_LINE_CLASSES.default);
  });

  it('can turn level highlighting off', () => {
    expect(getConsoleLineClass('WARN x', { highlightLevels: false, rules: [] })).toBe(CONSOLE_LINE_CLASSES.default);
  });

  it('applies user rules before levels, first match wins, case-insensitive unless asked', () => {
    const rules = compileHighlightRules([
      { id: 'a', pattern: 'joined the game', caseSensitive: false, color: 'cyan' },
      { id: 'b', pattern: 'WARN', caseSensitive: true, color: 'magenta' }
    ]);
    const options = { highlightLevels: true, rules };
    expect(getConsoleLineClass('Steve JOINED the game', options)).toBe(CONSOLE_COLOR_CLASSES.cyan);
    expect(getConsoleLineClass('[WARN] disk', options)).toBe(CONSOLE_COLOR_CLASSES.magenta);
    expect(getConsoleLineClass('[warn] disk', options)).toBe(CONSOLE_LINE_CLASSES.default);
  });

  it('skips invalid or oversized patterns instead of throwing', () => {
    expect(isValidRulePattern('(unclosed')).toBe(false);
    expect(isValidRulePattern('a'.repeat(500))).toBe(false);
    expect(isValidRulePattern('')).toBe(false);
    expect(compileHighlightRules([{ id: 'x', pattern: '[', caseSensitive: false, color: 'red' }])).toEqual([]);
  });
});

describe('stripTimestamp', () => {
  it.each([
    ['[12:34:56 INFO]: Done', '[INFO]: Done'],
    ['[12:34:56] [Server thread/INFO]: Done', '[Server thread/INFO]: Done'],
    ['2026-10-16 12:34:56,123 INFO Done', 'INFO Done'],
    ['[2026-10-16T12:34:56.123] Done', 'Done'],
    ['> say 12:00:00 is noon', '> say 12:00:00 is noon'],
    ['plain line', 'plain line']
  ])('%s -> %s', (line, expected) => {
    expect(stripTimestamp(line)).toBe(expected);
  });
});

describe('command history', () => {
  it('appends, skips consecutive duplicates and caps the size', () => {
    expect(pushHistory(['a'], 'a', 10)).toEqual(['a']);
    expect(pushHistory(['a', 'b'], 'a', 10)).toEqual(['a', 'b', 'a']);
    expect(pushHistory(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
    expect(pushHistory(['a'], 'b', 0)).toEqual([]);
  });
});

describe('quick commands', () => {
  const game = [
    { label: 'List', command: 'list' },
    { label: 'Save', command: 'save-all' }
  ];

  it('hides the game commands the user turned off and appends custom ones', () => {
    expect(resolveQuickCommands(game, undefined)).toEqual(game);
    expect(resolveQuickCommands(game, { hidden: ['list'], custom: [{ label: 'Day', command: 'time set day' }] })).toEqual([
      { label: 'Save', command: 'save-all' },
      { label: 'Day', command: 'time set day' }
    ]);
  });
});

describe('console buffer in the socket reducer', () => {
  const withLines = (count: number) => ({
    ...INITIAL_DAEMON_SOCKET_STATE,
    logs: Array.from({ length: count }, (_value, index) => `line ${index}`)
  });

  it('trims the existing lines when the limit shrinks and caps new ones', () => {
    let state = daemonSocketReducer(withLines(10), { kind: 'setConsoleLimit', limit: 4 });
    expect(state.logs).toEqual(['line 6', 'line 7', 'line 8', 'line 9']);
    state = daemonSocketReducer(state, { kind: 'message', message: { type: 'CONSOLE', payload: 'new' } });
    expect(state.logs).toEqual(['line 7', 'line 8', 'line 9', 'new']);
  });

  it('clears the console view', () => {
    expect(daemonSocketReducer(withLines(3), { kind: 'clearConsole' }).logs).toEqual([]);
  });
});
