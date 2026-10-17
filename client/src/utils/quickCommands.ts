import type { QuickCommand, QuickCommandPrefs } from '../settings/schema';

/** The game's quick commands minus the ones the user hid, followed by the user's own commands. */
export function resolveQuickCommands(gameCommands: QuickCommand[], prefs: QuickCommandPrefs | undefined): QuickCommand[] {
  if (!prefs) return gameCommands;
  const hidden = new Set(prefs.hidden);
  return [...gameCommands.filter((item) => !hidden.has(item.command)), ...prefs.custom];
}
