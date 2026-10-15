import type { GameDriverSummary } from '../types/daemon';

/** Process the server runs as, for labels: the Java runtime, or the game's own executable. */
export function processLabel(game: Pick<GameDriverSummary, 'supportsCustomJava' | 'executableName'> | undefined): string {
  if (!game) return '';
  if (game.supportsCustomJava) return 'java';
  const first = game.executableName.split('|')[0] ?? '';
  return first.split(/[\\/]/).pop() ?? first;
}
