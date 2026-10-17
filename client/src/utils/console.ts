import type { ConsoleColor, HighlightRule } from '../settings/schema';

/** Console text colour for each palette entry of the terminal theme. */
export const CONSOLE_COLOR_CLASSES: Record<ConsoleColor, string> = {
  green: 'text-console-green',
  yellow: 'text-console-yellow',
  red: 'text-console-red',
  blue: 'text-console-blue',
  magenta: 'text-console-magenta',
  cyan: 'text-console-cyan',
  mute: 'text-console-mute'
};

export const CONSOLE_LINE_CLASSES = {
  warning: CONSOLE_COLOR_CLASSES.yellow,
  error: CONSOLE_COLOR_CLASSES.red,
  command: CONSOLE_COLOR_CLASSES.green,
  default: 'text-console-fg'
} as const;

const COMMAND_ECHO_PREFIX = '>';
/** Longest pattern accepted for a user rule (keeps pathological expressions out of the render loop). */
export const MAX_RULE_PATTERN_LENGTH = 200;

export interface CompiledHighlightRule {
  regex: RegExp;
  color: ConsoleColor;
}

export interface ConsoleHighlightOptions {
  highlightLevels: boolean;
  rules: CompiledHighlightRule[];
}

const DEFAULT_OPTIONS: ConsoleHighlightOptions = { highlightLevels: true, rules: [] };

export function isValidRulePattern(pattern: string): boolean {
  if (!pattern || pattern.length > MAX_RULE_PATTERN_LENGTH) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Compiles the user's rules once per change; invalid patterns are skipped instead of throwing. */
export function compileHighlightRules(rules: HighlightRule[]): CompiledHighlightRule[] {
  return rules
    .filter((rule) => isValidRulePattern(rule.pattern))
    .map((rule) => ({ regex: new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i'), color: rule.color }));
}

/** Picks the console text colour for a raw server output line: user rules first, then log levels. */
export function getConsoleLineClass(line: string, options: ConsoleHighlightOptions = DEFAULT_OPTIONS): string {
  const rule = options.rules.find((candidate) => candidate.regex.test(line));
  if (rule) return CONSOLE_COLOR_CLASSES[rule.color];
  if (!options.highlightLevels) return CONSOLE_LINE_CLASSES.default;
  if (line.includes('WARN')) return CONSOLE_LINE_CLASSES.warning;
  if (line.includes('ERROR')) return CONSOLE_LINE_CLASSES.error;
  if (line.startsWith(COMMAND_ECHO_PREFIX)) return CONSOLE_LINE_CLASSES.command;
  return CONSOLE_LINE_CLASSES.default;
}

/**
 * Leading clock of a log line, as most servers print it: `[12:34:56 INFO]`, `[12:34:56] [Server thread/INFO]`,
 * `2026-10-16 12:34:56,123 INFO` or `[2026-10-16T12:34:56.123]`.
 */
const LEADING_TIMESTAMP =
  /^(\[?)(?:\d{4}-\d{2}-\d{2}[ T])?\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?(\]\s*|\s+)/;

/** Removes the leading time from a log line, keeping the rest (`[12:34:56 INFO]: x` -> `[INFO]: x`). */
export function stripTimestamp(line: string): string {
  return line.replace(LEADING_TIMESTAMP, (_match, open: string, close: string) =>
    open && !close.startsWith(']') ? open : ''
  );
}

/** Adds a sent command to the history: no consecutive duplicates, newest last, capped at `limit`. */
export function pushHistory(history: string[], command: string, limit: number): string[] {
  if (limit <= 0) return [];
  const next = history[history.length - 1] === command ? history : [...history, command];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
