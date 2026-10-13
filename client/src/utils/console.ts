export const CONSOLE_LINE_CLASSES = {
  warning: 'text-[#f5a623]',
  error: 'text-[#ee0000]',
  command: 'text-[#50e3c2]',
  default: 'text-[#e5e5e5]'
} as const;

const COMMAND_ECHO_PREFIX = '>';

/** Picks the console text color for a raw server output line. */
export function getConsoleLineClass(line: string): string {
  if (line.includes('WARN')) return CONSOLE_LINE_CLASSES.warning;
  if (line.includes('ERROR')) return CONSOLE_LINE_CLASSES.error;
  if (line.startsWith(COMMAND_ECHO_PREFIX)) return CONSOLE_LINE_CLASSES.command;
  return CONSOLE_LINE_CLASSES.default;
}
