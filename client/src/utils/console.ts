export const CONSOLE_LINE_CLASSES = {
  warning: 'text-warning',
  error: 'text-danger-fg',
  command: 'text-success-fg',
  default: 'text-on-dark'
} as const;

const COMMAND_ECHO_PREFIX = '>';

/** Picks the console text color for a raw server output line. */
export function getConsoleLineClass(line: string): string {
  if (line.includes('WARN')) return CONSOLE_LINE_CLASSES.warning;
  if (line.includes('ERROR')) return CONSOLE_LINE_CLASSES.error;
  if (line.startsWith(COMMAND_ECHO_PREFIX)) return CONSOLE_LINE_CLASSES.command;
  return CONSOLE_LINE_CLASSES.default;
}
